import { Router } from "express";
import { z } from "zod";
import {
  startAutoGenerate,
  getAutoGenerateStatus,
  pauseAutoGenerate,
  resumeAutoGenerate,
  stopAutoGenerate,
} from "../services/AutoGenerateService";
import {
  createForeshadow,
  updateForeshadowStatus,
  getActiveForeshadows,
  analyzeForeshadowsForPayoff,
  manageForeshadowLifecycle,
  buildForeshadowContext,
  getForeshadowStats,
} from "../services/ForeshadowService";
import {
  analyzeBookRhythm,
  generateRhythmOptimizations,
  autoOptimizeChapterRhythm,
  monitorRhythm,
} from "../services/RhythmOptimizationService";

const router = Router();

const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

// ============ 自动生成 API ============

// 启动自动生成
router.post("/:novelId/auto-generate/start", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const config = req.body;
    const status = await startAutoGenerate(novelId, config);
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// 获取自动生成状态
router.get("/:novelId/auto-generate/status", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const status = getAutoGenerateStatus(novelId);
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// 暂停自动生成
router.post("/:novelId/auto-generate/pause", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const result = pauseAutoGenerate(novelId);
    res.json({ success: true, data: { paused: result } });
  } catch (error) {
    next(error);
  }
});

// 恢复自动生成
router.post("/:novelId/auto-generate/resume", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const result = resumeAutoGenerate(novelId);
    res.json({ success: true, data: { resumed: result } });
  } catch (error) {
    next(error);
  }
});

// 停止自动生成
router.post("/:novelId/auto-generate/stop", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const result = stopAutoGenerate(novelId);
    res.json({ success: true, data: { stopped: result } });
  } catch (error) {
    next(error);
  }
});

// ============ 伏笔 API ============

// 创建伏笔
router.post("/:novelId/foreshadows", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const foreshadow = await createForeshadow(novelId, req.body);
    res.status(201).json({ success: true, data: foreshadow });
  } catch (error) {
    next(error);
  }
});

// 获取活跃伏笔
router.get("/:novelId/foreshadows/active", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const foreshadows = await getActiveForeshadows(novelId);
    res.json({ success: true, data: foreshadows });
  } catch (error) {
    next(error);
  }
});

// 更新伏笔状态
router.put("/foreshadows/:id/status", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { status, payoffChapter } = req.body;
    const foreshadow = await updateForeshadowStatus(id, status, payoffChapter);
    res.json({ success: true, data: foreshadow });
  } catch (error) {
    next(error);
  }
});

// 分析伏笔回收
router.post("/:novelId/foreshadows/analyze", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { currentChapter } = req.body;
    const result = await analyzeForeshadowsForPayoff(novelId, currentChapter);
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 管理伏笔生命周期
router.post("/:novelId/foreshadows/lifecycle", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { currentChapter } = req.body;
    const result = await manageForeshadowLifecycle(novelId, currentChapter);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 获取伏笔上下文
router.get("/:novelId/foreshadows/context", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const currentChapter = req.query.chapter ? parseInt(req.query.chapter as string) : 0;
    const context = await buildForeshadowContext(novelId, currentChapter);
    res.json({ success: true, data: { context } });
  } catch (error) {
    next(error);
  }
});

// 伏笔统计
router.get("/:novelId/foreshadows/stats", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const stats = await getForeshadowStats(novelId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// ============ 节奏优化 API ============

// 分析全书节奏
router.get("/:novelId/rhythm/analyze", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const analysis = await analyzeBookRhythm(novelId);
    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

// 生成节奏优化建议
router.post("/:novelId/rhythm/optimize", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { fromChapter, toChapter } = req.body;
    const optimizations = await generateRhythmOptimizations(novelId, fromChapter, toChapter);
    res.json({ success: true, data: optimizations });
  } catch (error) {
    next(error);
  }
});

// 自动优化章节节奏
router.post("/:novelId/rhythm/optimize-chapter", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { chapterId } = req.body;
    const result = await autoOptimizeChapterRhythm(novelId, chapterId);
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 节奏监控
router.get("/:novelId/rhythm/monitor", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const result = await monitorRhythm(novelId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
