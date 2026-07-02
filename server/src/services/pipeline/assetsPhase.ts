import { prisma } from "../../db/prisma";
import { getRagRetrieveService } from "../RagRetrieveService";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext, autoAdvanceOrPause } from "./pipelineUtils";
import { generateWorldview, generateCharacters, generateStyle } from "./generators";
import { parseLlmJson } from "../../utils/parseJson";
import { executeStyleAnalysisPhase } from "./styleAnalysisPhase";
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

  // 结构化输入模式：补充用户提供的角色/世界观中缺失的字段
  if (config.inputMode === "structured") {
    await supplementMissingDetails(ctx, novelId);
  }

  const knowledgeContext = await getRagRetrieveService()?.retrieve(
    `${job.novel.title} ${job.novel.inspiration || ""} ${config.genre || ""}`,
    { novelId, topK: 10 }
  ) ?? "";

  const [worldviewRes, charactersRes, styleRes] = await Promise.allSettled([
    prisma.worldview.findFirst({ where: { novelId } }),
    prisma.character.findMany({ where: { novelId }, take: 1 }),
    prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } }),
  ]);
  const existingWorldview = worldviewRes.status === "fulfilled" ? worldviewRes.value : null;
  const existingCharacters = charactersRes.status === "fulfilled" ? charactersRes.value : [];
  const existingStyle = styleRes.status === "fulfilled" ? styleRes.value : null;

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
          appearance: c.appearance, background: c.background, personality: c.personality || c.arcSummary,
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
  const styleWorldview = await ctx.getPhaseOutput(jobId, "assets", "worldview").catch(() => null);
  const styleCharacters = await ctx.getPhaseOutput(jobId, "assets", "characters").catch(() => null);

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
    const styleResult = await generateStyle(ctx, novelId, outlineResult, styleWorldview || {}, styleCharacters || {}, config);
    await ctx.savePhaseResult(jobId, "assets", "style", { outline: outlineResult }, styleResult);
    await ctx.saveToKnowledgeBase(novelId, 'style', '写作风格', styleResult);
  }

  await autoAdvanceOrPause(jobId, "assets", async () => {
    // 结构化输入 + 有已有章节 → 先运行风格分析
    if (config.inputMode === "structured") {
      const hasChapters = await prisma.chapter.count({ where: { novelId, content: { not: "" } } });
      if (hasChapters > 0) {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "style_analysis", currentStep: "analyze" },
        });
        await executeStyleAnalysisPhase(ctx, jobId, novelId, config);
        // 风格分析完成后自动进入 planning
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "planning", currentStep: "volume_outline" },
        });
        await executePlanningPhase_unified(ctx, jobId);
        return;
      }
    }
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "running", currentPhase: "planning", currentStep: "volume_outline" },
    });
    await executePlanningPhase_unified(ctx, jobId);
  });
}

/**
 * 补充用户提供的角色/世界观中缺失的字段（仅填空，不重写已有内容）
 */
