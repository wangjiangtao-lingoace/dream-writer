import { prisma } from "../../db/prisma";
import { getRagRetrieveService } from "../RagRetrieveService";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";
import { generateVolumeOutline, generateChapterOutlines, generateMainlinesAndHooks } from "./generators";

/**
 * Legacy Phase 3: 生成卷纲 (pipelineVersion < 2)
 */
export async function executeVolumesPhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const novelId = job.novelId;
  const outlineResult = await ctx.getPhaseOutput(jobId, "outline", "outline");
  const [worldviewResult, charactersResult, styleResult] = await Promise.all([
    ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
    ctx.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
    ctx.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
  ]);

  const existingVolumes = await prisma.volume.findMany({ where: { novelId }, take: 1 });

  if (existingVolumes.length > 0) {
    await ctx.updateJobProgress(jobId, "volumes", "volume");
    const allVolumes = await prisma.volume.findMany({
      where: { novelId }, orderBy: { sortOrder: "asc" },
      include: { chapterOutlines: { orderBy: { sortOrder: "asc" } } },
    });
    await ctx.savePhaseResult(jobId, "volumes", "volume",
      { outline: outlineResult, source: "decomposed" }, {
        volumes: allVolumes.map(v => ({
          title: v.title, goal: v.goal, conflict: v.conflict,
          emotion: v.emotion, newChars: v.newChars, mapName: v.mapName, endHook: v.endHook,
        })),
      });
  } else {
    await ctx.updateJobProgress(jobId, "volumes", "volume");
    const volumeResult = await generateVolumeOutline(ctx, novelId, outlineResult, worldviewResult, charactersResult, styleResult, config);
    await ctx.savePhaseResult(jobId, "volumes", "volume", { outline: outlineResult }, volumeResult);
    await ctx.saveToKnowledgeBase(novelId, 'volume', '卷纲规划', volumeResult);
  }

  await prisma.pipelineJob.update({
    where: { id: jobId },
    data: { status: "paused", currentPhase: "volumes", currentStep: "waiting_confirm" },
  });
}

/**
 * Legacy Phase 4: 生成章纲 + 主线钩子 (pipelineVersion < 2)
 */
export async function executeChapterOutlinePhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const novelId = job.novelId;
  const outlineResult = await ctx.getPhaseOutput(jobId, "outline", "outline");
  const [worldviewResult, charactersResult, styleResult, volumeResult] = await Promise.all([
    ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
    ctx.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
    ctx.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
    ctx.getPhaseOutput(jobId, "volumes", "volume").catch(() => ({})),
  ]);

  const knowledgeContext = await getRagRetrieveService()?.retrieve(
    `${job.novel.title} ${job.novel.inspiration || ""} ${config.genre || ""}`,
    { novelId, topK: 10 }
  ) ?? "";

  // 章纲
  await ctx.updateJobProgress(jobId, "chapter_outline", "chapter_outline");
  const chapterOutlineResult = await generateChapterOutlines(ctx, novelId, volumeResult, outlineResult, worldviewResult, charactersResult, styleResult, config);
  await ctx.savePhaseResult(jobId, "chapter_outline", "chapter_outline", { volumes: volumeResult }, chapterOutlineResult);
  await ctx.saveToKnowledgeBase(novelId, 'chapter_outline', '章纲规划', chapterOutlineResult);

  // 主线/钩子
  await ctx.updateJobProgress(jobId, "chapter_outline", "mainline_hook");
  const mainlineHookResult = await generateMainlinesAndHooks(ctx, novelId, outlineResult, volumeResult, worldviewResult, charactersResult, styleResult, knowledgeContext);
  await ctx.savePhaseResult(jobId, "chapter_outline", "mainline_hook", { outline: outlineResult, volumes: volumeResult }, mainlineHookResult);
  await ctx.saveToKnowledgeBase(novelId, 'mainline_hook', '主线钩子', mainlineHookResult);

  await prisma.pipelineJob.update({
    where: { id: jobId },
    data: { status: "paused", currentPhase: "chapter_outline", currentStep: "waiting_confirm" },
  });
}
