import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";
import { mergedPostProcessing } from "./postProcessing";
import { autoManageMemories } from "../MemoryCompressionService";
import { ContextAssembler } from "./contextAssembler";
import { validateChapterQuality } from "./qualityCheck";
import { QUALITY_THRESHOLDS } from "./writingRules";
import { runPeriodicConsistencyCheck, persistPeriodicCheckResults } from "./periodicCheck";

export async function executeWritingPhase(ctx: PhaseContext, jobId: string, startOrder?: number) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  let draftCount = Math.max(1, config.autoDraftChapters || 3);

  // P0 #2: maxChaptersPerBatch 限制
  if (config.maxChaptersPerBatch && config.maxChaptersPerBatch > 0) {
    draftCount = Math.min(draftCount, config.maxChaptersPerBatch);
  }

  try {
    await ctx.updateJobProgress(jobId, "writing", "chapter_drafts");
    const { chapters, budgetReached } = await generateInitialChapterDrafts(ctx, jobId, job.novelId, config, draftCount, startOrder, job.createdAt);
    await ctx.savePhaseResult(jobId, "writing", "chapter_drafts", {
      imitationPlanId: config.imitationPlanId,
      bookAnalysisId: config.bookAnalysisId,
      draftCount,
      budgetReached,
    }, { chapters });
    await ctx.saveToKnowledgeBase(job.novelId, "chapter_draft", "自动仿写样章", { chapters });

    // 重建 enrichedChaptersMap（用于后处理）
    const enrichedChaptersMap: Map<number, any> = new Map();
    const volumeCount = config.volumeCount || 5;
    let globalOrder = 1;
    for (let v = 1; v <= volumeCount; v++) {
      const volRes = await prisma.phaseResult.findUnique({
        where: { jobId_phase_step: { jobId, phase: "planning", step: `chapter_outline_vol_${v}` } },
      });
      if (volRes) {
        const parsed = parseLlmJson(volRes.output) || {};
        for (const ch of (parsed?.chapters || [])) {
          enrichedChaptersMap.set(globalOrder, ch);
          globalOrder++;
        }
      }
    }

    // 后处理：合并为 1 次 LLM 调用（storyState + memories + characterStatus + knowledge）
    for (const ch of chapters) {
      if ((ch as any).skipped || !ch.content) continue;
      try {
        const enrichedChapter = enrichedChaptersMap.get(ch.order) || {};
        await mergedPostProcessing(job.novelId, ch.id, ch.order, ch.content, enrichedChapter);
        await autoManageMemories(job.novelId, ch.order);
      } catch (e) {
        console.warn(`[writingPhase] 第${ch.order}章后处理失败:`, e);
      }
    }

    // 章纲修正：写完一卷后检查偏离度，修正下一卷章纲
    if (config.pipelineVersion && config.pipelineVersion >= 2) {
      await correctNextVolumeOutlines(ctx, jobId, job.novelId, config, chapters).catch((e) => {
        console.warn("[writingPhase] 章纲修正失败:", e);
      });
    }

    // 检查是否有部分章节失败
    const writtenCount = chapters.filter((c: any) => !c.skipped).length;
    const skippedCount = chapters.filter((c: any) => c.skipped).length;

    if (writtenCount === 0 && skippedCount === 0 && !budgetReached) {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: {
          status: "error",
          currentPhase: "writing",
          currentStep: "chapter_drafts",
          lastError: "所有章节生成失败。",
        },
      });
    } else if (budgetReached) {
      // P0 #1: Token 预算耗尽，暂停等待用户决策
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: {
          status: "paused",
          currentPhase: "writing",
          currentStep: "token_budget_reached",
          lastError: "Token 预算已达上限，请确认后继续或调整预算。",
        },
      });
    } else {
      // P0 #2: 检查是否还有更多章节需要写（批次限制）
      const totalChapters = (config.volumeCount || 5) * (config.chaptersPerVolume || 30);
      const totalWritten = await prisma.chapter.count({
        where: { novelId: job.novelId, content: { not: "" } },
      });
      if (config.maxChaptersPerBatch && config.maxChaptersPerBatch > 0 && totalWritten < totalChapters) {
        // 还有更多章节，暂停等待确认
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: {
            status: "paused",
            currentPhase: "writing",
            currentStep: "batch_completed",
            lastError: `已完成本批次 ${writtenCount} 章（共已写 ${totalWritten}/${totalChapters} 章），请确认后继续。`,
          },
        });
      } else {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: {
            status: "completed",
            currentPhase: "writing",
            currentStep: "completed",
            progress: 100,
          },
        });
      }
    }
  } catch (error: any) {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        currentPhase: "writing",
        currentStep: "chapter_drafts",
        lastError: error.message || "自动仿写正文失败。",
      },
    });
  }
}

