import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

type Format = "text" | "markdown";

function getFormat(req: { query: Record<string, unknown> }): Format {
  return req.query.format === "markdown" ? "markdown" : "text";
}

function setContentHeaders(res: any, novelTitle: string, suffix: string, fmt: Format) {
  const ext = fmt === "markdown" ? "md" : "txt";
  const mime = fmt === "markdown" ? "text/markdown" : "text/plain";
  res.setHeader("Content-Type", `${mime}; charset=utf-8`);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(novelTitle + "_" + suffix + "." + ext)}`);
}

// GET /api/export/:novelId/full — 全书正文
router.get("/:novelId/full", async (req, res, next) => {
  try {
    const { novelId } = req.params;
    const fmt = getFormat(req);
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { chapters: { orderBy: { order: "asc" } } },
    });
    if (!novel) {
      res.status(404).json({ success: false, error: "作品不存在" });
      return;
    }

    const lines: string[] = [];

    if (fmt === "markdown") {
      lines.push(`# 《${novel.title}》`);
      lines.push("");
      for (const ch of novel.chapters) {
        lines.push(`## 第${ch.order}章 ${ch.title}`);
        lines.push("");
        lines.push(ch.content || "");
        lines.push("");
      }
    } else {
      lines.push(`《${novel.title}》`);
      lines.push("=".repeat(40));
      lines.push("");
      for (const ch of novel.chapters) {
        lines.push(`第${ch.order}章 ${ch.title}`);
        lines.push("-".repeat(30));
        lines.push(ch.content || "");
        lines.push("");
      }
    }

    setContentHeaders(res, novel.title, "全文", fmt);
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

