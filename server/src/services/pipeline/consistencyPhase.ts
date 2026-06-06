import { prisma } from "../../db/prisma";
import { PhaseContext, safeJson, autoAdvanceOrPause } from "./pipelineUtils";
import { generateConsistencyCheck } from "./generators";
import { executeWritingPhase } from "./writingPhase";

export async function executeConsistencyCheckPhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  try {
    const novelId = job.novelId;

    // 加载所有规划数据
    const [chapterOutlines, hooks, foreshadows, mainlines, pleasurePoints, emotionCurves] = await Promise.all([
      prisma.chapterOutline.findMany({ where: { novelId }, orderBy: { sortOrder: "asc" } }),
      prisma.hook.findMany({ where: { novelId }, orderBy: { plannedChapter: "asc" } }),
      prisma.foreshadow.findMany({ where: { novelId }, orderBy: { plantChapter: "asc" } }),
      prisma.mainline.findMany({ where: { novelId }, orderBy: { sortOrder: "asc" } }),
      prisma.pleasurePoint.findMany({ where: { novelId }, orderBy: { chapterOrder: "asc" } }),
      prisma.emotionCurve.findMany({ where: { novelId }, orderBy: { chapterOrder: "asc" } }),
    ]);

    // 加载核心资产（大纲、世界观、人物、风格）
    const [outlineAsset, worldviewAsset, characterAsset, styleAsset] = await Promise.all([
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "outline" }, orderBy: { updatedAt: "desc" } }),
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "worldview" }, orderBy: { updatedAt: "desc" } }),
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "character" }, orderBy: { updatedAt: "desc" } }),
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "style" }, orderBy: { updatedAt: "desc" } }),
    ]);

    const outline = outlineAsset ? safeJson(outlineAsset.content, null) : null;
    const worldview = worldviewAsset ? safeJson(worldviewAsset.content, null) : null;
    const characters = characterAsset ? safeJson(characterAsset.content, null) : null;
    const style = styleAsset ? safeJson(styleAsset.content, null) : null;

    // 构建规划摘要
    const planSummary = buildPlanSummaryForConsistency(
      chapterOutlines, hooks, foreshadows, mainlines, pleasurePoints, emotionCurves,
    );

    await ctx.updateJobProgress(jobId, "consistency_check", "consistency");
    const result = await generateConsistencyCheck(ctx, novelId, planSummary, outline, worldview, characters, style);
    await ctx.savePhaseResult(jobId, "consistency_check", "consistency",
      { planSummaryLength: planSummary.length }, result);

    // 将一致性问题写入 ConsistencyIssue 表
    if (Array.isArray(result?.issues) && result.issues.length > 0) {
      await prisma.consistencyIssue.createMany({
        data: result.issues.map((issue: any) => ({
          novelId,
          type: issue.type || "character",
          severity: issue.severity || "medium",
          description: issue.description || "",
          evidence: Array.isArray(issue.chapters) ? `相关章节：第${issue.chapters.join("、")}章` : "",
          suggestion: issue.suggestion || "",
          status: "open",
        })),
      });
    }

    await autoAdvanceOrPause(jobId, "consistency_check", async () => {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
      });
      await executeWritingPhase(ctx, jobId);
    });
  } catch (error: any) {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "error", lastError: error.message },
    });
  }
}

export function buildPlanSummaryForConsistency(
  chapterOutlines: any[], hooks: any[], foreshadows: any[],
  mainlines: any[], pleasurePoints: any[], emotionCurves: any[],
): string {
  const parts: string[] = [];

  // 章纲摘要
  parts.push("## 章纲规划");
  for (const ch of chapterOutlines) {
    parts.push(`第${ch.sortOrder}章 [${ch.title}]：目标=${ch.goal || "无"} | 冲突=${ch.conflict || "无"} | 情绪=${ch.emotion || "无"} | 钩子=${ch.hook || "无"}`);
  }

  // 钩子状态
  parts.push("\n## 钩子状态");
  for (const h of hooks) {
    parts.push(`[${h.status}] ${h.title}（类型:${h.type}，强度:${h.intensity}）：埋设于第${h.plannedChapter || "?"}章，计划回收于第${h.resolvedChapter || "?"}章`);
  }

  // 伏笔状态
  parts.push("\n## 伏笔状态");
  for (const f of foreshadows) {
    parts.push(`[${f.status}] ${f.title}：埋设于第${f.plantChapter}章，计划回收于第${f.payoffChapter || "?"}章`);
  }

  // 主线
  parts.push("\n## 主线规划");
  for (const m of mainlines) {
    const milestones = safeJson(m.milestones, []);
    const milestoneStr = milestones.map((ms: any) => `第${ms.chapter}章:${ms.event}`).join("、");
    parts.push(`[${m.type}] ${m.title}：第${m.startChapter || "?"}章→第${m.endChapter || "?"}章 | 里程碑：${milestoneStr || "无"} | 结局：${m.resolution || "未定"}`);
  }

  // 爽点分布
  parts.push("\n## 爽点分布");
  for (const pp of pleasurePoints) {
    parts.push(`第${pp.chapterOrder}章 [${pp.type}] 强度${pp.intensity}：${pp.description || ""}`);
  }

  // 情绪曲线
  parts.push("\n## 情绪曲线");
  const climaxChapters = emotionCurves.filter(e => e.isClimax).map(e => e.chapterOrder);
  const turningPoints = emotionCurves.filter(e => e.isTurningPoint).map(e => e.chapterOrder);
  const breathingChapters = emotionCurves.filter(e => e.isBreathing).map(e => e.chapterOrder);
  parts.push(`高潮章节：${climaxChapters.join(",") || "无"}`);
  parts.push(`转折点：${turningPoints.join(",") || "无"}`);
  parts.push(`呼吸章节：${breathingChapters.join(",") || "无"}`);
  for (const ec of emotionCurves) {
    parts.push(`第${ec.chapterOrder}章：${ec.emotionType}（强度${ec.intensity}）`);
  }

  return parts.join("\n");
}
