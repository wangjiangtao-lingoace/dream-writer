import { Router } from "express";
import { z } from "zod";
import {
  getCompressedMemoryContext,
  manageMemoryLifecycle,
  consolidateMemories,
  generateMemorySummary,
  autoManageMemories,
} from "../services/MemoryCompressionService";

const router = Router();

const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

// 获取压缩后的记忆上下文
router.get("/:novelId/compressed", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const chapterOrder = req.query.chapterOrder ? parseInt(req.query.chapterOrder as string) : 0;
    const context = await getCompressedMemoryContext(novelId, chapterOrder);
    res.json({ success: true, data: { context } });
  } catch (error) {
    next(error);
  }
});

// 管理记忆生命周期
router.post("/:novelId/lifecycle", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const chapterOrder = req.body.chapterOrder || 0;
    const result = await manageMemoryLifecycle(novelId, chapterOrder);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 整合相似记忆
router.post("/:novelId/consolidate", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const result = await consolidateMemories(novelId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 生成记忆摘要
router.get("/:novelId/summary", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const summary = await generateMemorySummary(novelId);
    res.json({ success: true, data: { summary } });
  } catch (error) {
    next(error);
  }
});

// 自动记忆管理
router.post("/:novelId/auto-manage", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const chapterOrder = req.body.chapterOrder || 0;
    const result = await autoManageMemories(novelId, chapterOrder);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
