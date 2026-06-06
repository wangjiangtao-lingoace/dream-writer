import { prisma } from "../../db/prisma";
import { getRagRetrieveService } from "../RagRetrieveService";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext, autoAdvanceOrPause } from "./pipelineUtils";
import { generateWorldview, generateCharacters, generateStyle } from "./generators";
import { executePlanningPhase_unified } from "./planningPhase";

export async function executeAssetsPhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const novelId = job.novelId;
  const outlineResult = await ctx.getPhaseOutput(jobId, "outline", "outline");

  const knowledgeContext = await getRagRetrieveService()?.retrieve(
    `${job.novel.title} ${job.novel.inspiration || ""} ${config.genre || ""}`,
    { novelId, topK: 10 }
  ) ?? "";

  const [existingWorldview, existingCharacters, existingStyle] = await Promise.all([
    prisma.worldview.findFirst({ where: { novelId } }),
    prisma.character.findMany({ where: { novelId }, take: 1 }),
    prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } }),
  ]);

  // 世界观
  if (existingWorldview) {
    await ctx.updateJobProgress(jobId, "assets", "worldview");
    await ctx.savePhaseResult(jobId, "assets", "worldview",
      { outline: outlineResult, source: "decomposed" }, {
        name: existingWorldview.name, summary: existingWorldview.summary,
        rules: existingWorldview.rules, geography: existingWorldview.geography,
        factions: existingWorldview.factions, history: existingWorldview.history,
        powerSystem: existingWorldview.powerSystem,
      });
  } else {
    await ctx.updateJobProgress(jobId, "assets", "worldview");
    const worldviewResult = await generateWorldview(ctx, novelId, outlineResult, knowledgeContext);
    await ctx.savePhaseResult(jobId, "assets", "worldview", { outline: outlineResult }, worldviewResult);
    await ctx.saveToKnowledgeBase(novelId, 'worldview', '世界观设定', worldviewResult);
  }

  // 人物
  if (existingCharacters.length > 0) {
    await ctx.updateJobProgress(jobId, "assets", "characters");
    const allChars = await prisma.character.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" } });
    await ctx.savePhaseResult(jobId, "assets", "characters",
      { outline: outlineResult, source: "decomposed" }, {
        characters: allChars.map(c => ({
          name: c.name, role: c.role, identity: c.identity, motivation: c.motivation,
          appearance: c.appearance, background: c.background, personality: c.arcSummary,
          abilities: "", relationsText: c.relationsText,
        })),
      });
  } else {
    await ctx.updateJobProgress(jobId, "assets", "characters");
    const charactersResult = await generateCharacters(ctx, novelId, outlineResult,
      await ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})), knowledgeContext);
    await ctx.savePhaseResult(jobId, "assets", "characters",
      { outline: outlineResult }, charactersResult);
    await ctx.saveToKnowledgeBase(novelId, 'character', '人物设定', charactersResult);
  }

  // 风格（依赖世界观和人物，需在它们之后生成）
  const styleWorldview = await ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({}));
  const styleCharacters = await ctx.getPhaseOutput(jobId, "assets", "characters").catch(() => ({}));

  if (existingStyle) {
    await ctx.updateJobProgress(jobId, "assets", "style");
    const enhancedStyle = ctx.safeJson(existingStyle.customRules, {});
    await ctx.savePhaseResult(jobId, "assets", "style",
      { outline: outlineResult, source: "decomposed" }, {
        name: existingStyle.name, description: existingStyle.description,
        narrativePov: existingStyle.narrativePov, tense: existingStyle.tense,
        pacing: existingStyle.pacing, ...enhancedStyle,
      });
  } else {
    await ctx.updateJobProgress(jobId, "assets", "style");
    const styleResult = await generateStyle(ctx, novelId, outlineResult, styleWorldview, styleCharacters, config);
    await ctx.savePhaseResult(jobId, "assets", "style", { outline: outlineResult }, styleResult);
    await ctx.saveToKnowledgeBase(novelId, 'style', '写作风格', styleResult);
  }

  await autoAdvanceOrPause(jobId, "assets", async () => {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "running", currentPhase: "planning", currentStep: "volume_outline" },
    });
    await executePlanningPhase_unified(ctx, jobId);
  });
}