// GET /api/export/:novelId/outline — 大纲 + 卷纲 + 章纲
router.get("/:novelId/outline", async (req, res, next) => {
  try {
    const { novelId } = req.params;
    const fmt = getFormat(req);
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      res.status(404).json({ success: false, error: "作品不存在" });
      return;
    }

    const [volumes, chapterOutlines] = await Promise.all([
      prisma.volume.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.chapterOutline.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const lines: string[] = [];

    if (fmt === "markdown") {
      lines.push(`# 《${novel.title}》大纲`);
      lines.push("");
      lines.push("## 作品大纲");
      lines.push("");
      lines.push(novel.outline || "暂无大纲");
      lines.push("");

      for (const vol of volumes) {
        lines.push(`## 第${vol.sortOrder}卷 ${vol.title}`);
        lines.push("");
        if (vol.goal) lines.push(`**目标：**${vol.goal}`);
        if (vol.conflict) lines.push(`**冲突：**${vol.conflict}`);
        if (vol.emotion) lines.push(`**情绪：**${vol.emotion}`);
        if (vol.endHook) lines.push(`**卷末钩子：**${vol.endHook}`);
        lines.push("");

        const volChapters = chapterOutlines.filter((c) => c.volumeId === vol.id);
        for (const ch of volChapters) {
          lines.push(`### 第${ch.sortOrder}章 ${ch.title}`);
          if (ch.goal) lines.push(`- **目标：**${ch.goal}`);
          if (ch.conflict) lines.push(`- **冲突：**${ch.conflict}`);
          if (ch.emotion) lines.push(`- **情绪：**${ch.emotion}`);
          if (ch.hook) lines.push(`- **钩子：**${ch.hook}`);
          lines.push("");
        }
      }
    } else {
      lines.push(`《${novel.title}》大纲`);
      lines.push("=".repeat(40));
      lines.push("");
      lines.push("【作品大纲】");
      lines.push(novel.outline || "暂无大纲");
      lines.push("");

      for (const vol of volumes) {
        lines.push(`【第${vol.sortOrder}卷】${vol.title}`);
        lines.push("-".repeat(30));
        if (vol.goal) lines.push(`目标：${vol.goal}`);
        if (vol.conflict) lines.push(`冲突：${vol.conflict}`);
        if (vol.emotion) lines.push(`情绪：${vol.emotion}`);
        if (vol.endHook) lines.push(`卷末钩子：${vol.endHook}`);
        lines.push("");

        const volChapters = chapterOutlines.filter((c) => c.volumeId === vol.id);
        for (const ch of volChapters) {
          lines.push(`  第${ch.sortOrder}章 ${ch.title}`);
          if (ch.goal) lines.push(`    目标：${ch.goal}`);
          if (ch.conflict) lines.push(`    冲突：${ch.conflict}`);
          if (ch.emotion) lines.push(`    情绪：${ch.emotion}`);
          if (ch.hook) lines.push(`    钩子：${ch.hook}`);
        }
        lines.push("");
      }
    }

    setContentHeaders(res, novel.title, "大纲", fmt);
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

// GET /api/export/:novelId/volumes — 卷纲导出
router.get("/:novelId/volumes", async (req, res, next) => {
  try {
    const { novelId } = req.params;
    const fmt = getFormat(req);
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      res.status(404).json({ success: false, error: "作品不存在" });
      return;
    }

    const volumes = await prisma.volume.findMany({
      where: { novelId },
      orderBy: { sortOrder: "asc" },
    });

    const lines: string[] = [];

    if (fmt === "markdown") {
      lines.push(`# 《${novel.title}》卷纲`);
      lines.push("");

      for (const vol of volumes) {
        lines.push(`## 第${vol.sortOrder}卷 ${vol.title}`);
        lines.push("");
        if (vol.goal) lines.push(`- **目标：**${vol.goal}`);
        if (vol.conflict) lines.push(`- **冲突：**${vol.conflict}`);
        if (vol.emotion) lines.push(`- **情绪：**${vol.emotion}`);
        if (vol.mapName) lines.push(`- **地图：**${vol.mapName}`);
        if (vol.endHook) lines.push(`- **结尾钩子：**${vol.endHook}`);
        if (vol.keyEvents) lines.push(`- **关键事件：**${vol.keyEvents}`);
        if (vol.turningPoint) lines.push(`- **转折点：**${vol.turningPoint}`);
        if (vol.newChars) lines.push(`- **新角色：**${vol.newChars}`);
        lines.push("");
      }
    } else {
      lines.push(`《${novel.title}》卷纲`);
      lines.push("=".repeat(40));
      lines.push("");

      for (const vol of volumes) {
        lines.push(`【第${vol.sortOrder}卷】${vol.title}`);
        lines.push("-".repeat(30));
        if (vol.goal) lines.push(`目标：${vol.goal}`);
        if (vol.conflict) lines.push(`冲突：${vol.conflict}`);
        if (vol.emotion) lines.push(`情绪：${vol.emotion}`);
        if (vol.mapName) lines.push(`地图：${vol.mapName}`);
        if (vol.endHook) lines.push(`结尾钩子：${vol.endHook}`);
        if (vol.keyEvents) lines.push(`关键事件：${vol.keyEvents}`);
        if (vol.turningPoint) lines.push(`转折点：${vol.turningPoint}`);
        if (vol.newChars) lines.push(`新角色：${vol.newChars}`);
        lines.push("");
      }
    }

    setContentHeaders(res, novel.title, "卷纲", fmt);
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

// GET /api/export/:novelId/chapter-outlines — 章纲导出
router.get("/:novelId/chapter-outlines", async (req, res, next) => {
  try {
    const { novelId } = req.params;
    const fmt = getFormat(req);
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      res.status(404).json({ success: false, error: "作品不存在" });
      return;
    }

    const [volumes, chapterOutlines] = await Promise.all([
      prisma.volume.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, title: true },
      }),
      prisma.chapterOutline.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const volumeMap = new Map(volumes.map(v => [v.id, v]));

    const lines: string[] = [];

    if (fmt === "markdown") {
      lines.push(`# 《${novel.title}》章纲`);
      lines.push("");

      for (const ch of chapterOutlines) {
        const vol = volumeMap.get(ch.volumeId);
        const volLabel = vol ? `（第${vol.sortOrder}卷 ${vol.title}）` : "";
        lines.push(`### 第${ch.sortOrder}章 ${ch.title}${volLabel}`);
        lines.push("");
        if (ch.goal) lines.push(`- **目标：**${ch.goal}`);
        if (ch.conflict) lines.push(`- **冲突：**${ch.conflict}`);
        if (ch.emotion) lines.push(`- **情绪：**${ch.emotion}`);
        if (ch.hook) lines.push(`- **钩子：**${ch.hook}`);
        if (ch.pleasurePoint) lines.push(`- **爽点：**${ch.pleasurePoint}`);
        if (ch.foreshadowing) lines.push(`- **埋设伏笔：**${ch.foreshadowing}`);
        if (ch.payoff) lines.push(`- **回收伏笔：**${ch.payoff}`);
        lines.push("");
      }
    } else {
      lines.push(`《${novel.title}》章纲`);
      lines.push("=".repeat(40));
      lines.push("");

      for (const ch of chapterOutlines) {
        const vol = volumeMap.get(ch.volumeId);
        const volLabel = vol ? `（第${vol.sortOrder}卷 ${vol.title}）` : "";
        lines.push(`【第${ch.sortOrder}章】${ch.title}${volLabel}`);
        lines.push("-".repeat(30));
        if (ch.goal) lines.push(`目标：${ch.goal}`);
        if (ch.conflict) lines.push(`冲突：${ch.conflict}`);
        if (ch.emotion) lines.push(`情绪：${ch.emotion}`);
        if (ch.hook) lines.push(`钩子：${ch.hook}`);
        if (ch.pleasurePoint) lines.push(`爽点：${ch.pleasurePoint}`);
        if (ch.foreshadowing) lines.push(`埋设伏笔：${ch.foreshadowing}`);
        if (ch.payoff) lines.push(`回收伏笔：${ch.payoff}`);
        lines.push("");
      }
    }

    setContentHeaders(res, novel.title, "章纲", fmt);
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

// GET /api/export/:novelId/characters — 人物设定
router.get("/:novelId/characters", async (req, res, next) => {
  try {
    const { novelId } = req.params;
    const fmt = getFormat(req);
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      res.status(404).json({ success: false, error: "作品不存在" });
      return;
    }

    const characters = await prisma.character.findMany({
      where: { novelId },
      orderBy: { createdAt: "asc" },
    });

    const lines: string[] = [];

    if (fmt === "markdown") {
      lines.push(`# 《${novel.title}》人物设定`);
      lines.push("");

      for (const char of characters) {
        lines.push(`## ${char.name}`);
        lines.push("");
        if (char.role) lines.push(`- **角色：**${char.role}`);
        if (char.identity) lines.push(`- **身份：**${char.identity}`);
        if (char.motivation) lines.push(`- **动机：**${char.motivation}`);
        if (char.appearance) lines.push(`- **外貌：**${char.appearance}`);
        if (char.background) lines.push(`- **背景：**${char.background}`);
        if (char.speechStyle) lines.push(`- **言语风格：**${char.speechStyle}`);
        if (char.arcSummary) lines.push(`- **成长线：**${char.arcSummary}`);
        if (char.arcDetail) lines.push(`- **成长详情：**${char.arcDetail}`);
        if (char.relationsText) lines.push(`- **关系：**${char.relationsText}`);
        lines.push("");
      }
    } else {
      lines.push(`《${novel.title}》人物设定`);
      lines.push("=".repeat(40));
      lines.push("");

      for (const char of characters) {
        lines.push(`【${char.name}】`);
        if (char.role) lines.push(`角色：${char.role}`);
        if (char.identity) lines.push(`身份：${char.identity}`);
        if (char.motivation) lines.push(`动机：${char.motivation}`);
        if (char.appearance) lines.push(`外貌：${char.appearance}`);
        if (char.background) lines.push(`背景：${char.background}`);
        if (char.speechStyle) lines.push(`言语风格：${char.speechStyle}`);
        if (char.arcSummary) lines.push(`成长线：${char.arcSummary}`);
        if (char.arcDetail) lines.push(`成长详情：${char.arcDetail}`);
        if (char.relationsText) lines.push(`关系：${char.relationsText}`);
        lines.push("");
      }
    }

    setContentHeaders(res, novel.title, "人物", fmt);
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

// GET /api/export/:novelId/worldview — 世界观设定
router.get("/:novelId/worldview", async (req, res, next) => {
  try {
    const { novelId } = req.params;
    const fmt = getFormat(req);
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      res.status(404).json({ success: false, error: "作品不存在" });
      return;
    }

    const worldviews = await prisma.worldview.findMany({
      where: { novelId },
      orderBy: { createdAt: "asc" },
    });

    const lines: string[] = [];

    if (fmt === "markdown") {
      lines.push(`# 《${novel.title}》世界观设定`);
      lines.push("");

      for (const wv of worldviews) {
        lines.push(`## ${wv.name}`);
        lines.push("");
        if (wv.summary) lines.push(`- **概述：**${wv.summary}`);
        if (wv.rules) lines.push(`- **规则：**${wv.rules}`);
        if (wv.geography) lines.push(`- **地理：**${wv.geography}`);
        if (wv.factions) lines.push(`- **势力：**${wv.factions}`);
        if (wv.history) lines.push(`- **历史：**${wv.history}`);
        if (wv.powerSystem) lines.push(`- **力量体系：**${wv.powerSystem}`);
        if (wv.economy) lines.push(`- **经济体系：**${wv.economy}`);
        if (wv.culture) lines.push(`- **文化设定：**${wv.culture}`);
        if (wv.technology) lines.push(`- **科技/魔法水平：**${wv.technology}`);
        lines.push("");
      }
    } else {
      lines.push(`《${novel.title}》世界观设定`);
      lines.push("=".repeat(40));
      lines.push("");

      for (const wv of worldviews) {
        lines.push(`【${wv.name}】`);
        if (wv.summary) lines.push(`概述：${wv.summary}`);
        if (wv.rules) lines.push(`规则：${wv.rules}`);
        if (wv.geography) lines.push(`地理：${wv.geography}`);
        if (wv.factions) lines.push(`势力：${wv.factions}`);
        if (wv.history) lines.push(`历史：${wv.history}`);
        if (wv.powerSystem) lines.push(`力量体系：${wv.powerSystem}`);
        if (wv.economy) lines.push(`经济体系：${wv.economy}`);
        if (wv.culture) lines.push(`文化设定：${wv.culture}`);
        if (wv.technology) lines.push(`科技/魔法水平：${wv.technology}`);
        lines.push("");
      }
    }

    setContentHeaders(res, novel.title, "世界观", fmt);
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

export default router;
