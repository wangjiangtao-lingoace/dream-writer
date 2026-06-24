import { prisma } from "../../db/prisma";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";
import { generatePayoffChains } from "./generators";

/**
 * 爽点链生成阶段：在卷纲生成后、章纲生成前运行
 * 规划跨章节的爽点节奏链，确保长篇不水
 */
export async function executePayoffChainPhase(
  ctx: PhaseContext,
  jobId: string,
  novelId: string,
  config: PipelineConfig,
) {
  await ctx.updateJobProgress(jobId, "planning", "payoff_chains");

  // 检查是否已有爽点链
  const existing = await prisma.payoffChain.findMany({ where: { novelId } });
  if (existing.length > 0) {
    console.log(`[payoffChain] 已有${existing.length}条爽点链，跳过生成`);
    await ctx.savePhaseResult(jobId, "planning", "payoff_chains",
      { source: "skipped" }, { reason: "已有爽点链", count: existing.length });
    return;
  }

  // 加载大纲和卷纲
  const [outlineResult, volumeResult] = await Promise.all([
    ctx.getPhaseOutput(jobId, "outline", "outline").catch(() => null),
    ctx.getPhaseOutput(jobId, "planning", "volume_outline").catch(() => null),
  ]);

  if (!outlineResult) {
    console.warn("[payoffChain] 无大纲数据，跳过爽点链生成");
    return;
  }

  // 生成爽点链
  const chainResult = await generatePayoffChains(ctx, novelId, outlineResult, volumeResult, config);

  if (!chainResult?.payoffChains?.length) {
    console.warn("[payoffChain] 爽点链生成失败或为空");
    return;
  }

  // 保存到数据库
  for (const chain of chainResult.payoffChains) {
    if (!chain.name) continue;
    await prisma.payoffChain.upsert({
      where: { novelId_name: { novelId, name: chain.name } },
      create: {
        novelId,
        name: chain.name,
        description: chain.description || "",
        stages: JSON.stringify(chain.stages || []),
        status: "active",
      },
      update: {
        description: chain.description || "",
        stages: JSON.stringify(chain.stages || []),
      },
    }).catch(() => {});
  }

  // 保存阶段结果
  await ctx.savePhaseResult(jobId, "planning", "payoff_chains",
    { outline: outlineResult, volumes: volumeResult },
    chainResult);

  // 保存到知识库
  await ctx.saveToKnowledgeBase(novelId, 'pleasure', '爽点链规划', chainResult);

  console.log(`[payoffChain] 生成${chainResult.payoffChains.length}条爽点链`);
}

/**
 * 获取当前章节应推进的爽点链阶段
 */
export async function getActivePayoffStages(
  novelId: string,
  chapterOrder: number,
): Promise<Array<{ chainName: string; chainDescription: string; stage: { chapter: number; event: string; status: string } }>> {
  const chains = await prisma.payoffChain.findMany({
    where: { novelId, status: "active" },
  });

  const active: Array<{ chainName: string; chainDescription: string; stage: { chapter: number; event: string; status: string } }> = [];

  for (const chain of chains) {
    let stages: Array<{ chapter: number; event: string; status?: string }> = [];
    try { stages = JSON.parse(chain.stages || "[]"); } catch { continue; }

    // 找到当前章节应该推进的阶段（最近的未完成阶段）
    const pendingStage = stages.find(s => s.chapter <= chapterOrder && s.status !== "done");
    if (pendingStage) {
      active.push({
        chainName: chain.name,
        chainDescription: chain.description,
        stage: { chapter: pendingStage.chapter, event: pendingStage.event, status: pendingStage.status || "pending" },
      });
    } else {
      // 找到下一个待推进的阶段
      const nextStage = stages.find(s => s.chapter > chapterOrder);
      if (nextStage && nextStage.chapter - chapterOrder <= 5) {
        active.push({
          chainName: chain.name,
          chainDescription: chain.description,
          stage: { chapter: nextStage.chapter, event: nextStage.event, status: "upcoming" },
        });
      }
    }
  }

  return active;
}
