import { prisma } from "../../db/prisma";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext, saveToKnowledgeBase, autoAdvanceOrPause } from "./pipelineUtils";
import { generateEnrichedChapterOutlines, generateStoryArcs } from "./generators";
import { loadMaterialContextForNovel } from "./materialContext";
import { checkMaterialConsistencyFromDb } from "../material/MaterialCoverageReport";
import { executeConsistencyCheckPhase } from "./consistencyPhase";

export const CHAPTER_TITLE_STYLE_RULES = `章节标题规则：
1. 标题必须像已发表小说目录，不得像章纲说明。
2. 优先 2-8 个汉字，最多 12 个字。
3. 可以口语化，但必须有画面、有情绪、有余味。
4. 禁止使用 PPT、KPI、系统、任务、规则、金手指、爽点、打工人、绩效 等设定说明词，除非用户原文章节标题已经使用。
5. 禁止标题直接解释本章功能，如“触发任务”“信息揭露”“首次奖励到账”。
6. 标题风格参考用户原文：
   - 他们当时的嘲笑声好大呀
   - 上香
   - 第一个任务
7. 好标题应像一句正文里能出现的话、一个动作、一个物件、一个反常场景。`;

export async function executeChapterOutlinesPhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const novelId = job.novelId;
  let volumeCount = config.volumeCount || 5;
  let totalChapters = volumeCount * (config.chaptersPerVolume || 30);
  const chaptersPerVolume = Math.ceil(totalChapters / volumeCount);

  try {
    const continuationStartOrder = await getContinuationStartOrder(novelId);
    const canonicalOffset = continuationStartOrder - 1;
    const canonicalSummary = canonicalOffset > 0
      ? await buildCanonicalContinuationSummary(novelId, canonicalOffset)
      : "";
    const materialContext = await loadMaterialContextForNovel(novelId, jobId).catch(() => "");
    // 从素材上下文中提取卷数和章数（整体规划优先于 config 默认值）
    if (materialContext) {
      const volMatch = materialContext.match(/总卷数[：:]\s*(\d+)\s*卷/);
      if (volMatch) volumeCount = parseInt(volMatch[1], 10);
      const chMatch = materialContext.match(/总章数[：:]\s*(\d+)\s*章/);
      if (chMatch) totalChapters = parseInt(chMatch[1], 10);
    }

    // 缓存检查：如果所有卷的章纲已存在，跳过重新生成
    const existingOutlines = await prisma.phaseResult.findMany({
      where: { jobId, phase: "planning", step: { startsWith: "chapter_outline_vol_" } },
    });
    if (existingOutlines.length >= volumeCount) {
      const allHaveContent = existingOutlines.every(r => r.output && r.output !== "{}");
      if (allHaveContent) {
        console.log(`[chapterOutlines] 所有${volumeCount}卷章纲已存在，跳过重新生成`);
        await autoAdvanceOrPause(jobId, "planning", async () => {
          await executeConsistencyCheckPhase(ctx, jobId);
        });
        return;
      }
    }

    // 加载前置阶段结果
    const outlineResult = await ctx.getPhaseOutput(jobId, "outline", "outline");
    const volumeResult = await ctx.getPhaseOutput(jobId, "planning", "volume_outline");
    const [worldviewResult, charactersResult, styleResult] = await Promise.all([
      ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
      ctx.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
      ctx.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
    ]);

    // 逐卷生成富化章纲
    const allChapterOutlines: any = { chapterOutlines: [] };
    for (let volIdx = 0; volIdx < volumeCount; volIdx++) {
      const stepName = `chapter_outline_vol_${volIdx + 1}`;
      await ctx.updateJobProgress(jobId, "planning", stepName);

      // 构建前序卷摘要
      const previousSummary = [
        volIdx === 0 ? canonicalSummary : "",
        buildPreviousVolumeSummary(allChapterOutlines, volIdx),
      ].filter(Boolean).join("\n\n");

      // 分批生成章纲，每批 10 章，避免单次 maxTokens 不足导致质量衰减
      const BATCH_SIZE = 10;
      const allChapters: any[] = [];
      for (let batchStart = 0; batchStart < chaptersPerVolume; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, chaptersPerVolume);
        const batchHint = batchStart > 0
          ? `前一批章纲摘要：${JSON.stringify(allChapters.slice(-3).map((c: any) => ({ title: c.title, goal: c.goal, hook: c.hook })))}`
          : previousSummary;

        const batchResult = await generateEnrichedChapterOutlines(
          ctx, novelId, volumeResult, volIdx, outlineResult, worldviewResult,
          charactersResult, styleResult, batchHint, config, undefined,
          batchStart, batchEnd,
          {
            canonicalOffset,
            materialContext,
            titleStyleRules: CHAPTER_TITLE_STYLE_RULES,
            chapterRangeDescription: buildChapterRangeDescription(
              volIdx,
              batchStart,
              batchEnd,
              canonicalOffset,
              chaptersPerVolume,
            ),
          },
        );
        allChapters.push(...(batchResult?.chapters || []));
      }

      const chapters = allChapters;
      await persistVolumeChapterData(novelId, volIdx, chapters, volumeResult, {
        canonicalOffset,
        chaptersPerVolume,
      });

      allChapterOutlines.chapterOutlines.push({
        volumeIndex: volIdx,
        chapters,
      });

      await ctx.savePhaseResult(jobId, "planning", stepName,
        { volume: volumeResult.volumes?.[volIdx], previousSummary, chaptersPerVolume },
        { chapters });
    }

    // 资产一致性检查（软检查，warn 但不阻断）
    const allOutlineText = allChapterOutlines.chapterOutlines
      .flatMap((g: any) => (g.chapters || []).map((c: any) => `${c.title || ""} ${c.goal || ""} ${c.hook || ""}`))
      .join(" ");
    const consistencyResult = await checkMaterialConsistencyFromDb(novelId, allOutlineText);
    if (consistencyResult.warnings.length > 0) {
      console.log(`[chapterOutlines] 资产一致性检查：${consistencyResult.warnings.join("；")}`);
    }

    // 生成跨卷故事弧线（缓存检查）
    const existingStoryArcs = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: "planning", step: "story_arcs" } },
    });
    if (existingStoryArcs?.output && existingStoryArcs.output !== "{}") {
      console.log("[chapterOutlines] 故事弧线已存在，跳过重新生成");
    } else {
    await ctx.updateJobProgress(jobId, "planning", "story_arcs");
    const enrichedSummary = buildChapterSummaryForArcs(allChapterOutlines);
    const materialContext = await loadMaterialContextForNovel(novelId, jobId).catch(() => "");
    const storyArcs = await generateStoryArcs(
      ctx, novelId, outlineResult, { chapterOutlines: allChapterOutlines.chapterOutlines, enrichedSummary }, volumeResult,
      worldviewResult, charactersResult, styleResult, config, materialContext,
    );
    await persistStoryArcs(novelId, storyArcs);
    await ctx.savePhaseResult(jobId, "planning", "story_arcs",
      { outline: outlineResult, totalChapters: volumeCount * chaptersPerVolume },
      storyArcs);
    } // end else (story arcs cache check)

    // 暂停等用户确认
    await autoAdvanceOrPause(jobId, "planning", async () => {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "consistency_check", currentStep: "consistency" },
      });
      await executeConsistencyCheckPhase(ctx, jobId);
    });
  } catch (error: any) {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "error", lastError: error.message },
    });
  }
}

