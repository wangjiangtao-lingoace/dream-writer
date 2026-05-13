import { Router, Request, Response } from "express";
import * as AIService from "../services/AIService";
import { prisma } from "../db/prisma";

const router = Router();

/**
 * AI生成主线
 * POST /api/ai/generate-mainlines
 */
router.post("/generate-mainlines", async (req: Request, res: Response) => {
  try {
    const { novelId, count } = req.body;
    if (!novelId) {
      return res.status(400).json({ success: false, error: "缺少novelId" });
    }

    const mainlines = await AIService.generateMainlines({ novelId, count });

    // 保存到数据库
    const savedMainlines = [];
    for (let i = 0; i < mainlines.length; i++) {
      const ml = mainlines[i];
      const saved = await prisma.mainline.create({
        data: {
          novelId,
          title: ml.title,
          description: ml.description,
          type: ml.type || "main",
          startChapter: ml.startChapter,
          endChapter: ml.endChapter,
          milestones: JSON.stringify(ml.milestones || []),
          resolution: ml.resolution || "",
          priority: ml.priority || 5,
          sortOrder: i,
        },
      });
      savedMainlines.push(saved);
    }

    res.json({ success: true, data: savedMainlines });
  } catch (error: any) {
    console.error("生成主线失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * AI批量生成钩子
 * POST /api/ai/generate-hooks
 */
router.post("/generate-hooks", async (req: Request, res: Response) => {
  try {
    const { novelId, chapterCount } = req.body;
    if (!novelId) {
      return res.status(400).json({ success: false, error: "缺少novelId" });
    }

    const hooks = await AIService.generateHooks({ novelId, chapterCount });

    // 保存到数据库
    const savedHooks = [];
    for (const hook of hooks) {
      const saved = await prisma.hook.create({
        data: {
          novelId,
          title: hook.title,
          description: hook.description,
          type: hook.type || "suspense",
          intensity: hook.intensity || 5,
          plannedChapter: hook.plannedChapter,
          resolvedChapter: hook.resolvedChapter,
          status: "planted",
        },
      });
      savedHooks.push(saved);
    }

    res.json({ success: true, data: savedHooks });
  } catch (error: any) {
    console.error("生成钩子失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * AI学习风格
 * POST /api/ai/extract-style
 */
router.post("/extract-style", async (req: Request, res: Response) => {
  try {
    const { novelId, text } = req.body;
    if (!novelId || !text) {
      return res.status(400).json({ success: false, error: "缺少必要参数" });
    }

    const style = await AIService.extractStyleFromText({ novelId, text });

    // 保存到数据库
    const saved = await prisma.styleProfile.create({
      data: {
        novelId,
        name: style.name || "学习的风格",
        description: style.description || "",
        narrativePov: style.narrativePov || "third_person",
        tense: style.tense || "past",
        pacing: style.pacing || "balanced",
        sentenceLength: style.sentenceLength || "mixed",
        vocabulary: style.vocabulary || "modern",
        dialogueRatio: style.dialogueRatio || "balanced",
        emotionIntensity: style.emotionIntensity || "medium",
        humorLevel: style.humorLevel || "low",
        customRules: JSON.stringify(style.specialTechniques || []),
        isDefault: false,
      },
    });

    res.json({ success: true, data: saved });
  } catch (error: any) {
    console.error("风格学习失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * AI生成卷纲（增强版）
 * POST /api/ai/generate-volume-outline
 */
router.post("/generate-volume-outline", async (req: Request, res: Response) => {
  try {
    const { novelId, volumeCount } = req.body;
    if (!novelId) {
      return res.status(400).json({ success: false, error: "缺少novelId" });
    }

    const result = await AIService.generateVolumeOutline({
      novelId,
      volumeCount: volumeCount || 5,
    });

    res.json({ success: true, data: { outline: result } });
  } catch (error: any) {
    console.error("生成卷纲失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