async function generateInitialChapterDrafts(ctx: PhaseContext, jobId: string, novelId: string, config: PipelineConfig, count: number, startOrder?: number, pipelineStartedAt?: Date) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: { chapters: { orderBy: { order: "asc" } } },
  });
  if (!novel) throw new Error("作品不存在");

  const pipelineVersion = config.pipelineVersion || 1;

  // P0 #1: Token 预算追踪
  const tokenBudget = config.tokenBudget ? config.tokenBudget * 1000 : 0; // 前端传的是 1K 单位，转为实际 tokens
  let cumulativeTokens = 0;
  let budgetReached = false;

  const assembler = new ContextAssembler(novelId);

  const [plan, outlineResult, chapterOutlineResult] = await Promise.all([
    config.imitationPlanId
      ? prisma.imitationPlan.findFirst({ where: { id: config.imitationPlanId, novelId } })
      : Promise.resolve(null),
    prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: pipelineVersion >= 2 ? "outline" : "planning", step: "outline" } },
    }),
    pipelineVersion >= 2
      ? prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "planning", step: "chapter_outline_vol_1" } },
        })
      : prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "structuring", step: "chapter_outline" } },
        }),
  ]);

  const blueprint = ctx.safeJson(plan?.blueprint, {});
  const chapterTemplate = ctx.safeJson(plan?.chapterTemplate, {});
  const sampleDrafts = ctx.safeJson(plan?.sampleDrafts, []);
  const outline = outlineResult ? parseLlmJson(outlineResult.output) || {} : {};
  const chapterOutline = chapterOutlineResult ? parseLlmJson(chapterOutlineResult.output) || {} : {};

  // 从 planning 阶段加载所有卷的富化章纲
  const enrichedChaptersMap: Map<number, any> = new Map();
  if (pipelineVersion >= 2) {
    const volumeCount = config.volumeCount || 5;
    let globalOrder = 1;
    for (let v = 1; v <= volumeCount; v++) {
      const volRes = await prisma.phaseResult.findUnique({
        where: { jobId_phase_step: { jobId, phase: "planning", step: `chapter_outline_vol_${v}` } },
      });
      if (volRes) {
        const parsed = parseLlmJson(volRes.output) || {};
        for (const ch of (parsed?.chapters || [])) {
          enrichedChaptersMap.set(globalOrder, ch);
          globalOrder++;
        }
      }
    }
  }

  const chapterCards = resolveChapterCards(chapterTemplate, chapterOutline, count);
  const previousChapters: Array<{ order: number; title: string; summary: string; ending: string }> = [];
  const generated = [];
  const failedChapters: Array<{ order: number; error: string }> = [];
  const offset = (startOrder || 1) - 1;

  for (let index = 0; index < count; index += 1) {
    // 检查暂停状态，实现即时暂停
    const currentJob = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
    if (currentJob?.status === "paused" || currentJob?.status === "error") {
      console.log(`[writingPhase] 流程已${currentJob.status === "paused" ? "暂停" : "异常"}，停止写作`);
      break;
    }

    // P0 #1: Token 预算检查
    if (tokenBudget > 0 && cumulativeTokens >= tokenBudget) {
      console.log(`[writingPhase] Token 预算已达上限（已用 ${cumulativeTokens} / 预算 ${tokenBudget}），停止写作`);
      budgetReached = true;
      break;
    }

    const order = offset + index + 1;
    const card = enrichedChaptersMap.get(order) || (chapterCards[index] ?? {});

    try {
      const baseTitle = card.title || card.chapterTitle || `第${order}章`;
      const existingTitles = generated.map((c: any) => c.title).filter(Boolean);
      const title = await resolveGeneratedChapterTitle(ctx, {
        novel,
        outline,
        blueprint,
        card,
        order,
        baseTitle,
        existingTitles,
      });
      const summary = [
        card.goal ? `目标：${card.goal}` : "",
        card.function ? `功能：${card.function}` : "",
        card.conflict ? `冲突：${card.conflict}` : "",
        card.hook ? `钩子：${card.hook}` : "",
      ].filter(Boolean).join("\n") || `基于仿写方案生成第 ${order} 章。`;

      const existing = await prisma.chapter.findUnique({
        where: { novelId_order: { novelId, order } },
      });
      if (existing?.content?.trim() && !config.overwriteExistingChapters) {
        previousChapters.push({
          order,
          title: existing.title,
          summary: existing.summary || existing.content.slice(0, 100),
          ending: existing.content.slice(-300),
        });
        generated.push({
          ...existing,
          skipped: true,
          skipReason: "existing_content",
        });
        continue;
      }

      // P0 #2: 并发覆盖保护 — 用户在 Pipeline 启动后手动编辑过的章节，跳过写入
      if (existing?.content?.trim() && pipelineStartedAt && existing.updatedAt > pipelineStartedAt) {
        console.log(`[writingPhase] 第${order}章已被用户手动编辑（updatedAt=${existing.updatedAt.toISOString()}），跳过 Pipeline 写入`);
        previousChapters.push({
          order,
          title: existing.title,
          summary: existing.summary || existing.content.slice(0, 100),
          ending: existing.content.slice(-300),
        });
        generated.push({
          ...existing,
          skipped: true,
          skipReason: "user_edited_after_pipeline_start",
        });
        continue;
      }

      const chapter = existing ?? await prisma.chapter.create({
        data: {
          novelId,
          order,
          title,
          summary,
          status: "planned",
          source: "imitation_pipeline",
        },
      });
      if (existing) {
        await prisma.chapter.update({
          where: { id: existing.id },
          data: { title, summary, source: "imitation_pipeline" },
        });
      }

      // 使用 ContextAssembler 组装精简上下文（~1,500 tokens vs 旧 ~15,000）
      const compactContext = await assembler.assembleForChapter(order, enrichedChaptersMap.get(order) || card);
      const targetWordCount = config.targetWordCount || 2500;

      // 构建人物约束（知识边界 + 人设 + 言语风格 + 关系状态）
      const { buildCharacterConstraints } = await import("./characterConstraints");
      const characterConstraints = await buildCharacterConstraints(novelId, order).catch((e) => {
        console.warn(`[writingPhase] 人物约束构建失败:`, e);
        return "";
      });

      // 写作 + 质量后验循环（最多重试 MAX_RETRY_COUNT 次）
      let draft = await generateChapterDraft(ctx, {
        novel,
        outline,
        blueprint,
        chapterTemplate,
        sampleDrafts,
        card,
        order,
        title,
        summary,
        previousChapters,
        compactContext,
        targetWordCount,
        characterConstraints,
      });

      let retryCount = 0;
      let qualityResult = await validateChapterQuality(ctx, novelId, order, draft, targetWordCount, card);

      while (!qualityResult.passed && qualityResult.shouldRetry && retryCount < QUALITY_THRESHOLDS.MAX_RETRY_COUNT) {
        retryCount++;
        console.log(`[writingPhase] 第${order}章质量不合格，第${retryCount}次重试：${qualityResult.retryHint}`);
        draft = await generateChapterDraft(ctx, {
          novel,
          outline,
          blueprint,
          chapterTemplate,
          sampleDrafts,
          card,
          order,
          title,
          summary,
          previousChapters,
          compactContext,
          targetWordCount,
          characterConstraints,
          retryHint: qualityResult.retryHint,
        });
        qualityResult = await validateChapterQuality(ctx, novelId, order, draft, targetWordCount, card);
      }

      // 保存质量日志
      await prisma.chapterQualityLog.create({
        data: {
          novelId,
          chapterOrder: order,
          checkType: "post_gen",
          scores: JSON.stringify(qualityResult.scores),
          issues: JSON.stringify(qualityResult.issues),
          retryCount,
          passed: qualityResult.passed,
        },
      }).catch((e) => console.warn(`[writingPhase] 质量日志保存失败:`, e));

      // 更新 Chapter 质量字段（基于 AI 味和字数合规度计算）
      const qualityScore = qualityResult.passed ? 8 : 5;

      const updated = await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          title,
          summary,
          content: draft,
          wordCount: ctx.countWords(draft),
          status: "drafted",
          source: config.imitationPlanId ? "imitation_pipeline" : "pipeline",
          qualityScore,
          aiSmellCount: Math.round(qualityResult.scores.aiSmell * draft.length / 100),
          reviewStatus: qualityResult.passed ? "approved" : "reviewed",
        },
      });

      // 章级概要（用正文前 100 字，不再调 LLM）
      const quickSummary = draft.slice(0, 100).replace(/\n/g, " ");
      previousChapters.push({ order, title, summary: quickSummary, ending: draft.slice(-300) });

      // 每 10 章运行一次周期性一致性检查
      if (order % 10 === 0) {
        runPeriodicConsistencyCheck(ctx, novelId, order).then(async (checkResult) => {
          await persistPeriodicCheckResults(novelId, order, checkResult);
          const totalAlerts = checkResult.hookAlerts.length + checkResult.foreshadowAlerts.length +
            checkResult.characterDrifts.length + checkResult.emotionIssues.length;
          if (totalAlerts > 0) {
            console.log(`[writingPhase] 第${order}章周期性检查发现${totalAlerts}个问题`);
          }
        }).catch((e) => console.warn(`[writingPhase] 周期性检查失败:`, e));
      }

      generated.push(updated);

      // P0 #1: 累计 token 估算（中文字符 * 1.5 ≈ tokens，加上 prompt 开销）
      const chapterTokens = Math.round(draft.length * 1.5 + 1500);
      cumulativeTokens += chapterTokens;
      if (tokenBudget > 0) {
        console.log(`[writingPhase] 第${order}章 token 估算: ${chapterTokens}，累计: ${cumulativeTokens}/${tokenBudget}`);
      }
    } catch (e: any) {
      console.warn(`[writingPhase] 第${order}章生成失败，继续下一章:`, e.message);
      failedChapters.push({ order, error: e.message || "unknown" });

      // 保存失败信息到章节记录，避免数据丢失
      try {
        const existingChapter = await prisma.chapter.findUnique({
          where: { novelId_order: { novelId, order } },
        });
        if (existingChapter && !existingChapter.content?.trim()) {
          await prisma.chapter.update({
            where: { id: existingChapter.id },
            data: {
              summary: `[生成失败] ${e.message || "未知错误"}`,
              status: "failed",
            },
          });
        }
      } catch { /* ignore cleanup errors */ }
    }

    // 章节级进度更新 + checkpoint
    const chapterProgress = Math.round(((index + 1) / count) * 100);
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: {
        progress: chapterProgress,
        currentStep: `chapter_${order}`,
      },
    }).catch(() => {});
  }

  // 批次完成后报告失败章节
  if (failedChapters.length > 0) {
    console.warn(`[writingPhase] 批次完成，${failedChapters.length}章失败：`, failedChapters.map(f => `第${f.order}章`).join("、"));
  }

  // 自动续写调度（如果启用了 autoContinue，且未触发预算/批次暂停）
  if (config.autoContinue && !budgetReached) {
    const totalChapters = (config.volumeCount || 5) * (config.chaptersPerVolume || 30);
    const totalWritten = await prisma.chapter.count({
      where: { novelId, content: { not: "" } },
    });
    // 如果设置了批次限制且还有更多章节，不触发自动续写（由 executeWritingPhase 设置暂停状态）
    const batchLimited = config.maxChaptersPerBatch && config.maxChaptersPerBatch > 0 && totalWritten < totalChapters;
    if (!batchLimited) {
      const { scheduleNextBatch } = await import("./autoScheduler");
      scheduleNextBatch(novelId, jobId, config).catch((e) => {
        console.warn("[writingPhase] 自动续写调度失败:", e);
      });
    }
  }

  return { chapters: generated, budgetReached };
}

