import { prisma } from "../../db/prisma";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext, saveToKnowledgeBase, autoAdvanceOrPause } from "./pipelineUtils";
import { generateEnrichedChapterOutlines, generateStoryArcs } from "./generators";
import { executeConsistencyCheckPhase } from "./consistencyPhase";

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

    // 生成跨卷故事弧线（缓存检查）
    const existingStoryArcs = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: "planning", step: "story_arcs" } },
    });
    if (existingStoryArcs?.output && existingStoryArcs.output !== "{}") {
      console.log("[chapterOutlines] 故事弧线已存在，跳过重新生成");
    } else {
    await ctx.updateJobProgress(jobId, "planning", "story_arcs");
    const storyArcs = await generateStoryArcs(
      ctx, novelId, outlineResult, allChapterOutlines, volumeResult,
      worldviewResult, charactersResult, styleResult, config,
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
