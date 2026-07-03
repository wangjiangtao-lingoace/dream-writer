import { Router, Request, Response } from "express";
import { z } from "zod";
import { NovelService } from "../services/NovelService";
import * as AIService from "../services/AIService";
import { prisma } from "../db/prisma";

const router = Router();
const novelService = new NovelService();

const idSchema = z.object({ id: z.string().trim().min(1) });
const volumeIdSchema = z.object({
  id: z.string().trim().min(1),
  volumeId: z.string().trim().min(1),
});

// 根据卷纲批量生成章纲
router.post("/:id/volumes/:volumeId/generate-outlines", async (req, res, next) => {
  try {
    const { id, volumeId } = volumeIdSchema.parse(req.params);
    const { chapterCount = 10 } = req.body;

    // 验证小说和卷纲存在
    const novel = await novelService.getNovel(id);
    if (!novel) {
      return res.status(404).json({ success: false, error: "小说不存在。" });
    }

    // 生成章纲
    const outlines = await AIService.generateChapterOutlinesForVolume({
      novelId: id,
      volumeId,
      chapterCount,
    });

    // 批量创建章节和章纲
    const createdChapters = [];
    const existingChapterCount = novel.chapters.length;

    for (let i = 0; i < outlines.length; i++) {
      const outline = outlines[i];
      const sortOrder = existingChapterCount + i + 1;

      // 创建章节
      const chapter = await prisma.chapter.create({
        data: {
          novelId: id,
          order: sortOrder,
          title: outline.title || `第${sortOrder}章`,
          summary: outline.goal || "",
          status: "planned",
        },
      });

      // 创建章纲
      await prisma.chapterOutline.create({
        data: {
          volumeId,
          novelId: id,
          sortOrder,
          title: outline.title || `第${sortOrder}章`,
          goal: outline.goal || "",
          conflict: outline.conflict || "",
          emotion: outline.emotion || "",
          hook: outline.hook || "",
          pleasurePoint: outline.pleasure_point || "",
          status: "planned",
        },
      });

      createdChapters.push(chapter);
    }

    res.json({
      success: true,
      data: {
        chapters: createdChapters,
        outlines,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