export function calculateChapterOutlineStartOrder(
  volumeIndex: number,
  chaptersPerVolume: number,
  canonicalOffset = 0,
): number {
  return canonicalOffset + volumeIndex * chaptersPerVolume + 1;
}

export function buildChapterRangeDescription(
  volumeIndex: number,
  batchStart: number,
  batchEnd: number,
  canonicalOffset = 0,
  chaptersPerVolume = batchEnd - batchStart,
): string {
  const volumeNumber = volumeIndex + 1;
  const startOrder = calculateChapterOutlineStartOrder(volumeIndex, chaptersPerVolume, canonicalOffset) + batchStart;
  const endOrder = startOrder + (batchEnd - batchStart) - 1;
  const canonicalNotice = canonicalOffset > 0
    ? `前${canonicalOffset}章是用户原文，必须只承接，不得重新规划或改写。`
    : "";
  return `请为第${volumeNumber}卷的全书第${startOrder}到第${endOrder}章设计详细章纲。${canonicalNotice}`;
}

async function getContinuationStartOrder(novelId: string): Promise<number> {
  const lastCanonical = await prisma.chapter.findFirst({
    where: {
      novelId,
      OR: [
        { sourceType: "user_original" },
        { isCanonical: true },
        { canRewrite: false },
      ],
    },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (lastCanonical?.order || 0) + 1;
}

async function buildCanonicalContinuationSummary(novelId: string, canonicalOffset: number): Promise<string> {
  const summaries = await prisma.chapterSummary.findMany({
    where: { novelId, chapterOrder: { lte: canonicalOffset } },
    orderBy: { chapterOrder: "asc" },
    select: { chapterOrder: true, title: true, summary: true, endingState: true },
  });
  const latest = summaries[summaries.length - 1];
  const summaryLines = summaries.map(s => `第${s.chapterOrder}章《${s.title}》：${s.summary}`).join("\n");
  return [
    `【用户原文章节】前${canonicalOffset}章为用户原文，禁止重写、替换或重新规划；后续章纲必须从第${canonicalOffset + 1}章开始承接。`,
    summaryLines ? `【原文概要】\n${summaryLines}` : "",
    latest?.endingState ? `【最近原文结尾】\n${latest.endingState}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * 构建面向故事弧线生成的章纲摘要，在 title/goal/hook 基础上
 * 增加 conflict、emotion、characters、hooksPlanted/Resolved、foreshadowPlanted/Payoff
 */
export function buildChapterSummaryForArcs(allChapterOutlines: any): any[] {
  return (allChapterOutlines?.chapterOutlines || []).flatMap((group: any, volIdx: number) =>
    (group.chapters || []).map((ch: any, chIdx: number) => ({
      volume: volIdx + 1,
      chapter: chIdx + 1,
      title: ch.title,
      goal: ch.goal,
      hook: ch.hook,
      conflict: ch.conflict || "",
      emotion: ch.emotion || "",
      characters: Array.isArray(ch.characters) ? ch.characters.map((c: any) => c.name || c) : [],
      hooksPlanted: Array.isArray(ch.hooksPlanted) ? ch.hooksPlanted.map((h: any) => h.title || h) : [],
      hooksResolved: Array.isArray(ch.hooksResolved) ? ch.hooksResolved.map((h: any) => h.title || h) : [],
      foreshadowPlanted: Array.isArray(ch.foreshadowPlanted) ? ch.foreshadowPlanted.map((f: any) => f.title || f) : [],
      foreshadowPayoff: Array.isArray(ch.foreshadowPayoff) ? ch.foreshadowPayoff.map((f: any) => f.title || f) : [],
    }))
  );
}

export function buildPreviousVolumeSummary(allChapterOutlines: any, currentVolIdx: number): string {
  if (currentVolIdx === 0) return "";
  const summaryParts: string[] = [];
  for (let i = 0; i < currentVolIdx; i++) {
    const group = allChapterOutlines.chapterOutlines[i];
    if (!group) continue;
    const chapters = group.chapters || [];
    const volTitle = `第${i + 1}卷`;
    const volGoal = group.volumeGoal || chapters[0]?.goal || "";
    const volConflict = group.volumeConflict || chapters[0]?.conflict || "";

    // 距离当前卷越远，摘要越精简
    const distance = currentVolIdx - i - 1;
    if (distance >= 2) {
      // 远距离卷：只传卷级摘要（~50 tokens）
      const firstCh = chapters[0];
      const lastCh = chapters[chapters.length - 1];
      summaryParts.push(
        `【${volTitle}】目标：${volGoal} | 冲突：${volConflict}\n` +
        `开篇：${firstCh?.title || ""} → 结局：${lastCh?.title || ""}（${lastCh?.hook || ""}）`
      );
    } else {
      // 相邻卷：传首尾章节 + 关键转折（~150 tokens）
      const keyChapters = [];
      if (chapters.length > 0) keyChapters.push(`开篇：${chapters[0].title} — ${chapters[0].goal || ""}`);
      // 取中间转折章（约 1/3 和 2/3 处）
      const mid1 = chapters[Math.floor(chapters.length / 3)];
      const mid2 = chapters[Math.floor(chapters.length * 2 / 3)];
      if (mid1 && mid1 !== chapters[0] && mid1 !== chapters[chapters.length - 1]) {
        keyChapters.push(`转折：${mid1.title} — ${mid1.conflict || mid1.goal || ""}`);
      }
      if (mid2 && mid2 !== mid1 && mid2 !== chapters[0] && mid2 !== chapters[chapters.length - 1]) {
        keyChapters.push(`转折：${mid2.title} — ${mid2.conflict || mid2.goal || ""}`);
      }
      if (chapters.length > 1) {
        const last = chapters[chapters.length - 1];
        keyChapters.push(`结局：${last.title} — ${last.hook || last.goal || ""}`);
      }
      summaryParts.push(`【${volTitle}】目标：${volGoal} | 冲突：${volConflict}\n${keyChapters.join("\n")}`);
    }
  }
  return summaryParts.join("\n\n");
}

export async function persistVolumeChapterData(
  novelId: string,
  volumeIndex: number,
  chapters: any[],
  volumeResult: any,
  options: { canonicalOffset?: number; chaptersPerVolume?: number } = {},
) {
  const volumeNumber = volumeIndex + 1;
  const volume = await prisma.volume.findFirst({
    where: { novelId, sortOrder: volumeNumber },
  });
  if (!volume) return;

  const globalStart = calculateChapterOutlineStartOrder(
    volumeIndex,
    options.chaptersPerVolume || chapters?.length || 0,
    options.canonicalOffset || 0,
  );

  for (const [chIdx, chapter] of (chapters || []).entries()) {
    const globalOrder = globalStart + chIdx;

    const existingCanonical = await prisma.chapter.findUnique({
      where: { novelId_order: { novelId, order: globalOrder } },
      select: { sourceType: true, isCanonical: true, canRewrite: true },
    });
    if (
      existingCanonical?.sourceType === "user_original" ||
      existingCanonical?.isCanonical === true ||
      existingCanonical?.canRewrite === false
    ) {
      console.warn(`[chapterOutlines] 跳过第${globalOrder}章章纲写入：该章为用户原文 canonical`);
      continue;
    }

    // 1. 创建/更新 ChapterOutline
    await prisma.chapterOutline.upsert({
      where: { novelId_sortOrder: { novelId, sortOrder: globalOrder } },
      create: {
        novelId,
        volumeId: volume.id,
        sortOrder: globalOrder,
        title: chapter.title || `第${globalOrder}章`,
        goal: chapter.goal || "",
        conflict: chapter.conflict || "",
        emotion: chapter.emotion || "",
        hook: chapter.hook || "",
        scene: chapter.scene || "",
        pov: chapter.pov || "",
        targetWordCount: chapter.targetWordCount || 0,
        mustDo: JSON.stringify(chapter.mustDo || []),
        mustNotDo: JSON.stringify(chapter.mustNotDo || []),
        foreshadowing: JSON.stringify(chapter.foreshadowPlanted || []),
        payoff: JSON.stringify(chapter.foreshadowPayoff || []),
        pleasurePoint: typeof chapter.pleasurePoint === "string" ? chapter.pleasurePoint : JSON.stringify(chapter.pleasurePoint || {}),
        chapterType: chapter.chapterType || "mission",
        readerPromise: chapter.readerPromise || "",
        chapterFunction: chapter.chapterFunction || "",
        requiredReaderEmotion: JSON.stringify(chapter.requiredReaderEmotion || []),
        payoffChainRefs: JSON.stringify(chapter.payoffChainRefs || []),
        comedyMechanism: chapter.comedyMechanism || "",
        endingQuestion: chapter.endingQuestion || "",
      },
      update: {
        volumeId: volume.id,
        title: chapter.title || `第${globalOrder}章`,
        goal: chapter.goal || "",
        conflict: chapter.conflict || "",
        emotion: chapter.emotion || "",
        hook: chapter.hook || "",
        scene: chapter.scene || "",
        pov: chapter.pov || "",
        targetWordCount: chapter.targetWordCount || 0,
        mustDo: JSON.stringify(chapter.mustDo || []),
        mustNotDo: JSON.stringify(chapter.mustNotDo || []),
        foreshadowing: JSON.stringify(chapter.foreshadowPlanted || []),
        payoff: JSON.stringify(chapter.foreshadowPayoff || []),
        pleasurePoint: typeof chapter.pleasurePoint === "string" ? chapter.pleasurePoint : JSON.stringify(chapter.pleasurePoint || {}),
        chapterType: chapter.chapterType || "mission",
        readerPromise: chapter.readerPromise || "",
        chapterFunction: chapter.chapterFunction || "",
        requiredReaderEmotion: JSON.stringify(chapter.requiredReaderEmotion || []),
        payoffChainRefs: JSON.stringify(chapter.payoffChainRefs || []),
        comedyMechanism: chapter.comedyMechanism || "",
        endingQuestion: chapter.endingQuestion || "",
      },
    });

    // 2. 创建 Hook 记录
    for (const hook of (chapter.hooksPlanted || [])) {
      if (!hook?.title) continue;
      await prisma.hook.create({
        data: {
          novelId,
          title: hook.title,
          description: hook.description || "",
          type: hook.type || "suspense",
          intensity: Math.max(1, Math.min(10, Number(hook.intensity || 5))),
          plannedChapter: globalOrder,
          resolvedChapter: hook.plannedResolveChapter || null,
          status: "planted",
        },
      });
    }

    // 3. 创建 Foreshadow 记录
    for (const fs of (chapter.foreshadowPlanted || [])) {
      if (!fs?.title) continue;
      await prisma.foreshadow.create({
        data: {
          novelId,
          title: fs.title,
          description: fs.description || "",
          plantChapter: globalOrder,
          payoffChapter: typeof fs.plannedPayoffChapter === 'number' ? fs.plannedPayoffChapter : (parseInt(fs.plannedPayoffChapter) || null),
          status: "planted",
        },
      });
    }

    // 4. 创建 PleasurePoint 记录
    if (chapter.pleasurePoint && typeof chapter.pleasurePoint === "object" && chapter.pleasurePoint.description) {
      await prisma.pleasurePoint.create({
        data: {
          novelId,
          chapterOrder: globalOrder,
          type: chapter.pleasurePoint.type || "power_up",
          intensity: Math.max(1, Math.min(10, Number(chapter.pleasurePoint.intensity || 5))),
          description: chapter.pleasurePoint.description,
          characters: JSON.stringify((chapter.characters || []).map((c: any) => c.name)),
        },
      });
    }

    // 5. 创建 EmotionCurve 记录
    if (chapter.emotionData) {
      const ed = chapter.emotionData;
      await prisma.emotionCurve.create({
        data: {
          novelId,
          chapterOrder: globalOrder,
          emotionType: ed.emotionType || "neutral",
          intensity: Math.max(1, Math.min(10, Number(ed.intensity || 5))),
          isClimax: Boolean(ed.isClimax),
          isTurningPoint: Boolean(ed.isTurningPoint),
          isBreathing: Boolean(ed.isBreathing),
          description: chapter.emotion || "",
        },
      });
    }

    // 6. 更新 Character.firstAppear
    for (const char of (chapter.characters || [])) {
      if (!char?.name) continue;
      const existing = await prisma.character.findFirst({
        where: { novelId, name: char.name },
      });
      if (existing && !existing.firstAppear) {
        await prisma.character.update({
          where: { id: existing.id },
          data: { firstAppear: globalOrder },
        });
      }
    }
  }

  // 7. 存储完整富化数据到 KnowledgeAsset
  await saveToKnowledgeBase(novelId, `enriched_chapters_vol_${volumeNumber}`,
    `第${volumeNumber}卷富化章纲`, { chapters });
}

export async function persistStoryArcs(novelId: string, storyArcs: any) {
  // 1. 创建 Mainline 记录
  for (const [index, mainline] of (storyArcs?.mainlines || []).entries()) {
    await prisma.mainline.create({
      data: {
        novelId,
        title: mainline.title || `主线${index + 1}`,
        description: mainline.description || "",
        type: mainline.type || "main",
        startChapter: mainline.startChapter || 1,
        endChapter: mainline.endChapter || 999,
        milestones: JSON.stringify(mainline.milestones || []),
        resolution: mainline.resolution || "",
        sortOrder: index + 1,
        priority: mainline.type === "main" ? 10 : 7,
      },
    });
  }

  // 2. 创建跨卷 Hook 记录
  for (const hook of (storyArcs?.crossVolumeHooks || [])) {
    if (!hook?.title) continue;
    await prisma.hook.create({
      data: {
        novelId,
        title: hook.title,
        description: hook.description || "",
        type: hook.type || "suspense",
        intensity: Math.max(1, Math.min(10, Number(hook.intensity || 5))),
        plannedChapter: hook.plantedChapter || null,
        resolvedChapter: hook.resolvedChapter || null,
        status: "planted",
      },
    });
  }

  // 3. 创建 EmotionCurve 总览记录
  if (storyArcs?.emotionCurveSummary) {
    await saveToKnowledgeBase(novelId, "emotion_curve_summary", "情绪曲线总览", storyArcs.emotionCurveSummary);
  }
}
