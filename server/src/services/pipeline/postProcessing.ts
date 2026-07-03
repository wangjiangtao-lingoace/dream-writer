import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { LlmInvokeService } from "../llm/LlmInvokeService";
import { autoTransitionState } from "../StoryStateService";
import { checkMilestoneCoverage } from "../MainlineService";
import { captureSnapshot } from "./snapshotService";
import { checkPacing } from "./pacingEngine";
import { detectStyleDeviation, type StyleFingerprint } from "./styleFingerprint";
import { captureCausalLinks } from "./causalChainService";

const llmService = new LlmInvokeService();

const SIMILARITY_THRESHOLD = 0.7;

/**
 * 滑动窗口子串模糊匹配相似度
 * 在 long 中滑动长度为 short.length 的窗口，取字符级匹配率最高值
 */
function substringSimilarity(short: string, long: string): number {
  if (!short || !long) return 0;
  if (long.includes(short)) return 1;

  const sLen = short.length;
  const lLen = long.length;
  if (sLen > lLen) return substringSimilarity(long, short);

  let best = 0;
  for (let i = 0; i <= lLen - sLen; i++) {
    let match = 0;
    for (let j = 0; j < sLen; j++) {
      if (short[j] === long[i + j]) match++;
    }
    const score = match / sLen;
    if (score > best) {
      best = score;
      if (best >= 1) return 1;
    }
  }
  return best;
}

/**
 * 提取关键短语：标题前20字 + 描述前20字
 */
function extractKeywords(title: string, description?: string | null): string[] {
  const keywords: string[] = [];
  if (title) {
    const t = title.slice(0, 20).trim();
    if (t.length >= 2) keywords.push(t);
  }
  if (description) {
    const d = description.slice(0, 20).trim();
    if (d.length >= 2) keywords.push(d);
  }
  return keywords;
}

interface DetectableItem {
  id: string;
  title: string;
  description: string | null;
}

interface DetectionResult {
  resolvedHookIds: string[];
  resolvedForeshadowIds: string[];
  resolvedHookTitles: string[];
  resolvedForeshadowTitles: string[];
}

/**
 * 确定性检测：从正文中检测钩子/伏笔是否已被回收
 * 提取标题/描述前20字作为关键短语，使用滑动窗口模糊匹配（阈值 0.7）
 */
export function detectResolutionsInContent(
  content: string,
  hooks: DetectableItem[],
  foreshadows: DetectableItem[],
): DetectionResult {
  const result: DetectionResult = {
    resolvedHookIds: [],
    resolvedForeshadowIds: [],
    resolvedHookTitles: [],
    resolvedForeshadowTitles: [],
  };

  if (!content || content.length < 50) return result;

  for (const hook of hooks) {
    const keywords = extractKeywords(hook.title, hook.description);
    for (const kw of keywords) {
      if (substringSimilarity(kw, content) >= SIMILARITY_THRESHOLD) {
        result.resolvedHookIds.push(hook.id);
        result.resolvedHookTitles.push(hook.title);
        break;
      }
    }
  }

  for (const fs of foreshadows) {
    const keywords = extractKeywords(fs.title, fs.description);
    for (const kw of keywords) {
      if (substringSimilarity(kw, content) >= SIMILARITY_THRESHOLD) {
        result.resolvedForeshadowIds.push(fs.id);
        result.resolvedForeshadowTitles.push(fs.title);
        break;
      }
    }
  }

  return result;
}

/**
 * 合并后处理：将 storyState + memories + characterStatus + characterKnowledge 合并为 1 次 LLM 调用
 * 原本 5 次 LLM 调用读同一段内容，现在只需 1 次
 */
