import { Router } from "express";
import { z } from "zod";
import {
  directorAnalyze,
  plotPlan,
  readerSimulation,
  creativeAdvice,
} from "../services/DirectorService";

const router = Router();

const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

// 导演分析
router.post("/:novelId/director-analyze", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { chapterOrder } = req.body;
    
    if (!chapterOrder) {
      res.status(400).json({ success: false, error: "章节序号不能为空。" });
      return;
    }

    const result = await directorAnalyze({ novelId, chapterOrder });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 剧情规划
router.post("/:novelId/plot-plan", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { currentChapter, planCount } = req.body;
    
    if (!currentChapter) {
      res.status(400).json({ success: false, error: "当前章节序号不能为空。" });
      return;
    }

    const result = await plotPlan({ novelId, currentChapter, planCount });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 读者模拟
router.post("/:novelId/reader-simulation", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { chapterId } = req.body;
    
    if (!chapterId) {
      res.status(400).json({ success: false, error: "章节ID不能为空。" });
      return;
    }

    const result = await readerSimulation({ novelId, chapterId });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 综合创作建议
router.post("/:novelId/creative-advice", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { chapterOrder } = req.body;
    
    if (!chapterOrder) {
      res.status(400).json({ success: false, error: "章节序号不能为空。" });
      return;
    }

    const result = await creativeAdvice({ novelId, chapterOrder });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

export default router;