async function generateChapterDraft(ctx: PhaseContext, input: {
  novel: { title: string; inspiration?: string | null; outline?: string | null; genre?: string | null };
  outline: any;
  blueprint: any;
  chapterTemplate: any;
  sampleDrafts: any[];
  card: any;
  order: number;
  title: string;
  summary: string;
  previousChapters: Array<{ order: number; title: string; summary: string; ending: string }>;
  compactContext: string;
  targetWordCount: number;
  retryHint?: string;
  characterConstraints?: string;
}) {
  const { WRITING_SYSTEM_PROMPT } = await import("./writingRules");
  const system = WRITING_SYSTEM_PROMPT;

  const retrySection = input.retryHint
    ? `\n【重试修正要求 — 必须严格遵守】\n上一版存在以下问题，请务必修正：\n${input.retryHint}\n`
    : "";

  const characterSection = input.characterConstraints
    ? `\n${input.characterConstraints}\n`
    : "";

  const prompt = `请为「${input.novel.title}」写第${input.order}章的完整正文。

${input.compactContext}
${characterSection}
【写作要求】
1. 输出纯正文，不要 Markdown 标记，不要提纲，不要解释
2. 目标字数：${input.targetWordCount} 中文字（不少于 ${Math.round(input.targetWordCount * 0.8)} 字，不超过 ${Math.round(input.targetWordCount * 1.2)} 字）
3. 场景转换用空行分隔，不要用「场景一」「场景二」这样的标记
4. 对话用引号「」标注，不要用 ""
5. 第一章必须在前 300 字内建立冲突或悬念，不要用风景描写开头
6. 每段不超过 4 行，保持阅读节奏
7. 必须使用第三人称视角（他/她/角色名），禁止使用「我」「我们」
8. ⚠️ 必须严格遵守【人物约束】中的所有规则：
   - 角色不能做"绝不会做"的事
   - 角色不能知道他们"不应该知道"的信息
   - 言语风格必须符合设定
   - 角色关系必须符合当前章节状态
${retrySection}
请开始写作：`;

  const result = await ctx.llmService.completeText({
    system,
    prompt,
    temperature: 0.78,
    maxTokens: Math.max(3000, Math.min(5000, Math.round(input.targetWordCount * 2))),
  });

  return result?.trim() || ctx.buildFallbackChapterDraft(input);
}

