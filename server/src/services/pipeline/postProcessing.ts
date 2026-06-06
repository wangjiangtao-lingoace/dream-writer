import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { LlmInvokeService } from "../llm/LlmInvokeService";
import { updateCharacterKnowledge } from "./characterKnowledge";

const llmService = new LlmInvokeService();

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
    "pendingPayoffs": ["待回收伏笔标题"]
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
      "knowledge": ["该角色在本章获知的关键信息"]
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
      }
    }

    // 4. 更新钩子状态
    if (Array.isArray(parsed.resolvedHooks)) {
      for (const hookTitle of parsed.resolvedHooks) {
        if (!hookTitle) continue;
        await prisma.hook.updateMany({
          where: { novelId, title: hookTitle, status: { not: "resolved" } },
          data: { status: "resolved", resolvedChapter: chapterOrder },
        }).catch(() => {});
      }
    }

    // 5. 更新伏笔状态
    if (Array.isArray(parsed.paidOffForeshadows)) {
      for (const fsTitle of parsed.paidOffForeshadows) {
        if (!fsTitle) continue;
        await prisma.foreshadow.updateMany({
          where: { novelId, title: fsTitle, status: "planted" },
          data: { status: "paid_off", payoffChapter: chapterOrder },
        }).catch(() => {});
      }
    }

    // 6. 存储章节摘要
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
        },
        update: {
          summary: parsed.chapterSummary.summary || "",
          keyEvents: JSON.stringify(parsed.chapterSummary.keyEvents || []),
          characterStates: JSON.stringify(parsed.characterUpdates || []),
          endingState: parsed.chapterSummary.endingState || "",
          updatedAt: new Date(),
        },
      }).catch(() => {});
    }
  } catch (e) {
    console.warn(`[postProcessing] 合并后处理失败:`, e);
  }
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
 * 从章节内容中提取关键信息，写入 Memory 表
 */
export async function extractMemories(novelId: string, chapterId: string, content: string): Promise<number> {
  const prompt = `请从以下章节内容中提取关键信息。

【章节内容】
${content.slice(0, 2000)}

请提取以下类型的记忆：
1. 世界记忆（world）：世界观设定、规则、地理等
2. 角色记忆（character）：人物特征、关系变化、成长
3. 剧情记忆（plot）：关键事件、转折点、冲突
4. 伏笔记忆（foreshadow）：埋设的伏笔、悬念

请用JSON格式输出：
{
  "memories": [
    { "type": "world", "title": "记忆标题", "content": "记忆内容", "importance": 8 }
  ]
}

只输出 JSON，不要其他文字。`;

  try {
    const result = await llmService.completeText({ prompt, temperature: 0.3, maxTokens: 1000 });
    const parsed = parseLlmJson<any>(result);
    if (!parsed?.memories?.length) return 0;

    let count = 0;
    for (const mem of parsed.memories) {
      if (!mem.title || !mem.content) continue;
      await prisma.memory.create({
        data: {
          novelId,
          type: mem.type || "plot",
          category: "",
          title: mem.title,
          content: mem.content,
          importance: mem.importance || 5,
          chapterId,
        },
      });
      count++;
    }
    return count;
  } catch (e) {
    console.warn("[postProcessing] 记忆提取失败:", e);
    return 0;
  }
}

/**
 * 每章写完后自动更新角色状态、钩子状态、伏笔状态
 * 增强：arcDetail、出场追踪、言语风格
 */
export async function updateCharacterAndTrackerStatus(
  novelId: string,
  chapterOrder: number,
  content: string,
  chapterOutline: any,
): Promise<void> {
  // 收集本章涉及的角色名、钩子标题、伏笔标题
  const involvedCharacters = (chapterOutline?.characters || []).map((c: any) => c.name).filter(Boolean);
  const hooksToResolve = (chapterOutline?.hooksResolved || []).map((h: any) => h.title).filter(Boolean);
  const foreshadowsToPayoff = (chapterOutline?.foreshadowPayoff || []).map((f: any) => f.title).filter(Boolean);

  // 更新出场追踪（纯程序，无 LLM）
  if (involvedCharacters.length > 0) {
    for (const charName of involvedCharacters) {
      prisma.character.updateMany({
        where: { novelId, name: charName },
        data: {
          lastAppear: chapterOrder,
          appearanceCount: { increment: 1 },
        },
      }).catch(() => {});
    }
  }

  if (involvedCharacters.length === 0 && hooksToResolve.length === 0 && foreshadowsToPayoff.length === 0) {
    return;
  }

  const prompt = `请分析以下章节内容，提取角色状态变化和钩子/伏笔回收情况。

【章节内容】
${content.slice(0, 3000)}

【本章出场角色】
${involvedCharacters.join("、") || "无"}

【本章计划回收的钩子】
${hooksToResolve.join("、") || "无"}

【本章计划回收的伏笔】
${foreshadowsToPayoff.join("、") || "无"}

请输出 JSON：
{
  "characterUpdates": [
    {
      "name": "角色名",
      "arcSummary": "该角色在本章的状态变化、关键行为、关系变化，30字以内",
      "arcDetail": "200字详细成长线：从XX到YY的变化，关键转折点，关系变化，能力成长",
      "speechStyle": "该角色的言语风格：粗犷/文雅/简洁/啰嗦/幽默/冷酷"
    }
  ],
  "resolvedHooks": ["实际被回收的钩子标题"],
  "paidOffForeshadows": ["实际被回收的伏笔标题"]
}

只输出 JSON。如果某个钩子/伏笔在本章内容中没有被明确回收，不要列入。`;

  try {
    const result = await llmService.completeText({ prompt, temperature: 0.2, maxTokens: 1200 });
    const parsed = parseLlmJson<any>(result);
    if (!parsed) return;

    // 更新角色 arcSummary + arcDetail + speechStyle
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
      }
    }

    // 更新角色知识范围（异步，不阻塞主流程）
    updateCharacterKnowledge(novelId, chapterOrder, content, involvedCharacters).catch((e) => {
      console.warn(`[postProcessing] 角色知识范围更新失败:`, e);
    });

    // 更新钩子状态
    if (Array.isArray(parsed.resolvedHooks)) {
      for (const hookTitle of parsed.resolvedHooks) {
        if (!hookTitle) continue;
        await prisma.hook.updateMany({
          where: { novelId, title: hookTitle, status: { not: "resolved" } },
          data: { status: "resolved", resolvedChapter: chapterOrder },
        }).catch(() => {});
      }
    }

    // 更新伏笔状态
    if (Array.isArray(parsed.paidOffForeshadows)) {
      for (const fsTitle of parsed.paidOffForeshadows) {
        if (!fsTitle) continue;
        await prisma.foreshadow.updateMany({
          where: { novelId, title: fsTitle, status: "planted" },
          data: { status: "paid_off", payoffChapter: chapterOrder },
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.warn(`[postProcessing] 角色/钩子/伏笔状态更新失败:`, e);
  }
}
