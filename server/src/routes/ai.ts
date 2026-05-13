import { Router } from "express";
import { z } from "zod";
import { initSSE, writeSSEFrame } from "../llm/streaming";
import {
  generateInspiration,
  generateVolumeOutline,
  generateChapterOutline,
  generateChapterContent,
  generateChapterContentStream,
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

  try {
    const { novelId, chapterId } = req.params;
    let fullContent = "";

    for await (const chunk of generateChapterContentStream({ novelId, chapterId })) {
      if (res.writableEnded) break;
      fullContent += chunk;
      writeSSEFrame(res, { type: "chunk", content: chunk });
    }

    writeSSEFrame(res, { type: "done", fullContent });
    res.end();
  } catch (error) {
    if (!res.writableEnded) {
      writeSSEFrame(res, {
        type: "error",
        error: error instanceof Error ? error.message : "正文生成失败。",
      });
      res.end();
    }
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
