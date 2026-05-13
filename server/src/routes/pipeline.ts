import { Router, Request, Response } from "express";
import { pipelineService, PipelineConfig } from "../services/PipelineService";

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