export async function mergedPostProcessing(
  novelId: string,
  chapterId: string,
  chapterOrder: number,
  content: string,
  chapterOutline: any,
): Promise<void> {
  const involvedCharacters = (chapterOutline?.characters || []).map((c: any) => c.name).filter(Boolean);
  const hooksToResolve = (chapterOutline?.hooksResolved || []).map((h: any) => h.title).filter(Boolean);
  const foreshadowsToPayoff = (chapterOutline?.foreshadowPayoff || []).map((f: any) => f.title).filter(Boolean);

  // 程序化更新出场追踪（无 LLM）
  if (involvedCharacters.length > 0) {
    for (const charName of involvedCharacters) {
      prisma.character.updateMany({
        where: { novelId, name: charName },
        data: { lastAppear: chapterOrder, appearanceCount: { increment: 1 } },
      }).catch(() => {});
    }
  }

  // 保存 StoryState 快照（无 LLM）
  const currentState = await prisma.storyState.findUnique({ where: { novelId } });
  if (currentState) {
    prisma.storyStateLog.upsert({
      where: { novelId_chapterOrder: { novelId, chapterOrder: chapterOrder - 1 } },
      create: { novelId, chapterOrder: chapterOrder - 1, snapshot: JSON.stringify(currentState) },
      update: {},
    }).catch(() => {});
  }

  // ---- 确定性检测：从正文直接检测钩子/伏笔回收（无 LLM） ----
  const [activeHooks, activeForeshadows] = await Promise.all([
    prisma.hook.findMany({
      where: { novelId, status: { in: ["planted", "active"] } },
      select: { id: true, title: true, description: true },
    }),
    prisma.foreshadow.findMany({
      where: { novelId, status: { in: ["planted", "active", "payoff_pending"] } },
      select: { id: true, title: true, description: true },
    }),
  ]);
  const detection = detectResolutionsInContent(content, activeHooks, activeForeshadows);

  // 程序化检测命中的 → 直接更新状态（不等 LLM）
  for (const hookId of detection.resolvedHookIds) {
    await prisma.hook.update({
      where: { id: hookId },
      data: { status: "resolved", resolvedChapter: chapterOrder },
    }).catch(() => {});
  }
  for (const fsId of detection.resolvedForeshadowIds) {
    await prisma.foreshadow.update({
      where: { id: fsId },
      data: { status: "paid_off", payoffChapter: chapterOrder },
    }).catch(() => {});
  }

  // 1 次 LLM 调用，获取所有后处理数据
  const prompt = `请分析以下章节内容，提取全部所需信息。

【章节内容】
${content.slice(0, 3000)}

【本章出场角色】
${involvedCharacters.join("、") || "无"}

【本章计划回收的钩子】
${hooksToResolve.join("、") || "无"}

【本章计划回收的伏笔】
${foreshadowsToPayoff.join("、") || "无"}

请输出 JSON（所有字段必填）：
{
  "storyState": {
    "currentPhase": "setup/development/climax/resolution",
    "protagonistLevel": "主角当前实力变化",
    "protagonistGoal": "主角当前目标",
    "protagonistStatus": "主角当前处境",
    "currentEmotion": "neutral/tension/release/depression/climax",
    "emotionIntensity": 5,
    "tensionAccumulation": 0,
    "activeForeshadows": ["活跃伏笔标题"],
    "pendingPayoffs": ["待回收伏笔标题"],
    "forbiddenActions": ["下一章禁止出现的剧情，如：主角不能死亡、不能出现时间穿越等"],
    "allowedActions": ["下一章允许展开的剧情，如：主角获得新技能、配角出场等"],
    "mainConflict": "当前核心矛盾",
    "lastPleasureChapter": 0,
    "pleasureCooldown": 0
  },
  "memories": [
    { "type": "world/character/plot/foreshadow", "title": "记忆标题", "content": "记忆内容", "importance": 8 }
  ],
  "characterUpdates": [
    {
      "name": "角色名",
      "arcSummary": "30字速查：本章关键行为",
      "arcDetail": "200字成长线：从XX到YY的变化",
      "speechStyle": "粗犷/文雅/简洁/啰嗦/幽默/冷酷",
      "knowledge": ["该角色在本章获知的关键信息"],
      "growthCheckpoint": "若本章角色有明显成长（能力/性格/认知/关系变化），填写50字描述；无成长则留空"
    }
  ],
  "resolvedHooks": ["实际被回收的钩子标题"],
  "paidOffForeshadows": ["实际被回收的伏笔标题"],
  "chapterSummary": {
    "summary": "100字章节摘要",
    "keyEvents": ["关键事件1", "关键事件2"],
    "characterChanges": ["角色变化1"],
    "endingState": "章节结束时的状态描述"
  }
}

只输出 JSON。`;

  // 合并程序化检测与 LLM 检测的标题（去重）
  const allResolvedHookTitles = new Set<string>(detection.resolvedHookTitles);
  const allPaidOffForeshadowTitles = new Set<string>(detection.resolvedForeshadowTitles);

  try {
    const result = await llmService.completeText({ prompt, temperature: 0.3, maxTokens: 2500 });
    const parsed = parseLlmJson<any>(result);
    if (!parsed) return;

    // 1. 更新 StoryState
    if (parsed.storyState) {
      const ss = parsed.storyState;
      await prisma.storyState.upsert({
        where: { novelId },
        update: {
          currentChapter: chapterOrder,
          currentPhase: ss.currentPhase || "development",
          protagonistLevel: ss.protagonistLevel || "",
          protagonistGoal: ss.protagonistGoal || "",
          protagonistStatus: ss.protagonistStatus || "",
          currentEmotion: ss.currentEmotion || "neutral",
          emotionIntensity: ss.emotionIntensity || 5,
          tensionAccumulation: ss.tensionAccumulation || 0,
          activeForeshadows: JSON.stringify(ss.activeForeshadows || []),
          pendingPayoffs: JSON.stringify(ss.pendingPayoffs || []),
          forbiddenActions: JSON.stringify(ss.forbiddenActions || []),
          allowedActions: JSON.stringify(ss.allowedActions || []),
          mainConflict: ss.mainConflict || "",
          lastPleasureChapter: ss.lastPleasureChapter || 0,
          pleasureCooldown: ss.pleasureCooldown || 0,
        },
        create: {
          novelId,
          currentChapter: chapterOrder,
          currentPhase: ss.currentPhase || "development",
          currentEmotion: ss.currentEmotion || "neutral",
        },
      }).catch(() => {});
    }

    // 2. 提取记忆
    if (Array.isArray(parsed.memories)) {
      for (const mem of parsed.memories) {
        if (!mem.title || !mem.content) continue;
        await prisma.memory.create({
          data: {
            novelId, type: mem.type || "plot", category: "",
            title: mem.title, content: mem.content,
            importance: mem.importance || 5, chapterId,
          },
        }).catch(() => {});
      }
    }

    // 3. 更新角色状态
    if (Array.isArray(parsed.characterUpdates)) {
      for (const update of parsed.characterUpdates) {
        if (!update.name) continue;
        const updateData: any = {};
        if (update.arcSummary) updateData.arcSummary = update.arcSummary;
        if (update.arcDetail) updateData.arcDetail = update.arcDetail;
        if (update.speechStyle) updateData.speechStyle = update.speechStyle;
        if (Object.keys(updateData).length > 0) {
          await prisma.character.updateMany({
            where: { novelId, name: update.name },
            data: updateData,
          }).catch(() => {});
        }
        // 更新角色知识范围
        if (update.knowledge?.length) {
          const character = await prisma.character.findFirst({
            where: { novelId, name: update.name },
            select: { id: true, knowledgeScope: true },
          });
          if (character) {
            let existing: Array<{ chapter: number; knowledge: string[] }> = [];
            try { existing = JSON.parse(character.knowledgeScope || "[]"); } catch { existing = []; }
            existing.push({ chapter: chapterOrder, knowledge: update.knowledge });
            if (existing.length > 100) existing = existing.slice(-100);
            await prisma.character.update({
              where: { id: character.id },
              data: { knowledgeScope: JSON.stringify(existing) },
            }).catch(() => {});
          }
        }
        // 更新角色成长检查点
        if (update.growthCheckpoint) {
          const charRecord = await prisma.character.findFirst({
            where: { novelId, name: update.name },
            select: { id: true, growthCheckpoints: true },
          });
          if (charRecord) {
            let checkpoints: Array<{ chapter: number; description: string; type: string; createdAt: string }> = [];
            try { checkpoints = JSON.parse(charRecord.growthCheckpoints || "[]"); } catch { checkpoints = []; }
            // 避免同一章节重复记录
            const alreadyHas = checkpoints.some(cp => cp.chapter === chapterOrder);
            if (!alreadyHas) {
              checkpoints.push({
                chapter: chapterOrder,
                description: update.growthCheckpoint,
                type: "auto",
                createdAt: new Date().toISOString(),
              });
              if (checkpoints.length > 50) checkpoints = checkpoints.slice(-50);
              await prisma.character.update({
                where: { id: charRecord.id },
                data: { growthCheckpoints: JSON.stringify(checkpoints) },
              }).catch(() => {});
            }
          }
        }
      }
    }

    // 4. 更新钩子状态（LLM 检测 + 合并程序化结果）
    if (Array.isArray(parsed.resolvedHooks)) {
      for (const hookTitle of parsed.resolvedHooks) {
        if (!hookTitle) continue;
        allResolvedHookTitles.add(hookTitle);
        await prisma.hook.updateMany({
          where: { novelId, title: hookTitle, status: { not: "resolved" } },
          data: { status: "resolved", resolvedChapter: chapterOrder },
        }).catch(() => {});
      }
    }

    // 5. 更新伏笔状态（LLM 检测 + 合并程序化结果）
    if (Array.isArray(parsed.paidOffForeshadows)) {
      for (const fsTitle of parsed.paidOffForeshadows) {
        if (!fsTitle) continue;
        allPaidOffForeshadowTitles.add(fsTitle);
        await prisma.foreshadow.updateMany({
          where: { novelId, title: fsTitle, status: { in: ["planted", "active", "payoff_pending"] } },
          data: { status: "paid_off", payoffChapter: chapterOrder },
        }).catch(() => {});
      }
    }

    // 6. 存储章节摘要（包含 resolvedForeshadows）
    if (parsed.chapterSummary) {
      await prisma.chapterSummary.upsert({
        where: { novelId_chapterOrder: { novelId, chapterOrder } },
        create: {
          novelId, chapterOrder,
          title: `第${chapterOrder}章`,
          summary: parsed.chapterSummary.summary || "",
          keyEvents: JSON.stringify(parsed.chapterSummary.keyEvents || []),
          characterStates: JSON.stringify(parsed.characterUpdates || []),
          endingState: parsed.chapterSummary.endingState || "",
          resolvedHooks: JSON.stringify([...allResolvedHookTitles]),
          resolvedForeshadows: JSON.stringify([...allPaidOffForeshadowTitles]),
        },
        update: {
          summary: parsed.chapterSummary.summary || "",
          keyEvents: JSON.stringify(parsed.chapterSummary.keyEvents || []),
          characterStates: JSON.stringify(parsed.characterUpdates || []),
          endingState: parsed.chapterSummary.endingState || "",
          resolvedHooks: JSON.stringify([...allResolvedHookTitles]),
          resolvedForeshadows: JSON.stringify([...allPaidOffForeshadowTitles]),
          updatedAt: new Date(),
        },
      }).catch(() => {});
    }

    // 7. 生成章节快照（不阻塞主流程）
    captureSnapshot(novelId, chapterOrder, chapterId, {
      ...parsed,
      resolvedHooks: [...allResolvedHookTitles],
      paidOffForeshadows: [...allPaidOffForeshadowTitles],
    }).catch((e) => {
      console.warn(`[postProcessing] 章节快照生成失败:`, e);
    });

    // 8. 因果链提取（不阻塞主流程）
    captureCausalLinks(novelId, chapterOrder, {
      chapterSummary: parsed.chapterSummary,
      resolvedHooks: [...allResolvedHookTitles],
      paidOffForeshadows: [...allPaidOffForeshadowTitles],
      characterUpdates: parsed.characterUpdates,
      storyState: parsed.storyState,
    }).catch((e) => {
      console.warn(`[postProcessing] 因果链提取失败:`, e);
    });
  } catch (e) {
    console.warn(`[postProcessing] 合并后处理失败:`, e);
  }

  // 章节后处理完成后，触发状态自动流转检查（不阻塞主流程）
  autoTransitionState(novelId, chapterOrder).catch((e) => {
    console.warn(`[postProcessing] 自动状态流转检查失败:`, e);
  });

  // 主线里程碑自动追踪（不阻塞主流程）
  checkMilestoneCoverage(novelId, content, chapterOrder).catch((e) => {
    console.warn(`[postProcessing] 主线里程碑追踪失败:`, e);
  });

  // 节奏检测（不阻塞主流程）
  checkPacing(novelId, chapterOrder, content).then((issues) => {
    if (issues.length > 0) {
      const criticals = issues.filter((i) => i.severity === "critical");
      if (criticals.length > 0) {
        console.warn(`[pacing] 第${chapterOrder}章发现 ${criticals.length} 个严重节奏问题:`,
          criticals.map((i) => i.message));
      }
      console.info(`[pacing] 第${chapterOrder}章节奏检测结果:`,
        issues.map((i) => `[${i.severity}] ${i.rule}: ${i.message}`));
    }
  }).catch((e) => {
    console.warn(`[postProcessing] 节奏检测失败:`, e);
  });

  // 风格偏离检测（不阻塞主流程）
  checkStyleDeviation(novelId, chapterOrder, content).catch((e) => {
    console.warn(`[postProcessing] 风格偏离检测失败:`, e);
  });
}

