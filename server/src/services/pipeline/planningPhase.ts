import { prisma } from "../../db/prisma";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext, autoAdvanceOrPause } from "./pipelineUtils";
import { generateVolumeOutline } from "./generators";
import { executeChapterOutlinesPhase } from "./chapterOutlinesPhase";
import { executePayoffChainPhase } from "./payoffChainPhase";
import { loadMaterialContextForNovel } from "./materialContext";

/**
 * 统一的规划阶段（卷纲生成）
 * 同时支持 create 模式和 imitation 模式
 */
export async function executePlanningPhase_unified(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const novelId = job.novelId;

  try {
    // 1. 加载前置阶段结果
    const outlineResult = await ctx.getPhaseOutput(jobId, "outline", "outline");
    const [worldviewResult, charactersResult, styleResult] = await Promise.all([
      ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
      ctx.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
      ctx.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
    ]);

    // 2. 构建额外上下文（bookAnalysis + imitationPlan）
    const extraContexts: string[] = [];
    if (config.bookAnalysisId) {
      const bookAnalysisCtx = await ctx.buildBookAnalysisContext(novelId, config, jobId);
      if (bookAnalysisCtx) extraContexts.push(bookAnalysisCtx);
    }
    if (config.imitationPlanId) {
      const imitationPlanCtx = await ctx.buildImitationPlanContext(novelId, config, jobId);
      if (imitationPlanCtx) extraContexts.push(imitationPlanCtx);
    }
    const extraContext = extraContexts.filter(Boolean).join("\n\n");

    // 3. 生成卷纲
    await ctx.updateJobProgress(jobId, "planning", "volume_outline");
    let volumeResult: any;
    // 加载素材资产上下文（整体规划、完整创作文档、钩子表、约束规则等）
    const materialContext = await loadMaterialContextForNovel(novelId, jobId);
    // 素材中包含整体规划时，忽略大纲阶段提取的卷结构，用素材中的规划重新生成
    const hasOverallPlan = materialContext.includes("【作者原始素材资产】") && materialContext.includes("整体规划");
    const existingVolumes = await prisma.volume.findMany({ where: { novelId }, take: 1 });
    if (existingVolumes.length > 0 && !hasOverallPlan) {
      // 复用已有卷纲（仅当素材中没有整体规划时）
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
      // 素材有整体规划时，删除旧卷重新生成；无旧卷时直接生成
      if (existingVolumes.length > 0 && hasOverallPlan) {
        await prisma.chapterOutline.deleteMany({ where: { novelId } });
        await prisma.volume.deleteMany({ where: { novelId } });
      }
      // 构建 inspiration：原始灵感 + 额外上下文（素材有整体规划时截断灵感文本，避免 prompt 过长）
      let inspirationText = job.novel?.inspiration || "";
      if (hasOverallPlan && inspirationText.length > 3000) {
        inspirationText = inspirationText.slice(0, 3000) + "\n...(灵感文本截断，详细内容见素材资产)";
      }
      const inspiration = [inspirationText, extraContext].filter(Boolean).join("\n\n");
      volumeResult = await generateVolumeOutline(
        ctx, novelId, outlineResult, worldviewResult, charactersResult, styleResult, config, inspiration, undefined, materialContext,
      );
      await ctx.persistGeneratedAssets(novelId, "volume", volumeResult);
    }
    await ctx.savePhaseResult(jobId, "planning", "volume_outline",
      { outline: outlineResult, inspiration: job.novel?.inspiration }, volumeResult);

    // 3.5 生成爽点链（卷纲之后、章纲之前）
    await executePayoffChainPhase(ctx, jobId, novelId, config);

    // 4. 暂停等用户确认卷纲
    await autoAdvanceOrPause(jobId, "planning", async () => {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "planning", currentStep: "chapter_outline_vol_1" },
      });
      await executeChapterOutlinesPhase(ctx, jobId);
    });
  } catch (error: any) {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "error", lastError: error.message },
    });
  }
}