export async function supplementMissingDetails(
  ctx: PhaseContext,
  novelId: string,
): Promise<{ charactersUpdated: number; worldviewUpdated: boolean }> {
  let charactersUpdated = 0;
  let worldviewUpdated = false;

  // 补充角色缺失字段
  const characters = await prisma.character.findMany({ where: { novelId } });
  for (const char of characters) {
    const emptyFields: string[] = [];
    if (!char.appearance?.trim()) emptyFields.push("appearance（外貌）");
    if (!char.background?.trim()) emptyFields.push("background（背景故事）");
    if (!char.motivation?.trim()) emptyFields.push("motivation（动机/目标）");
    if (!char.relationsText?.trim()) emptyFields.push("relationsText（人物关系）");

    if (emptyFields.length === 0) continue;

    const system = `你是一位资深网文人物设计师。用户已提供人物的基础信息，你的任务是只补充缺失的字段。
核心原则：已有内容不可修改，只为空字段生成内容。风格和调性要与已有内容保持一致。`;

    const prompt = `请为以下人物补充缺失的字段。

【人物信息】
姓名：${char.name}
${char.role ? `角色定位：${char.role}` : ""}
${char.identity ? `身份：${char.identity}` : ""}
${char.motivation ? `动机：${char.motivation}` : ""}
${char.appearance ? `外貌：${char.appearance}` : ""}
${char.background ? `背景：${char.background}` : ""}
${char.relationsText ? `关系：${char.relationsText}` : ""}

需要补充的字段：${emptyFields.join("、")}

请只返回需要补充的字段的JSON：
{
  ${emptyFields.map(f => `"${f.split("（")[0]}": "补充内容"`).join(",\n  ")}
}`;

    try {
      const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.5, maxTokens: 1500 });
      const parsed = parseLlmJson(result) || {};
      const updateData: Record<string, string> = {};
      if (parsed.appearance && !char.appearance?.trim()) updateData.appearance = parsed.appearance;
      if (parsed.background && !char.background?.trim()) updateData.background = parsed.background;
      if (parsed.motivation && !char.motivation?.trim()) updateData.motivation = parsed.motivation;
      if (parsed.relationsText && !char.relationsText?.trim()) updateData.relationsText = parsed.relationsText;

      if (Object.keys(updateData).length > 0) {
        await prisma.character.update({ where: { id: char.id }, data: updateData });
        charactersUpdated++;
      }
    } catch (e) {
      console.warn(`补充角色 ${char.name} 缺失字段失败:`, e);
    }
  }

  // 补充世界观缺失字段
  const worldview = await prisma.worldview.findFirst({ where: { novelId } });
  if (worldview) {
    const emptyFields: string[] = [];
    if (!worldview.rules?.trim()) emptyFields.push("rules（世界规则）");
    if (!worldview.powerSystem?.trim()) emptyFields.push("powerSystem（力量体系）");
    if (!worldview.geography?.trim()) emptyFields.push("geography（地理环境）");
    if (!worldview.factions?.trim()) emptyFields.push("factions（势力分布）");
    if (!worldview.history?.trim()) emptyFields.push("history（历史背景）");

    if (emptyFields.length > 0) {
      const system = `你是一位资深网文世界观架构师。用户已提供世界观的基础设定，你的任务是只补充缺失的字段。
核心原则：已有内容不可修改，只为空字段生成内容。`;

      const prompt = `请为以下世界观补充缺失的字段。

【世界观信息】
${worldview.name ? `名称：${worldview.name}` : ""}
${worldview.summary ? `概述：${worldview.summary}` : ""}
${worldview.rules ? `规则：${worldview.rules}` : ""}
${worldview.powerSystem ? `力量体系：${worldview.powerSystem}` : ""}
${worldview.geography ? `地理：${worldview.geography}` : ""}
${worldview.factions ? `势力：${worldview.factions}` : ""}
${worldview.history ? `历史：${worldview.history}` : ""}

需要补充的字段：${emptyFields.join("、")}

请只返回需要补充的字段的JSON：
{
  ${emptyFields.map(f => `"${f.split("（")[0]}": "补充内容"`).join(",\n  ")}
}`;

      try {
        const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.5, maxTokens: 2000 });
        const parsed = parseLlmJson(result) || {};
        const updateData: Record<string, string> = {};
        if (parsed.rules && !worldview.rules?.trim()) updateData.rules = parsed.rules;
        if (parsed.powerSystem && !worldview.powerSystem?.trim()) updateData.powerSystem = parsed.powerSystem;
        if (parsed.geography && !worldview.geography?.trim()) updateData.geography = parsed.geography;
        if (parsed.factions && !worldview.factions?.trim()) updateData.factions = parsed.factions;
        if (parsed.history && !worldview.history?.trim()) updateData.history = parsed.history;

        if (Object.keys(updateData).length > 0) {
          await prisma.worldview.update({ where: { id: worldview.id }, data: updateData });
          worldviewUpdated = true;
        }
      } catch (e) {
        console.warn("补充世界观缺失字段失败:", e);
      }
    }
  }

  return { charactersUpdated, worldviewUpdated };
}