/**
 * 分析章节内容，更新 StoryState（剧情状态机）
 * 更新前保存历史快照到 StoryStateLog
 */
export async function updateStoryState(novelId: string, chapterOrder: number, content: string): Promise<void> {
  // 保存当前状态快照到 StoryStateLog
  const currentState = await prisma.storyState.findUnique({ where: { novelId } });
  if (currentState) {
    prisma.storyStateLog.upsert({
      where: { novelId_chapterOrder: { novelId, chapterOrder: chapterOrder - 1 } },
      create: {
        novelId,
        chapterOrder: chapterOrder - 1,
        snapshot: JSON.stringify(currentState),
      },
      update: {},
    }).catch(() => {});
  }

  const prompt = `请分析以下章节内容，提取剧情状态变化。

【章节内容】
${content.slice(0, 2000)}

请输出 JSON：
{
  "currentPhase": "setup/development/climax/resolution",
  "protagonistLevel": "主角当前等级或实力变化",
  "protagonistGoal": "主角当前目标",
  "protagonistStatus": "主角当前处境",
  "currentEmotion": "neutral/tension/release/depression/climax",
  "emotionIntensity": 5,
  "tensionAccumulation": 0,
  "activeForeshadows": ["活跃伏笔标题"],
  "pendingPayoffs": ["待回收伏笔标题"]
}

只输出 JSON，不要其他文字。`;

  try {
    const result = await llmService.completeText({ prompt, temperature: 0.3, maxTokens: 800 });
    const parsed = parseLlmJson<any>(result);
    if (!parsed) return;

    await prisma.storyState.upsert({
      where: { novelId },
      update: {
        currentChapter: chapterOrder,
        currentPhase: parsed.currentPhase || "development",
        protagonistLevel: parsed.protagonistLevel || "",
        protagonistGoal: parsed.protagonistGoal || "",
        protagonistStatus: parsed.protagonistStatus || "",
        currentEmotion: parsed.currentEmotion || "neutral",
        emotionIntensity: parsed.emotionIntensity || 5,
        tensionAccumulation: parsed.tensionAccumulation || 0,
        activeForeshadows: JSON.stringify(parsed.activeForeshadows || []),
        pendingPayoffs: JSON.stringify(parsed.pendingPayoffs || []),
      },
      create: {
        novelId,
        currentChapter: chapterOrder,
        currentPhase: parsed.currentPhase || "development",
        currentEmotion: parsed.currentEmotion || "neutral",
      },
    });
  } catch (e) {
    console.warn("[postProcessing] StoryState 更新失败:", e);
  }
}

