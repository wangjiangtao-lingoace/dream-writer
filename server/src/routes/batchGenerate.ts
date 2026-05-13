import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { generateChapterContent } from "../services/AIService";
import { generateStyledContent } from "../services/StyleService";
import { buildStoryContext, updateStoryState, recordPleasurePoint, recordEmotionCurve } from "../services/StoryStateService";
import { autoManageMemories } from "../services/MemoryCompressionService";

const router = Router();

const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

// 批量生成章节
router.post("/:novelId/batch-generate", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { count = 1, autoStyle = true } = req.body;

    if (!count || count < 1 || count > 20) {
      res.status(400).json({ success: false, error: "生成数量无效（1-20）。" });
      return;
    }

    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { chapters: { orderBy: { order: "asc" } } },
    });

    if (!novel) {
      res.status(404).json({ success: false, error: "小说不存在。" });
      return;
    }

    // 获取当前最大序号
    const lastChapter = novel.chapters[novel.chapters.length - 1];
    const startOrder = (lastChapter?.order ?? 0) + 1;

    const results: Array<{
      chapter: number;
      status: "success" | "error";
      wordCount?: number;
      error?: string;
    }> = [];

    // 逐章生成
    for (let i = 0; i < count; i++) {
      const order = startOrder + i;
      try {
        // 创建新章节
        const chapter = await prisma.chapter.create({
          data: {
            novelId,
            order,
            title: `第${order}章`,
            summary: "",
            status: "planned",
          },
        });

        // 生成正文
        const content = await generateChapterContent({ novelId, chapterId: chapter.id });

        // 去 AI 味处理
        let finalContent = content;
        if (autoStyle && content) {
          finalContent = await generateStyledContent(content, novelId);
        }

        // 更新章节
        await prisma.chapter.update({
          where: { id: chapter.id },
          data: {
            content: finalContent,
            wordCount: finalContent.replace(/\s/g, "").length,
            status: "drafted",
          },
        });

        // 记录爽点和情绪
        await recordPleasurePoint(novelId, {
          chapterOrder: order,
          type: "auto_generated",
          intensity: 5,
          description: "自动生成章节",
        });

        await recordEmotionCurve(novelId, {
          chapterOrder: order,
          emotionType: "neutral",
          intensity: 5,
        });

        // 自动管理记忆
        await autoManageMemories(novelId, order);

        // 更新剧情状态
        await updateStoryState(novelId, {
          currentChapter: order,
        });

        results.push({
          chapter: order,
          status: "success",
          wordCount: finalContent.replace(/\s/g, "").length,
        });
      } catch (error) {
        results.push({
          chapter: order,
          status: "error",
          error: error instanceof Error ? error.message : "生成失败",
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    res.json({
      success: true,
      data: {
        total: count,
        success: successCount,
        error: errorCount,
        startOrder,
        endOrder: startOrder + count - 1,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

// 获取批量生成状态
router.get("/:novelId/batch-status", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);

    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        chapters: { orderBy: { order: "asc" } },
      },
    });

    if (!novel) {
      res.status(404).json({ success: false, error: "小说不存在。" });
      return;
    }

    const totalChapters = novel.chapters.length;
    const draftedChapters = novel.chapters.filter((c) => c.status === "drafted").length;
    const totalWords = novel.chapters.reduce((sum, c) => sum + c.wordCount, 0);

    res.json({
      success: true,
      data: {
        totalChapters,
        draftedChapters,
        plannedChapters: totalChapters - draftedChapters,
        totalWords,
        progress: totalChapters > 0 ? Math.round((draftedChapters / totalChapters) * 100) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
