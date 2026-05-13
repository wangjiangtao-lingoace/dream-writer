import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";

const router = Router();

const idSchema = z.object({ id: z.string().trim().min(1) });
const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });
const volumeIdSchema = z.object({ volumeId: z.string().trim().min(1) });

const volumeCreateSchema = z.object({
  title: z.string().trim().min(1, "卷名不能为空。"),
  goal: z.string().trim().optional(),
  conflict: z.string().trim().optional(),
  emotion: z.string().trim().optional(),
  newChars: z.string().trim().optional(),
  mapName: z.string().trim().optional(),
  endHook: z.string().trim().optional(),
});

const volumeUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  goal: z.string().nullable().optional(),
  conflict: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
  newChars: z.string().nullable().optional(),
  mapName: z.string().nullable().optional(),
  endHook: z.string().nullable().optional(),
  status: z.string().trim().min(1).optional(),
});

const chapterOutlineCreateSchema = z.object({
  title: z.string().trim().min(1, "章节名不能为空。"),
  goal: z.string().trim().optional(),
  conflict: z.string().trim().optional(),
  emotion: z.string().trim().optional(),
  hook: z.string().trim().optional(),
  foreshadowing: z.string().trim().optional(),
  payoff: z.string().trim().optional(),
  pleasurePoint: z.string().trim().optional(),
});

const chapterOutlineUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  goal: z.string().nullable().optional(),
  conflict: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
  hook: z.string().nullable().optional(),
  foreshadowing: z.string().nullable().optional(),
  payoff: z.string().nullable().optional(),
  pleasurePoint: z.string().nullable().optional(),
  status: z.string().trim().min(1).optional(),
});

// 获取小说的所有卷纲
router.get("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const volumes = await prisma.volume.findMany({
      where: { novelId },
      orderBy: { sortOrder: "asc" },
      include: {
        chapterOutlines: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    res.json({ success: true, data: volumes });
  } catch (error) {
    next(error);
  }
});

// 创建卷纲
router.post("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const input = volumeCreateSchema.parse(req.body);
    
    // 获取当前最大序号
    const lastVolume = await prisma.volume.findFirst({
      where: { novelId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    
    const volume = await prisma.volume.create({
      data: {
        ...input,
        novelId,
        sortOrder: (lastVolume?.sortOrder ?? 0) + 1,
      },
    });
    
    res.status(201).json({ success: true, data: volume });
  } catch (error) {
    next(error);
  }
});

// 获取单个卷纲详情
router.get("/detail/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const volume = await prisma.volume.findUnique({
      where: { id },
      include: {
        chapterOutlines: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    
    if (!volume) {
      res.status(404).json({ success: false, error: "卷纲不存在。" });
      return;
    }
    
    res.json({ success: true, data: volume });
  } catch (error) {
    next(error);
  }
});

// 更新卷纲
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = volumeUpdateSchema.parse(req.body);
    
    // 将 null 转换为 undefined 以兼容 Prisma
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.goal !== undefined) data.goal = input.goal ?? undefined;
    if (input.conflict !== undefined) data.conflict = input.conflict ?? undefined;
    if (input.emotion !== undefined) data.emotion = input.emotion ?? undefined;
    if (input.newChars !== undefined) data.newChars = input.newChars ?? undefined;
    if (input.mapName !== undefined) data.mapName = input.mapName ?? undefined;
    if (input.endHook !== undefined) data.endHook = input.endHook ?? undefined;
    if (input.status !== undefined) data.status = input.status;
    
    const volume = await prisma.volume.update({
      where: { id },
      data,
    });
    
    res.json({ success: true, data: volume });
  } catch (error) {
    next(error);
  }
});

// 删除卷纲
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    await prisma.volume.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

// ============ 章纲 API ============

// 获取卷下的所有章纲
router.get("/:volumeId/chapters", async (req, res, next) => {
  try {
    const { volumeId } = volumeIdSchema.parse(req.params);
    const chapters = await prisma.chapterOutline.findMany({
      where: { volumeId },
      orderBy: { sortOrder: "asc" },
    });
    res.json({ success: true, data: chapters });
  } catch (error) {
    next(error);
  }
});

// 创建章纲
router.post("/:volumeId/chapters", async (req, res, next) => {
  try {
    const { volumeId } = volumeIdSchema.parse(req.params);
    const input = chapterOutlineCreateSchema.parse(req.body);
    
    // 获取卷信息
    const volume = await prisma.volume.findUnique({
      where: { id: volumeId },
      select: { novelId: true },
    });
    
    if (!volume) {
      res.status(404).json({ success: false, error: "卷纲不存在。" });
      return;
    }
    
    // 获取当前最大序号
    const lastChapter = await prisma.chapterOutline.findFirst({
      where: { volumeId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    
    const chapter = await prisma.chapterOutline.create({
      data: {
        ...input,
        volumeId,
        novelId: volume.novelId,
        sortOrder: (lastChapter?.sortOrder ?? 0) + 1,
      },
    });
    
    res.status(201).json({ success: true, data: chapter });
  } catch (error) {
    next(error);
  }
});

// 更新章纲
router.put("/chapters/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = chapterOutlineUpdateSchema.parse(req.body);
    
    // 将 null 转换为 undefined 以兼容 Prisma
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.goal !== undefined) data.goal = input.goal ?? undefined;
    if (input.conflict !== undefined) data.conflict = input.conflict ?? undefined;
    if (input.emotion !== undefined) data.emotion = input.emotion ?? undefined;
    if (input.hook !== undefined) data.hook = input.hook ?? undefined;
    if (input.foreshadowing !== undefined) data.foreshadowing = input.foreshadowing ?? undefined;
    if (input.payoff !== undefined) data.payoff = input.payoff ?? undefined;
    if (input.pleasurePoint !== undefined) data.pleasurePoint = input.pleasurePoint ?? undefined;
    if (input.status !== undefined) data.status = input.status;
    
    const chapter = await prisma.chapterOutline.update({
      where: { id },
      data,
    });
    
    res.json({ success: true, data: chapter });
  } catch (error) {
    next(error);
  }
});

// 删除章纲
router.delete("/chapters/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    await prisma.chapterOutline.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
