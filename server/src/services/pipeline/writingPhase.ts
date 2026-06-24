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
import { manageForeshadowLifecycle } from "../ForeshadowService";
import { generateChapterBeats } from "./generators";

/**
 * Beat 模板：根据 chapterType 生成标准化的节奏单元
 * 普通章节使用模板，关键章节（高潮/转折/爽点）使用 LLM 生成
 */
function generateBeatTemplate(chapterType: string, targetWordCount: number, outline: any): any[] {
  const hook = outline.hook || "制造悬念";
  const goal = outline.goal || "推进剧情";
  const conflict = outline.conflict || "核心冲突";

  // 模板库：每种 chapterType 对应的 Beat 序列
  const templates: Record<string, any[]> = {
    // 任务触发章：开启新任务/新目标
    task_trigger: [
      { type: "hook", wordTarget: 300, goal: "用意外事件或新信息制造好奇", mustInclude: [], mustAvoid: ["不要直接说出任务内容"] },
      { type: "reveal", wordTarget: 400, goal: `揭示任务内容：${goal}`, mustInclude: ["任务的具体要求"], mustAvoid: ["不要用系统提示代替场景"] },
      { type: "dialogue", wordTarget: 400, goal: "通过对话讨论任务的难度和意义", mustInclude: ["角色对任务的反应"], mustAvoid: ["不要变成旁白解说"] },
      { type: "conflict", wordTarget: 400, goal: "展示任务的阻碍或代价", mustInclude: ["具体的困难"], mustAvoid: ["不要一笔带过"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["悬念问题"], mustAvoid: ["不要提前解答"] },
    ],
    // 任务执行章：完成具体任务
    mission: [
      { type: "hook", wordTarget: 250, goal: "回顾目标，制造紧迫感", mustInclude: ["上一章结尾的承接"], mustAvoid: ["不要重复上一章内容"] },
      { type: "conflict", wordTarget: 500, goal: `执行过程中的冲突：${conflict}`, mustInclude: ["具体的冲突场景"], mustAvoid: ["不要跳过冲突直接成功"] },
      { type: "dialogue", wordTarget: 400, goal: "角色之间的配合或分歧", mustInclude: ["角色互动"], mustAvoid: ["不要变成独白"] },
      { type: "twist", wordTarget: 350, goal: "意外变数，打破计划", mustInclude: ["意外的具体表现"], mustAvoid: ["不要用巧合解释"] },
      { type: "payoff", wordTarget: 400, goal: "克服困难，完成任务", mustInclude: ["成功的具体过程"], mustAvoid: ["不要一笔带过成功"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["新悬念"], mustAvoid: ["不要仓促结尾"] },
    ],
    // 爽点兑现章：释放爽点
    payoff: [
      { type: "pressure", wordTarget: 400, goal: "施加压力，累积读者期待", mustInclude: ["压力的具体来源"], mustAvoid: ["不要过于轻松"] },
      { type: "reversal", wordTarget: 400, goal: "反转局势，出乎意料", mustInclude: ["反转的具体表现"], mustAvoid: ["不要用巧合解释"] },
      { type: "payoff", wordTarget: 500, goal: "爽点释放，读者情绪高涨", mustInclude: ["爽点的具体释放场景", "旁观者的反应"], mustAvoid: ["不要只用系统提示代替场景"] },
      { type: "emotional", wordTarget: 300, goal: "角色和旁观者的反应", mustInclude: ["角色的情绪变化"], mustAvoid: ["不要忽略配角反应"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["新的期待"], mustAvoid: ["不要破坏爽感"] },
    ],
    // 喜剧日常章：轻松搞笑
    comedy_daily: [
      { type: "hook", wordTarget: 250, goal: "用荒诞场景开篇", mustInclude: ["搞笑的具体场景"], mustAvoid: ["不要冷场"] },
      { type: "dialogue", wordTarget: 500, goal: "角色之间的搞笑互动", mustInclude: ["搞笑的对话"], mustAvoid: ["不要变成流水账"] },
      { type: "reveal", wordTarget: 350, goal: "揭示日常背后的秘密或反转", mustInclude: ["反转的具体内容"], mustAvoid: ["不要过于牵强"] },
      { type: "emotional", wordTarget: 300, goal: "温情时刻，角色关系升温", mustInclude: ["温情的具体表现"], mustAvoid: ["不要过于煽情"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["小悬念"], mustAvoid: ["不要破坏轻松氛围"] },
    ],
    // 人物关系章：升温/冲突/和解
    relationship: [
      { type: "hook", wordTarget: 250, goal: "关系中的微妙变化", mustInclude: ["关系变化的信号"], mustAvoid: ["不要过于直白"] },
      { type: "dialogue", wordTarget: 600, goal: "深入对话，揭示内心", mustInclude: ["内心的真实想法"], mustAvoid: ["不要变成说教"] },
      { type: "conflict", wordTarget: 400, goal: "关系冲突或误解", mustInclude: ["冲突的具体原因"], mustAvoid: ["不要无理取闹"] },
      { type: "emotional", wordTarget: 400, goal: "情感爆发或和解", mustInclude: ["情感的具体表现"], mustAvoid: ["不要强行和解"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["关系的新状态"], mustAvoid: ["不要留下隐患"] },
    ],
    // 危机升级章：危险逼近
    danger_escalation: [
      { type: "hook", wordTarget: 300, goal: "危险信号出现", mustInclude: ["危险的具体表现"], mustAvoid: ["不要轻描淡写"] },
      { type: "conflict", wordTarget: 500, goal: "危机逐步升级", mustInclude: ["升级的具体过程"], mustAvoid: ["不要跳过升级"] },
      { type: "reveal", wordTarget: 400, goal: "揭示危机的真正规模", mustInclude: ["规模的具体描述"], mustAvoid: ["不要过于夸张"] },
      { type: "dialogue", wordTarget: 300, goal: "角色讨论对策", mustInclude: ["具体的对策"], mustAvoid: ["不要纸上谈兵"] },
      { type: "hook_end", wordTarget: 300, goal: "危机达到顶点，悬念拉满", mustInclude: ["危机的顶点"], mustAvoid: ["不要轻易化解"] },
    ],
    // 信息揭露章：揭示秘密/真相
    info_reveal: [
      { type: "hook", wordTarget: 300, goal: "铺垫即将揭露的信息", mustInclude: ["铺垫的具体内容"], mustAvoid: ["不要过于明显"] },
      { type: "reveal", wordTarget: 500, goal: "第一个信息点揭露", mustInclude: ["信息的具体内容"], mustAvoid: ["不要一笔带过"] },
      { type: "dialogue", wordTarget: 400, goal: "角色对信息的反应和讨论", mustInclude: ["角色的反应"], mustAvoid: ["不要过于冷静"] },
      { type: "reveal", wordTarget: 400, goal: "更深层的真相揭露", mustInclude: ["真相的具体内容"], mustAvoid: ["不要过于复杂"] },
      { type: "hook_end", wordTarget: 250, goal: "揭露引发新悬念", mustInclude: ["新悬念"], mustAvoid: ["不要破坏揭露的冲击力"] },
    ],
    // 过渡章：承上启下
    transition: [
      { type: "hook", wordTarget: 250, goal: "承接上一章结尾", mustInclude: ["上一章结尾的承接"], mustAvoid: ["不要跳章"] },
      { type: "emotional", wordTarget: 350, goal: "角色情绪缓冲", mustInclude: ["情绪的具体表现"], mustAvoid: ["不要过于拖沓"] },
      { type: "dialogue", wordTarget: 400, goal: "日常互动，推进关系", mustInclude: ["关系的推进"], mustAvoid: ["不要变成流水账"] },
      { type: "reveal", wordTarget: 350, goal: "埋下伏笔或小钩子", mustInclude: ["伏笔的具体内容"], mustAvoid: ["不要过于明显"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["小悬念"], mustAvoid: ["不要破坏过渡氛围"] },
    ],
  };

  // 获取模板，回退到 mission
  const template = templates[chapterType] || templates.mission;

  // 根据 targetWordCount 等比调整各 Beat 字数
  const totalTemplateWords = template.reduce((sum, b) => sum + b.wordTarget, 0);
  const ratio = targetWordCount / totalTemplateWords;

  return template.map(b => ({
    ...b,
    wordTarget: Math.round(b.wordTarget * ratio / 100) * 100, // 四舍五入到百位
  }));
}

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

    // 伏笔生命周期管理：标记逾期伏笔为 payoff_pending / expired
    try {
      const maxOrder = Math.max(...chapters.map((c: any) => c.order || 0));
      await manageForeshadowLifecycle(job.novelId, maxOrder);
    } catch (e) {
      console.warn("[writingPhase] 伏笔生命周期管理失败:", e);
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

      // 生成 Beat 蓝图（章节内节奏单元）
      const chapterOutlineForBeat = enrichedChaptersMap.get(order) || card;
      let beatBlueprint = "";
      try {
        // 判断是否为关键章节（需要 LLM 生成 Beat）
        const chapterType = chapterOutlineForBeat.chapterType || "mission";
        const isKeyChapter = ["payoff", "danger_escalation", "info_reveal"].includes(chapterType)
          || chapterOutlineForBeat.emotionData?.isClimax
          || chapterOutlineForBeat.emotionData?.isTurningPoint;

        let beats: any[] = [];

        if (isKeyChapter) {
          // 关键章节：使用 LLM 生成 Beat
          const styleProfile = await prisma.styleProfile.findFirst({
            where: { novelId, isDefault: true },
            select: { styleDna: true },
          });
          let styleDna: any = null;
          if (styleProfile?.styleDna) {
            try { styleDna = JSON.parse(styleProfile.styleDna); } catch { /* ignore */ }
          }
          const beatResult = await generateChapterBeats(ctx, chapterOutlineForBeat, styleDna, order, targetWordCount);
          beats = beatResult?.beats || [];
        } else {
          // 普通章节：使用模板生成 Beat（节省 LLM 调用）
          beats = generateBeatTemplate(chapterType, targetWordCount, chapterOutlineForBeat);
        }

        if (beats.length > 0) {
          // 保存到 ChapterBeat 表
          for (let i = 0; i < beats.length; i++) {
            const beat = beats[i];
            await prisma.chapterBeat.upsert({
              where: { novelId_chapterOrder_beatOrder: { novelId, chapterOrder: order, beatOrder: i + 1 } },
              create: {
                novelId, chapterOrder: order, beatOrder: i + 1,
                type: beat.type || "transition",
                goal: beat.goal || "",
                wordTarget: beat.wordTarget || 300,
                mustInclude: JSON.stringify(beat.mustInclude || []),
                mustAvoid: JSON.stringify(beat.mustAvoid || []),
              },
              update: {
                type: beat.type || "transition",
                goal: beat.goal || "",
                wordTarget: beat.wordTarget || 300,
                mustInclude: JSON.stringify(beat.mustInclude || []),
                mustAvoid: JSON.stringify(beat.mustAvoid || []),
              },
            }).catch(() => {});
          }

          // 构建 Beat 蓝图文本（包含 mustInclude 和 mustAvoid）
          const beatLines = beats.map((b: any, i: number) => {
            let line = `Beat ${i + 1} [${b.type}] ${b.wordTarget || 300}字：${b.goal}`;
            if (b.mustInclude && b.mustInclude.length > 0) {
              line += `\n  必须包含：${b.mustInclude.join("、")}`;
            }
            if (b.mustAvoid && b.mustAvoid.length > 0) {
              line += `\n  必须避免：${b.mustAvoid.join("、")}`;
            }
            return line;
          });
          beatBlueprint = `\n\n【节奏蓝图 — 按以下 Beat 顺序写作】\n${beatLines.join("\n")}\n\n每个 Beat 之间用空行分隔。每个 Beat 必须有信息增量，禁止水字数。`;
        }
      } catch (e) {
        console.warn(`[writingPhase] Beat 蓝图生成失败，跳过:`, e);
      }

      // 加载爽点链推进要求
      let payoffChainHint = "";
      try {
        const { getActivePayoffStages } = await import("./payoffChainPhase");
        const activeStages = await getActivePayoffStages(novelId, order);
        if (activeStages.length > 0) {
          const stageLines = activeStages.map(s =>
            `「${s.chainName}」→ 本章应推进到：${s.stage.event}（第${s.stage.chapter}章）`
          );
          payoffChainHint = `\n\n【爽点链推进 — 必须在正文中体现】\n${stageLines.join("\n")}\n→ 正文中必须包含上述爽点的具体释放场景，不能跳过。`;
        }
      } catch (e) {
        console.warn(`[writingPhase] 爽点链加载失败，跳过:`, e);
      }

      // 合并 beatBlueprint + payoffChainHint
      const fullBeatBlueprint = beatBlueprint + payoffChainHint;

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
        beatBlueprint: fullBeatBlueprint,
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
          beatBlueprint: fullBeatBlueprint,
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
  beatBlueprint?: string;
}) {
  // 使用 P0-P3 优先级 Prompt 架构 + Beat 蓝图
  const system = input.compactContext + (input.beatBlueprint || "");

  const retrySection = input.retryHint
    ? `\n【重试修正要求 — 必须严格遵守】\n上一版存在以下问题，请务必修正：\n${input.retryHint}\n`
    : "";

  const prompt = `请根据以上约束，写出第${input.order}章的完整内容。

目标字数：${input.targetWordCount} 中文字（不少于 ${Math.round(input.targetWordCount * 0.8)} 字，不超过 ${Math.round(input.targetWordCount * 1.2)} 字）

写作要求：
1. 输出纯正文，不要 Markdown 标记，不要提纲，不要解释
2. 场景转换用空行分隔，不要用「场景一」「场景二」这样的标记
3. 对话用引号「」标注，不要用 ""
4. 第一章必须在前 300 字内建立冲突或悬念，不要用风景描写开头
5. 每段不超过 4 行，保持阅读节奏
6. 必须使用第三人称视角（他/她/角色名），禁止使用「我」「我们」
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