/**
 * 轻量章级概要生成（50-100字，maxTokens=150）
 */
export async function generateQuickSummary(ctx: PhaseContext, content: string): Promise<string> {
  try {
    const result = await ctx.llmService.completeText({
      system: "用50-100字总结以下章节的核心内容。只输出摘要文本，不要JSON，不要其他内容。",
      prompt: content.slice(0, 3000),
      temperature: 0.2,
      maxTokens: 150,
    });
    return result?.trim() || content.slice(0, 100);
  } catch {
    return content.slice(0, 100);
  }
}

/**
 * 结构化章级概要生成（存入 ChapterSummary 表，供 ContextAssembler 使用）
 */
export async function generateChapterSummary(
  ctx: PhaseContext, chapterOrder: number, chapterTitle: string, content: string,
): Promise<{ summary: string; keyEvents: string; characterStates: string; endingState: string; newHooks: string; resolvedHooks: string }> {
  try {
    const result = await ctx.llmService.completeText({
      system: `你是一位小说编辑。分析章节内容，输出JSON概要。只输出JSON，无其他内容。`,
      prompt: `第${chapterOrder}章「${chapterTitle}」

${content.slice(0, 3000)}

请输出JSON：
{
  "summary": "100-200字的章节概要",
  "keyEvents": ["关键事件1", "关键事件2"],
  "characterStates": {"角色名": "该角色在本章的状态变化"},
  "endingState": "章末状态描述（场景、人物处境、悬念）",
  "newHooks": ["新开钩子1"],
  "resolvedHooks": ["回收钩子1"]
}`,
      temperature: 0.2,
      maxTokens: 400,
    });
    const parsed = parseLlmJson(result) || {};
    return {
      summary: parsed.summary || content.slice(0, 200),
      keyEvents: JSON.stringify(parsed.keyEvents || []),
      characterStates: JSON.stringify(parsed.characterStates || {}),
      endingState: parsed.endingState || content.slice(-200),
      newHooks: JSON.stringify(parsed.newHooks || []),
      resolvedHooks: JSON.stringify(parsed.resolvedHooks || []),
    };
  } catch {
    return {
      summary: content.slice(0, 200),
      keyEvents: "[]",
      characterStates: "{}",
      endingState: content.slice(-200),
      newHooks: "[]",
      resolvedHooks: "[]",
    };
  }
}

