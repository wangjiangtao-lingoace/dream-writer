import { prisma } from "../../db/prisma";
import { getRagRetrieveService } from "../RagRetrieveService";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";
import { generateOutline, generateWorldview, generateCharacters, generateStyle, generateVolumeOutline } from "./generators";

/**
 * imitation 模式的规划阶段
 */
export async function executePlanningPhase(
  ctx: PhaseContext,
  jobId: string,
  novelId: string,
  config: PipelineConfig,
) {
  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) throw new Error("作品不存在");

  // RAG 检索知识库
  const knowledgeContext = [
    await getRagRetrieveService()?.retrieve(
      `${novel.title} ${novel.inspiration || ""} ${config.genre || ""}`,
      { novelId, topK: 10 }
    ) ?? "",
    await ctx.buildWorkspaceAssetContext(novelId, jobId),
    await ctx.buildBookAnalysisContext(novelId, config, jobId),
    await ctx.buildImitationPlanContext(novelId, config, jobId),
  ].filter(Boolean).join("\n\n");

  // 1.1 生成大纲
  await ctx.updateJobProgress(jobId, "planning", "outline");
  const outlineResult = await generateOutline(ctx, novelId, novel.inspiration || "", knowledgeContext, config);
  await ctx.savePhaseResult(jobId, "planning", "outline",
    { inspiration: novel.inspiration }, outlineResult);
  await ctx.saveToKnowledgeBase(novelId, 'outline', '故事大纲', outlineResult);

  // 1.2 生成世界观
  await ctx.updateJobProgress(jobId, "planning", "worldview");
  const worldviewResult = await generateWorldview(ctx, novelId, outlineResult, knowledgeContext);
  await ctx.savePhaseResult(jobId, "planning", "worldview",
    { outline: outlineResult }, worldviewResult);
  await ctx.saveToKnowledgeBase(novelId, 'worldview', '世界观设定', worldviewResult);

  // 1.3 生成人物
  await ctx.updateJobProgress(jobId, "planning", "characters");
  const charactersResult = await generateCharacters(ctx, novelId, outlineResult, worldviewResult, knowledgeContext);
  await ctx.savePhaseResult(jobId, "planning", "characters",
    { outline: outlineResult, worldview: worldviewResult }, charactersResult);
  await ctx.saveToKnowledgeBase(novelId, 'character', '人物设定', charactersResult);

  // 1.4 生成风格
  await ctx.updateJobProgress(jobId, "planning", "style");
  const styleResult = await generateStyle(ctx, novelId, outlineResult, config);
  await ctx.savePhaseResult(jobId, "planning", "style",
    { outline: outlineResult }, styleResult);
  await ctx.saveToKnowledgeBase(novelId, 'style', '写作风格', styleResult);
}

/**
 * standalone 模式的规划阶段（卷纲先行）
 */
export async function executePlanningPhase_standalone(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const novelId = job.novelId;

  try {
    // 加载前置阶段结果
    const outlineResult = await ctx.getPhaseOutput(jobId, "outline", "outline");
    const [worldviewResult, charactersResult, styleResult] = await Promise.all([
      ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
      ctx.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
      ctx.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
    ]);

    // Step 1: 生成卷纲
    await ctx.updateJobProgress(jobId, "planning", "volume_outline");
    let volumeResult: any;
    const existingVolumes = await prisma.volume.findMany({ where: { novelId }, take: 1 });
    if (existingVolumes.length > 0) {
      const allVolumes = await prisma.volume.findMany({
        where: { novelId }, orderBy: { sortOrder: "asc" },
      });
      volumeResult = {
        volumes: allVolumes.map(v => ({
          title: v.title, goal: v.goal, conflict: v.conflict,
          emotion: v.emotion, newChars: ctx.safeJson(v.newChars, []),
          mapName: v.mapName, endHook: v.endHook,
          keyEvents: ctx.safeJson(v.keyEvents, []),
          turningPoint: v.turningPoint || "",
          climax: v.climax || "",
        })),
      };
    } else {
      const inspiration = job.novel?.inspiration || "";
      volumeResult = await generateVolumeOutline(
        ctx, novelId, outlineResult, worldviewResult, charactersResult, styleResult, config, inspiration,
      );
      await ctx.persistGeneratedAssets(novelId, "volume", volumeResult);
    }
    await ctx.savePhaseResult(jobId, "planning", "volume_outline",
      { outline: outlineResult, inspiration: job.novel?.inspiration }, volumeResult);

    // 暂停等用户确认卷纲
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
