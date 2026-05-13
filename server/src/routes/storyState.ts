import { Router } from "express";
import { z } from "zod";
import {
  getOrCreateStoryState,
  updateStoryState,
  recordPleasurePoint,
  recordEmotionCurve,
  getPleasureHistory,
  getEmotionCurve,
  analyzePleasureRhythm,
  analyzeEmotionRhythm,
  buildStoryContext,
} from "../services/StoryStateService";

const router = Router();

const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

// 获取剧情状态
router.get("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const state = await getOrCreateStoryState(novelId);
    res.json({ success: true, data: state });
  } catch (error) {
    next(error);
  }
});

// 更新剧情状态
router.put("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const state = await updateStoryState(novelId, req.body);
    res.json({ success: true, data: state });
  } catch (error) {
    next(error);
  }
});

// 记录爽点
router.post("/:novelId/pleasure", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const point = await recordPleasurePoint(novelId, req.body);
    res.status(201).json({ success: true, data: point });
  } catch (error) {
    next(error);
  }
});

// 记录情绪曲线
router.post("/:novelId/emotion", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const curve = await recordEmotionCurve(novelId, req.body);
    res.status(201).json({ success: true, data: curve });
  } catch (error) {
    next(error);
  }
});

// 获取爽点历史
router.get("/:novelId/pleasure-history", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const history = await getPleasureHistory(novelId, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
});

// 获取情绪曲线
router.get("/:novelId/emotion-curve", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
    const curve = await getEmotionCurve(novelId, limit);
    res.json({ success: true, data: curve });
  } catch (error) {
    next(error);
  }
});

// 分析爽点节奏
router.get("/:novelId/pleasure-analysis", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const analysis = await analyzePleasureRhythm(novelId);
    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

// 分析情绪曲线
router.get("/:novelId/emotion-analysis", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const analysis = await analyzeEmotionRhythm(novelId);
    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

// 获取 AI 生成上下文
router.get("/:novelId/ai-context", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const context = await buildStoryContext(novelId);
    res.json({ success: true, data: { context } });
  } catch (error) {
    next(error);
  }
});

export default router;
