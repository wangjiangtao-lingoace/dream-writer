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

    // 单章生成逻辑
    const generateChapter = async (order: number): Promise<typeof results[number]> => {
      const chapter = await prisma.chapter.create({
        data: {
          novelId,
          order,
          title: `第${order}章`,
          summary: "",
          status: "planned",
        },
      });

      const content = await generateChapterContent({ novelId, chapterId: chapter.id });

      let finalContent = content;
      if (autoStyle && content) {
        finalContent = await generateStyledContent(content, novelId);
      }

      await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          content: finalContent,
          wordCount: finalContent.replace(/\s/g, "").length,
          status: "drafted",
        },
      });

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

      await autoManageMemories(novelId, order);

      await updateStoryState(novelId, {
        currentChapter: order,
      });

      return {
        chapter: order,
        status: "success",
        wordCount: finalContent.replace(/\s/g, "").length,
      };
    };

    // 分批并行生成，并发限制为 3
    const concurrencyLimit = 3;
    for (let i = 0; i < count; i += concurrencyLimit) {
      const batch: number[] = [];
      for (let j = i; j < Math.min(i + concurrencyLimit, count); j++) {
        batch.push(startOrder + j);
      }
      const batchResults = await Promise.all(
        batch.map((order) =>
          generateChapter(order).catch((error): typeof results[number] => ({
            chapter: order,
            status: "error",
            error: error instanceof Error ? error.message : "生成失败",
          }))
        )
      );
      results.push(...batchResults);
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
