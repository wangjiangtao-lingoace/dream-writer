import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { pipelineService, PipelineConfig } from "../services/PipelineService";
import { initSSE, writeSSEFrame } from "../llm/streaming";

const router = Router();

// 启动流程
router.post("/start", async (req: Request, res: Response) => {
  try {
    const { novelId, config } = req.body;
    if (!novelId) {
      return res.status(400).json({ success: false, error: "缺少novelId" });
    }
    const job = await pipelineService.startPipeline(novelId, config || {});
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取小说的流程状态
router.get("/novel/:novelId", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const status = await pipelineService.getNovelPipelineStatus(novelId);
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/novel/:novelId/materialize-assets", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const result = await pipelineService.materializePipelineResults(novelId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:jobId/material-report", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const result = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: "outline", step: "material_import" } },
    });
    if (!result) {
      return res.status(404).json({ success: false, error: "素材导入报告不存在" });
    }
    res.json({ success: true, data: JSON.parse(result.output) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SSE 流式推送写作阶段进度
router.get("/:jobId/stream", async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;

  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) {
    return res.status(404).json({ success: false, error: "流程不存在" });
  }

  const disposeHeartbeat = initSSE(res);
  const reportedChapters = new Map<number, string>();
  let reportedPhase: string | null = job.currentPhase;
  let lastCheckTime = new Date(Date.now() - 5000);
  let closed = false;

  req.on("close", () => {
    closed = true;
  });

  const poll = setInterval(async () => {
    if (closed || res.writableEnded) {
      clearInterval(poll);
      disposeHeartbeat();
      return;
    }

    try {
      const currentJob = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
      if (!currentJob) {
        clearInterval(poll);
        disposeHeartbeat();
        writeSSEFrame(res, { type: "error", error: "流程记录不存在" });
        res.end();
        return;
      }

      const isTerminal = currentJob.status === "completed" || currentJob.status === "error";

      // 阶段级进度推送（非 writing 阶段）
      if (currentJob.currentPhase !== "writing") {
        const phaseResults = await prisma.phaseResult.findMany({
          where: {
            jobId,
            updatedAt: { gt: lastCheckTime },
          },
          select: { phase: true, step: true, status: true, selfScore: true },
        });

        for (const pr of phaseResults) {
          writeSSEFrame(res, {
            type: "chunk",
            content: JSON.stringify({
              phase: pr.phase,
              step: pr.step,
              status: pr.status === "completed" || pr.status === "confirmed" ? "completed" : "generating",
              selfScore: pr.selfScore,
            }),
          });
        }

        // 推送阶段切换
        if (currentJob.currentPhase !== reportedPhase) {
          reportedPhase = currentJob.currentPhase;
          writeSSEFrame(res, {
            type: "chunk",
            content: JSON.stringify({
              phase: currentJob.currentPhase,
              step: currentJob.currentStep,
              status: "phase_change",
              progress: currentJob.progress,
            }),
          });
        }
      }

      const chapters = await prisma.chapter.findMany({
        where: {
          novelId: job.novelId,
          source: { in: ["imitation_pipeline", "pipeline"] },
          updatedAt: { gt: lastCheckTime },
        },
        orderBy: { order: "asc" },
      });

      lastCheckTime = new Date();

      for (const ch of chapters) {
        const prevStatus = reportedChapters.get(ch.order);
        const currentStatus = ch.status === "drafted" ? "completed" : "generating";
        if (prevStatus === currentStatus) continue;

        reportedChapters.set(ch.order, currentStatus);
        writeSSEFrame(res, {
          type: "chunk",
          content: JSON.stringify({
            phase: "writing",
            step: "chapter_drafts",
            chapterOrder: ch.order,
            chapterTitle: ch.title,
            status: currentStatus,
            wordCount: ch.wordCount,
            preview: ch.content ? ch.content.slice(0, 100) : "",
          }),
        });
      }

      if (isTerminal) {
        clearInterval(poll);
        disposeHeartbeat();

        if (currentJob.status === "error") {
          writeSSEFrame(res, { type: "error", error: currentJob.lastError || "写作阶段执行失败" });
        } else {
          const totalChapters = await prisma.chapter.count({
            where: { novelId: job.novelId, source: { in: ["imitation_pipeline", "pipeline"] } },
          });
          writeSSEFrame(res, {
            type: "done",
            fullContent: JSON.stringify({ status: "completed", totalChapters }),
          });
        }
        res.end();
      }
    } catch (err) {
      clearInterval(poll);
      disposeHeartbeat();
      writeSSEFrame(res, {
        type: "error",
        error: err instanceof Error ? err.message : "轮询进度失败",
      });
      res.end();
    }
  }, 2000);
});

// 获取流程详情
router.get("/:jobId", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const status = await pipelineService.getStatus(jobId);
    if (!status) {
      return res.status(404).json({ success: false, error: "流程不存在" });
    }
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 暂停流程
router.post("/:jobId/pause", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    await pipelineService.pausePipeline(jobId);
    res.json({ success: true, message: "流程已暂停" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 恢复流程
router.post("/:jobId/resume", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    await pipelineService.resumePipeline(jobId);
    res.json({ success: true, message: "流程已恢复" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 确认阶段结果
router.post("/:jobId/confirm", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const { phase, step, feedback } = req.body;
    if (!phase || !step) {
      return res.status(400).json({ success: false, error: "缺少phase或step" });
    }
    await pipelineService.confirmPhase(jobId, phase, step, feedback);
    res.json({ success: true, message: "已确认" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重新生成某步骤
router.post("/:jobId/regenerate", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const { phase, step, userHint } = req.body;
    if (!phase || !step) {
      return res.status(400).json({ success: false, error: "缺少phase或step" });
    }
    const result = await pipelineService.regenerateStep(jobId, phase, step, userHint);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 使用用户内容
router.post("/:jobId/user-content", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const { phase, step, content } = req.body;
    if (!phase || !step || !content) {
      return res.status(400).json({ success: false, error: "缺少必要参数" });
    }
    await pipelineService.useUserContent(jobId, phase, step, content);
    res.json({ success: true, message: "已使用用户内容" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