async function resolveGeneratedChapterTitle(ctx: PhaseContext, input: {
  novel: { title: string; genre?: string | null };
  outline: any;
  blueprint: any;
  card: any;
  order: number;
  baseTitle: string;
  existingTitles?: string[];
}) {
  const genericTitlePattern = /^第[一二三四五六七八九十百千万\d]+章$/;
  if (input.baseTitle && !genericTitlePattern.test(input.baseTitle.trim())) {
    return input.baseTitle.trim();
  }

  const card = input.card || {};
  const coreInfo: string[] = [];
  if (card.goal) coreInfo.push(`本章目标：${card.goal}`);
  if (card.conflict) coreInfo.push(`核心冲突：${card.conflict}`);
  if (card.hook) coreInfo.push(`章末钩子：${card.hook}`);
  if (card.characters?.length) {
    const names = card.characters.map((c: any) => c.name).filter(Boolean).join("、");
    if (names) coreInfo.push(`出场角色：${names}`);
  }

  const dedupSection = input.existingTitles?.length
    ? `\n【已有标题（禁止重复或相似）】\n${input.existingTitles.slice(-20).join("、")}`
    : "";

  const prompt = [
    "请为当前小说章节生成一个有吸引力的中文章节标题。",
    "",
    "要求：",
    "- 5-15个字，不要包含「第X章」，不要使用书名号，不要解释",
    "- 标题必须与本章的核心冲突或钩子强相关，让读者产生好奇心",
    "- 避免平淡概括（如「XX的抉择」），优先使用悬念式、冲突式、反转式标题",
    "- 不要与已有标题重复或使用相似结构",
    "",
    `作品：${input.novel.title}`,
    `类型：${input.novel.genre || input.outline.genre || input.blueprint.genre || "未指定"}`,
    `章节序号：第${input.order}章`,
    "",
    "【本章核心信息】",
    coreInfo.join("\n") || JSON.stringify(card, null, 2).slice(0, 800),
    dedupSection,
  ].join("\n");

  try {
    const result = await ctx.llmService.completeText({
      prompt,
      temperature: 0.72,
      maxTokens: 80,
    });
    const title = result?.trim().replace(/^["'《""]+|["'》""]+$/g, "").replace(/^第[一二三四五六七八九十百千万\d]+章[:：\s-]*/, "");
    return title || input.baseTitle || `第${input.order}章`;
  } catch {
    return input.baseTitle || `第${input.order}章`;
  }
}

function resolveChapterCards(chapterTemplate: any, chapterOutline: any, count: number) {
  const templateChapters = Array.isArray(chapterTemplate?.volumes)
    ? chapterTemplate.volumes.flatMap((volume: any) => Array.isArray(volume.chapters) ? volume.chapters : [])
    : [];
  const outlineChapters = Array.isArray(chapterOutline?.chapterOutlines)
    ? chapterOutline.chapterOutlines.flatMap((volume: any) => Array.isArray(volume.chapters) ? volume.chapters : [])
    : [];
  return [...templateChapters, ...outlineChapters].slice(0, count);
}

/**
 * 章纲修正：写完一卷后检查实际内容与计划的偏离度，修正下一卷章纲
 */
async function correctNextVolumeOutlines(
  ctx: PhaseContext,
  jobId: string,
  novelId: string,
  config: PipelineConfig,
  writtenChapters: Array<{ order: number; title: string; content?: string }>,
) {
  const volumeCount = config.volumeCount || 5;
  const chaptersPerVolume = config.chaptersPerVolume || 30;

  // 计算已写完几卷
  const totalWritten = await prisma.chapter.count({
    where: { novelId, content: { not: "" } },
  });
  const completedVolumes = Math.floor(totalWritten / chaptersPerVolume);

  if (completedVolumes <= 0 || completedVolumes >= volumeCount) return;

  // 加载刚完成的那一卷的章纲
  const completedVolRes = await prisma.phaseResult.findUnique({
    where: { jobId_phase_step: { jobId, phase: "planning", step: `chapter_outline_vol_${completedVolumes}` } },
  });
  if (!completedVolRes) return;

  const plannedOutlines = parseLlmJson(completedVolRes.output)?.chapters || [];
  if (plannedOutlines.length === 0) return;

  // 加载实际写完的章节概要
  const volStartOrder = (completedVolumes - 1) * chaptersPerVolume + 1;
  const volEndOrder = completedVolumes * chaptersPerVolume;
  const actualSummaries = await prisma.chapterSummary.findMany({
    where: { novelId, chapterOrder: { gte: volStartOrder, lte: volEndOrder } },
    orderBy: { chapterOrder: "asc" },
    select: { chapterOrder: true, title: true, summary: true },
  });

  if (actualSummaries.length < plannedOutlines.length * 0.5) return;

  // 用 LLM 检查偏离度
  const plannedSummary = plannedOutlines.slice(0, 20).map((ch: any, i: number) =>
    `第${volStartOrder + i}章 计划：${ch.title} | 目标：${ch.goal || ""} | 冲突：${ch.conflict || ""}`
  ).join("\n");

  const actualSummary = actualSummaries.slice(0, 20).map(ch =>
    `第${ch.chapterOrder}章 实际：${ch.title} | 摘要：${ch.summary}`
  ).join("\n");

  const deviationPrompt = `请比较以下卷纲计划与实际写作内容的偏离度，从三个维度评分。

【第${completedVolumes}卷计划章纲】
${plannedSummary}

【实际写作内容摘要】
${actualSummary}

请输出 JSON：
{
  "plotDeviation": 0-10（情节偏离：剧情走向是否与计划一致）,
  "characterDeviation": 0-10（人设偏离：角色行为是否符合设定）,
  "worldviewDeviation": 0-10（世界观偏离：设定是否与计划一致）,
  "overallDeviation": 0-10（加权平均：plot*0.5 + character*0.3 + worldview*0.2）,
  "keyDeviations": ["主要偏离点1", "主要偏离点2"],
  "nextVolumeAdjustment": "对下一卷章纲的调整建议，如果无需调整则写'无需调整'"
}

只输出 JSON。`;

  try {
    const result = await ctx.llmService.completeText({ prompt: deviationPrompt, temperature: 0.3, maxTokens: 600 });
    const deviation = parseLlmJson<any>(result);
    if (!deviation) return;

    // 三维度判定：情节偏离>=5 或 人设偏离>=4 或 世界观偏离>=4 → 修正
    const needsCorrection =
      (deviation.plotDeviation || 0) >= 5 ||
      (deviation.characterDeviation || 0) >= 4 ||
      (deviation.worldviewDeviation || 0) >= 4 ||
      (deviation.overallDeviation || deviation.deviationScore || 0) >= 5;

    if (!needsCorrection) return;

    // 偏离度 >= 5，修正下一卷章纲
    const nextVolIndex = completedVolumes; // 0-indexed
    const nextVolRes = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: "planning", step: `chapter_outline_vol_${completedVolumes + 1}` } },
    });
    if (!nextVolRes) return;

    const nextVolOutlines = parseLlmJson(nextVolRes.output);
    if (!nextVolOutlines?.chapters) return;

    const correctionPrompt = `根据以下偏离分析，修正第${completedVolumes + 1}卷的章纲。

【偏离分析】
${JSON.stringify(deviation, null, 2)}

【当前第${completedVolumes + 1}卷章纲】
${JSON.stringify(nextVolOutlines.chapters.slice(0, 10), null, 2)}

【第${completedVolumes}卷实际结局摘要】
${actualSummaries.slice(-3).map(ch => ch.summary).join("\n")}

请输出修正后的章纲 JSON（结构与原章纲相同），确保承接上一卷的实际走向：
{
  "chapters": [
    { "title": "", "goal": "", "conflict": "", "emotion": "", "hook": "", "characters": [] }
  ]
}

只输出 JSON。`;

    const correctedResult = await ctx.llmService.completeText({ prompt: correctionPrompt, temperature: 0.5, maxTokens: 4000 });
    const corrected = parseLlmJson<any>(correctedResult);
    if (!corrected?.chapters) return;

    // 保存修正后的章纲
    await prisma.phaseResult.update({
      where: { jobId_phase_step: { jobId, phase: "planning", step: `chapter_outline_vol_${completedVolumes + 1}` } },
      data: {
        output: JSON.stringify(corrected),
        input: JSON.stringify({
          correction: true,
          deviationScore: deviation.deviationScore,
          keyDeviations: deviation.keyDeviations,
          basedOnVolume: completedVolumes,
        }),
      },
    });

    // P1 #4: 保存章纲修正通知，让用户感知偏差调整
    await ctx.savePhaseResult(jobId, "writing", `volume_outline_correction_vol_${completedVolumes + 1}`,
      {
        originalChapterCount: nextVolOutlines.chapters.length,
        deviationScores: {
          plot: deviation.plotDeviation,
          character: deviation.characterDeviation,
          worldview: deviation.worldviewDeviation,
          overall: deviation.overallDeviation || deviation.deviationScore,
        },
      },
      {
        message: `卷 ${completedVolumes + 1} 大纲已根据写作偏差自动调整`,
        correctedChapterCount: corrected.chapters.length,
        keyDeviations: deviation.keyDeviations || [],
        basedOnVolume: completedVolumes,
      },
    );

    console.log(`[writingPhase] 第${completedVolumes + 1}卷章纲已修正（偏离度：${deviation.deviationScore}）`);
  } catch (e) {
    console.warn("[writingPhase] 章纲偏离度检查失败:", e);
  }
}
