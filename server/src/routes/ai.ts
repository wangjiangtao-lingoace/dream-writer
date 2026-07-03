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

// AI 辅助写作：去AI味 / 增强压迫
router.post("/polish", async (req, res, next) => {
  try {
    const { content, mode } = req.body;
    if (!content || !mode) {
      res.status(400).json({ success: false, error: "内容和模式不能为空。" });
      return;
    }

    const { LlmInvokeService } = await import("../services/llm/LlmInvokeService");
    const llm = new LlmInvokeService();

    const promptMap: Record<string, string> = {
      deai: `你是一位资深网文编辑。请对以下文本进行"去AI味"改写。

要求：
1. 保留原文的故事情节、人物关系和核心信息
2. 打破AI常见的排比句式和对称结构
3. 增加口语化表达、个人化视角
4. 去掉"不禁"、"仿佛"、"宛如"等AI高频词
5. 加入更多感官细节和生活化描写
6. 保持与原文相近的篇幅

【原文】
${content}

请直接输出改写后的文本，不要添加任何解释：`,

      enhance: `你是一位资深网文编辑。请增强以下文本的紧张感和压迫氛围。

要求：
1. 保留原文的故事情节和人物关系
2. 使用短促有力的句式，增加节奏感
3. 加入更多感官描写（心跳、呼吸、触感、温度）
4. 增加内心独白和心理压力描写
5. 适当使用环境烘托（阴影、风声、寂静）
6. 保持与原文相近的篇幅

【原文】
${content}

请直接输出增强后的文本，不要添加任何解释：`,
    };

    const prompt = promptMap[mode];
    if (!prompt) {
      res.status(400).json({ success: false, error: "不支持的模式，可选：deai / enhance" });
      return;
    }

    const result = await llm.completeText({ prompt, temperature: 0.7, maxTokens: 4000 });
    if (!result) {
      res.status(500).json({ success: false, error: "AI 处理失败，请重试。" });
      return;
    }
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

// AI 辅助写作：续写当前章节
router.post("/continue-chapter", async (req, res, next) => {
  try {
    const { novelId, chapterId, content, maxWords } = req.body;
    if (!novelId || !chapterId || !content) {
      res.status(400).json({ success: false, error: "小说ID、章节ID和内容不能为空。" });
      return;
    }

    // 获取小说信息用于上下文
    const { prisma } = await import("../db/prisma");
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });

    const words = maxWords || 1500;

    const { LlmInvokeService } = await import("../services/llm/LlmInvokeService");
    const llm = new LlmInvokeService();

    const prompt = `你是一位资深网文作家。请根据已有内容，在章节末尾续写约${words}字。

要求：
1. 只输出续写的新内容，不要重复已有内容
2. 保持与前文一致的叙事风格、人称和时态
3. 自然衔接前文的情节和情感
4. 推进剧情发展，适当设置悬念
5. 保持网文的节奏感和可读性

【小说标题】${novel?.title || "未命名"}

【章节标题】${chapter?.title || "未命名章节"}

【已有内容】
${content}

请从上文结尾处自然续写：`;

    const result = await llm.completeText({ prompt, temperature: 0.8, maxTokens: 4000 });
    if (!result) {
      res.status(500).json({ success: false, error: "续写失败，请重试。" });
      return;
    }
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
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