/**
 * 风格偏离检测：读取缓存指纹，检测生成内容的偏离度
 * 偏离度 > 5 时记录 warning 日志
 */
async function checkStyleDeviation(novelId: string, chapterOrder: number, content: string): Promise<void> {
  try {
    const styleProfile = await prisma.styleProfile.findFirst({
      where: { novelId, isDefault: true },
      select: { fingerprint: true },
    });

    if (!styleProfile?.fingerprint) return;

    const fp: StyleFingerprint = JSON.parse(styleProfile.fingerprint);
    const result = detectStyleDeviation(fp, content);

    if (result.deviationScore > 5) {
      console.warn(
        `[styleFingerprint] 第${chapterOrder}章风格偏离严重（偏离度：${result.deviationScore}/10）：`,
        result.deviations.map(d => `${d.dimension}：期望${d.expected}，实际${d.actual}`).join("；")
      );
    } else if (result.deviationScore > 3) {
      console.info(
        `[styleFingerprint] 第${chapterOrder}章风格偏离警告（偏离度：${result.deviationScore}/10）：`,
        result.deviations.map(d => `${d.dimension}：期望${d.expected}，实际${d.actual}`).join("；")
      );
    }
  } catch (e) {
    console.warn(`[styleFingerprint] 风格偏离检测异常:`, e);
  }
}
