import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";

/** 返回本地时区日期字符串 YYYY-MM-DD，避免 UTC 时区偏移问题 */
function localDate(d?: Date): string {
  const date = d || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const router = Router();

const idSchema = z.object({ id: z.string().trim().min(1) });
const chapterIdSchema = z.object({
  id: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

// GET /novels/:id/workspace-data - 统一工作台数据
router.get("/:id/workspace-data", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const [novel, chapters, characters, foreshadows, storyState, volumes, chapterOutlines, emotionCurves, worldviews] = await Promise.all([
      prisma.novel.findUnique({ where: { id }, select: { title: true, targetWordCount: true, chaptersPerVol: true } }),
      prisma.chapter.findMany({ where: { novelId: id }, orderBy: { order: "asc" }, select: { id: true, order: true, title: true, wordCount: true, status: true, source: true } }),
      prisma.character.findMany({ where: { novelId: id }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, name: true, role: true, identity: true, arcSummary: true } }),
      prisma.foreshadow.findMany({ where: { novelId: id }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, description: true, status: true, plantChapter: true, payoffChapter: true } }),
      prisma.storyState.findUnique({ where: { novelId: id } }),
      prisma.volume.findMany({ where: { novelId: id }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true, sortOrder: true } }),
      prisma.chapterOutline.findMany({ where: { novelId: id }, select: { sortOrder: true, emotion: true, conflict: true } }),
      prisma.emotionCurve.findMany({ where: { novelId: id }, orderBy: { chapterOrder: "desc" }, take: 10, select: { chapterOrder: true, isClimax: true } }),
      prisma.worldview.findMany({ where: { novelId: id }, select: { id: true, name: true, summary: true } }),
    ]);

    const outlineMap = new Map(chapterOutlines.map(co => [co.sortOrder, co]));
    const cpv = novel?.chaptersPerVol || 20;

    const enrichedChapters = chapters.map(ch => {
      const outline = outlineMap.get(ch.order);
      const volume = volumes.find(v => v.sortOrder === Math.ceil(ch.order / cpv));
      return {
        ...ch,
        volumeTitle: volume?.title || volumes[0]?.title || undefined,
        emotion: outline?.emotion || undefined,
        conflict: outline?.conflict || undefined,
      };
    });

    const signals = {
      mood: storyState?.currentEmotion || "neutral",
      rhythm: storyState?.currentPhase || "development",
      climax: emotionCurves.some(ec => ec.isClimax),
    };

    const today = localDate();
    const todaySession = await prisma.writingSession.findUnique({
      where: { novelId_date: { novelId: id, date: today } },
    });

    const recentSessions = await prisma.writingSession.findMany({
      where: { novelId: id },
      orderBy: { date: "desc" },
      take: 30,
      select: { date: true },
    });
    let streak = 0;
    const checkDate = new Date();
    for (const session of recentSessions) {
      const expected = localDate(checkDate);
      if (session.date === expected) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
    const targetWordCount = novel?.targetWordCount || 100000;
    const remaining = Math.max(0, targetWordCount - totalWordCount);
    const avgSpeed = todaySession?.wordCount && todaySession?.duration
      ? todaySession.wordCount / (todaySession.duration / 60)
      : 500;
    const estimatedMinutes = Math.round(remaining / avgSpeed);
    const estimatedTime = estimatedMinutes > 60
      ? `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`
      : `${estimatedMinutes}m`;

    res.json({
      success: true,
      data: {
        novel: { title: novel?.title, targetWordCount },
        chapters: enrichedChapters,
        characters,
        worldviews,
        foreshadows,
        storyState: storyState ? {
          currentEmotion: storyState.currentEmotion,
          emotionIntensity: storyState.emotionIntensity,
          currentPhase: storyState.currentPhase,
          protagonistGoal: storyState.protagonistGoal,
          tensionAccumulation: storyState.tensionAccumulation,
        } : null,
        signals,
        writingStats: {
          todayWordCount: todaySession?.wordCount || 0,
          targetWordCount: novel?.targetWordCount || 100000,
          totalWordCount,
          streakDays: streak,
          estimatedTime,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /novels/:id/writing-stats - 写作统计
router.get("/:id/writing-stats", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const today = localDate();

    const [novel, todaySession, chapters] = await Promise.all([
      prisma.novel.findUnique({ where: { id }, select: { targetWordCount: true } }),
      prisma.writingSession.findUnique({ where: { novelId_date: { novelId: id, date: today } } }),
      prisma.chapter.findMany({ where: { novelId: id }, select: { wordCount: true } }),
    ]);

    const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

    const recentSessions = await prisma.writingSession.findMany({
      where: { novelId: id },
      orderBy: { date: "desc" },
      take: 30,
      select: { date: true },
    });
    let streak = 0;
    const checkDate = new Date();
    for (const session of recentSessions) {
      if (session.date === localDate(checkDate)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }

    res.json({
      success: true,
      data: {
        todayWordCount: todaySession?.wordCount || 0,
        streakDays: streak,
        totalWordCount,
        targetWordCount: novel?.targetWordCount || 100000,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /novels/:id/chapters/:chapterId/ai-review - AI 评审
router.get("/:id/chapters/:chapterId/ai-review", async (req, res, next) => {
  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);

    const memories = await prisma.memory.findMany({
      where: { novelId: id, chapterId },
      orderBy: { importance: "desc" },
      take: 10,
      select: { type: true, category: true, title: true, content: true, importance: true },
    });

    const scoreMemory = memories.find(m => m.type === "evaluation" && m.category === "chapter_score");
    let score = 0;
    if (scoreMemory) {
      try {
        const parsed = JSON.parse(scoreMemory.content);
        score = parsed.overall_score || parsed.score || 0;
      } catch {
        score = 0;
      }
    }

    const suggestions = memories
      .filter(m => m.type !== "evaluation")
      .map(m => m.content.slice(0, 200))
      .slice(0, 3);

    res.json({
      success: true,
      data: { score, suggestions },
    });
  } catch (error) {
    next(error);
  }
});

// GET /novels/:id/radar-scores - 雷达图评分
router.get("/:id/radar-scores", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const [pleasurePoints, emotionCurves, foreshadows] = await Promise.all([
      prisma.pleasurePoint.findMany({ where: { novelId: id }, orderBy: { chapterOrder: "desc" }, take: 10, select: { intensity: true } }),
      prisma.emotionCurve.findMany({ where: { novelId: id }, orderBy: { chapterOrder: "desc" }, take: 10, select: { intensity: true, tensionLevel: true } }),
      prisma.foreshadow.findMany({ where: { novelId: id }, select: { status: true } }),
    ]);

    const pleasureDensity = pleasurePoints.length > 0
      ? Math.round(pleasurePoints.reduce((s, p) => s + p.intensity, 0) / pleasurePoints.length)
      : 5;

    const emotionWave = emotionCurves.length > 0
      ? Math.round(emotionCurves.reduce((s, e) => s + e.intensity, 0) / emotionCurves.length)
      : 5;

    const planted = foreshadows.filter(f => f.status === "planted").length;
    const paidOff = foreshadows.filter(f => f.status === "paid_off").length;
    const infoRelease = planted + paidOff > 0
      ? Math.round((paidOff / (planted + paidOff)) * 10)
      : 3;

    res.json({
      success: true,
      data: { pleasureDensity, emotionWave, infoRelease },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
