import { Router } from "express";
import { z } from "zod";
import { initSSE, writeSSEFrame } from "../llm/streaming";
import {
  generateInspiration,
  generateVolumeOutline,
  generateChapterOutline,
  generateChapterContent,
  checkConsistency,
} from "../services/AIService";

const router = Router();

// 灵感生成
router.post("/inspiration", async (req, res, next) => {
  try {
    const { genre, audience, keywords } = req.body;
    const result = await generateInspiration({ genre, audience, keywords });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 卷纲生成
router.post("/volume-outline", async (req, res, next) => {
  try {
    const { novelId, volumeCount, genre, inspiration } = req.body;
    if (!novelId) {
      res.status(400).json({ success: false, error: "小说ID不能为空。" });
      return;
    }
    const result = await generateVolumeOutline({ novelId, volumeCount, genre, inspiration });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 章纲生成
router.post("/chapter-outline", async (req, res, next) => {
  try {
    const { novelId, volumeId, chapterCount } = req.body;
    if (!novelId || !volumeId) {
      res.status(400).json({ success: false, error: "小说ID和卷ID不能为空。" });
      return;
    }
    const result = await generateChapterOutline({ novelId, volumeId, chapterCount });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// 正文生成（流式）
router.post("/chapter-content/:novelId/:chapterId", async (req, res) => {
  const disposeHeartbeat = initSSE(res);
  const startTime = Date.now();

  try {
    const { novelId, chapterId } = req.params;
    
    // 生成正文
    const result = await generateChapterContent({ novelId, chapterId });
    
    // 模拟流式输出
    const chunks = result.match(/.{1,50}|\n/gus) || [result];
    for (const chunk of chunks) {
      writeSSEFrame(res, { type: "chunk", content: chunk });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    
    writeSSEFrame(res, { type: "done", fullContent: result });
    res.end();
  } catch (error) {
    writeSSEFrame(res, {
      type: "error",
      error: error instanceof Error ? error.message : "正文生成失败。",
    });
    res.end();
  } finally {
    disposeHeartbeat();
  }
});

// 一致性校验
router.post("/consistency-check", async (req, res, next) => {
  try {
    const { novelId, chapterId } = req.body;
    if (!novelId || !chapterId) {
      res.status(400).json({ success: false, error: "小说ID和章节ID不能为空。" });
      return;
    }
    const result = await checkConsistency({ novelId, chapterId });
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

export default router;
