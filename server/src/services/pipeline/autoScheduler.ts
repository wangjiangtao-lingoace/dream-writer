/**
 * 自动续写调度器
 * 写完一批后直接调用 executeWritingPhase 写下一批，不重跑整个 pipeline
 */

import { prisma } from "../../db/prisma";
import { PipelineConfig } from "../PipelineService";

/**
 * 调度下一批写作任务
 */
export async function scheduleNextBatch(
  novelId: string,
  jobId: string,
  config: PipelineConfig,
): Promise<void> {
  const totalChapters = (config.volumeCount || 5) * (config.chaptersPerVolume || 30);
  const writtenCount = await prisma.chapter.count({
    where: { novelId, content: { not: "" } },
  });

  if (writtenCount >= totalChapters) {
    console.log(`[autoScheduler] 全书完成，共${writtenCount}章，触发终检`);
    await runFinalConsistencyCheck(novelId);
    return;
  }

  const remaining = totalChapters - writtenCount;
  let batchSize = Math.min(config.autoDraftChapters || 3, remaining);
  // P0 #2: maxChaptersPerBatch 限制
  if (config.maxChaptersPerBatch && config.maxChaptersPerBatch > 0) {
    batchSize = Math.min(batchSize, config.maxChaptersPerBatch);
  }
  const startOrder = writtenCount + 1;

  console.log(`[autoScheduler] 调度下一批：从第${startOrder}章开始，写${batchSize}章（剩余${remaining}章）`);

  setTimeout(async () => {
    try {
      const { PipelineService } = await import("../PipelineService");
      const { executeWritingPhase } = await import("./writingPhase");
      const pipelineService = new PipelineService();
      // 直接调用写作函数，跳过规划阶段
      await executeWritingPhase(pipelineService.ctx, jobId, startOrder);
    } catch (e) {
      console.error("[autoScheduler] 自动续写失败:", e);
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "error", lastError: `自动续写失败: ${e}` },
      });
    }
  }, 5000);
}

/**
 * 全书完成终检
 */
export async function runFinalConsistencyCheck(novelId: string): Promise<void> {
  console.log("[autoScheduler] 开始全书终检...");

  try {
    // 统计数据
    const [totalChapters, totalWords, hooks, foreshadows, mainlines, characters] = await Promise.all([
      prisma.chapter.count({ where: { novelId, content: { not: "" } } }),
      prisma.chapter.aggregate({ where: { novelId, content: { not: "" } }, _sum: { wordCount: true } }),
      prisma.hook.findMany({ where: { novelId }, select: { status: true } }),
      prisma.foreshadow.findMany({ where: { novelId }, select: { status: true } }),
      prisma.mainline.findMany({ where: { novelId }, select: { status: true } }),
      prisma.character.findMany({ where: { novelId }, select: { name: true, lastAppear: true } }),
    ]);

    // 计算回收率
    const hookTotal = hooks.length;
    const hookResolved = hooks.filter(h => h.status === "resolved").length;
    const hookRate = hookTotal > 0 ? Math.round((hookResolved / hookTotal) * 100) : 100;

    const fsTotal = foreshadows.length;
    const fsResolved = foreshadows.filter(f => f.status === "paid_off").length;
    const fsRate = fsTotal > 0 ? Math.round((fsResolved / fsTotal) * 100) : 100;

    // 主线完成度
    const mainlineTotal = mainlines.length;
    const mainlineCompleted = mainlines.filter(m => m.status === "completed").length;
    const mainlineRate = mainlineTotal > 0 ? Math.round((mainlineCompleted / mainlineTotal) * 100) : 100;

    // 沉默角色（>50 章未出场）
    const silentCharacters = characters.filter(c =>
      c.lastAppear && c.lastAppear < totalChapters - 50
    ).length;

    // 平均质量分
    const avgQuality = await prisma.chapter.aggregate({
      where: { novelId, qualityScore: { not: null } },
      _avg: { qualityScore: true },
    });

    const report = {
      totalChapters,
      totalWords: totalWords._sum.wordCount || 0,
      hookResolutionRate: hookRate,
      hookTotal,
      hookResolved,
      foreshadowResolutionRate: fsRate,
      foreshadowTotal: fsTotal,
      foreshadowResolved: fsResolved,
      mainlineCompletionRate: mainlineRate,
      characterCount: characters.length,
      silentCharacters,
      avgChapterQuality: Math.round(avgQuality._avg.qualityScore || 0),
      completedAt: new Date().toISOString(),
    };

    // 保存到 KnowledgeAsset
    await prisma.knowledgeAsset.create({
      data: {
        novelId,
        title: "全书健康报告",
        category: "health_report",
        content: JSON.stringify(report, null, 2),
      },
    });

    // 更新 PipelineJob 状态
    await prisma.pipelineJob.update({
      where: { novelId },
      data: {
        status: "completed",
        currentPhase: "completed",
        currentStep: "final_check",
        progress: 100,
      },
    }).catch(() => {});

    console.log("[autoScheduler] 全书终检完成:", report);
  } catch (e) {
    console.error("[autoScheduler] 全书终检失败:", e);
  }
}
