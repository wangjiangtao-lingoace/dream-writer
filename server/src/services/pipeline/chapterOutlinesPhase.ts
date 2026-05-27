import { prisma } from "../../db/prisma";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext, saveToKnowledgeBase } from "./pipelineUtils";
import { generateEnrichedChapterOutlines, generateStoryArcs } from "./generators";

export async function executeChapterOutlinesPhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const novelId = job.novelId;
  const volumeCount = config.volumeCount || 5;
  const chaptersPerVolume = config.chaptersPerVolume || 30;

  try {
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
      const previousSummary = buildPreviousVolumeSummary(allChapterOutlines, volIdx);

      const enrichedChapters = await generateEnrichedChapterOutlines(
        ctx, novelId, volumeResult, volIdx, outlineResult, worldviewResult,
        charactersResult, styleResult, previousSummary, config,
      );

      const chapters = enrichedChapters?.chapters || [];
      await persistVolumeChapterData(novelId, volIdx, chapters, volumeResult);

      allChapterOutlines.chapterOutlines.push({
        volumeIndex: volIdx,
        chapters,
      });

      await ctx.savePhaseResult(jobId, "planning", stepName,
        { volume: volumeResult.volumes?.[volIdx], previousSummary, chaptersPerVolume },
        enrichedChapters);
    }

    // 生成跨卷故事弧线
    await ctx.updateJobProgress(jobId, "planning", "story_arcs");
    const storyArcs = await generateStoryArcs(
      ctx, novelId, outlineResult, allChapterOutlines, volumeResult,
      worldviewResult, charactersResult, styleResult, config,
    );
    await persistStoryArcs(novelId, storyArcs);
    await ctx.savePhaseResult(jobId, "planning", "story_arcs",
      { outline: outlineResult, totalChapters: volumeCount * chaptersPerVolume },
      storyArcs);

    // 暂停等用户确认
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused", currentPhase: "planning", currentStep: "waiting_confirm" },
    });
  } catch (error: any) {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "error", lastError: error.message },
    });
  }
}

export function buildPreviousVolumeSummary(allChapterOutlines: any, currentVolIdx: number): string {
  if (currentVolIdx === 0) return "";
  const summaryParts: string[] = [];
  for (let i = 0; i < currentVolIdx; i++) {
    const group = allChapterOutlines.chapterOutlines[i];
    if (!group) continue;
    const volTitle = `第${i + 1}卷`;
    const chapterLines = (group.chapters || []).map((ch: any, idx: number) =>
      `  第${idx + 1}章 ${ch.title}：${ch.goal || ""} | 钩子：${ch.hook || "无"}`
    ).join("\n");
    summaryParts.push(`【${volTitle}】\n${chapterLines}`);
  }
  return summaryParts.join("\n\n");
}

export async function persistVolumeChapterData(novelId: string, volumeIndex: number, chapters: any[], volumeResult: any) {
  const volumeNumber = volumeIndex + 1;
  const volume = await prisma.volume.findFirst({
    where: { novelId, sortOrder: volumeNumber },
  });
  if (!volume) return;

  const globalStart = volumeIndex * (chapters?.length || 0) + 1;

  for (const [chIdx, chapter] of (chapters || []).entries()) {
    const globalOrder = globalStart + chIdx;

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
        foreshadowing: JSON.stringify(chapter.foreshadowPlanted || []),
        payoff: JSON.stringify(chapter.foreshadowPayoff || []),
        pleasurePoint: chapter.pleasurePoint?.description || (typeof chapter.pleasurePoint === "string" ? chapter.pleasurePoint : ""),
      },
      update: {
        volumeId: volume.id,
        title: chapter.title || `第${globalOrder}章`,
        goal: chapter.goal || "",
        conflict: chapter.conflict || "",
        emotion: chapter.emotion || "",
        hook: chapter.hook || "",
        foreshadowing: JSON.stringify(chapter.foreshadowPlanted || []),
        payoff: JSON.stringify(chapter.foreshadowPayoff || []),
        pleasurePoint: chapter.pleasurePoint?.description || (typeof chapter.pleasurePoint === "string" ? chapter.pleasurePoint : ""),
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
          payoffChapter: fs.plannedPayoffChapter || null,
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
