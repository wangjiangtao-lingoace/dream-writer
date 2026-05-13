import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";

const router = Router();

const idSchema = z.object({ id: z.string().trim().min(1) });
const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

const memoryCreateSchema = z.object({
  type: z.string().trim().min(1, "记忆类型不能为空。"),
  category: z.string().trim().optional(),
  title: z.string().trim().min(1, "标题不能为空。"),
  content: z.string().trim().min(1, "内容不能为空。"),
  importance: z.number().int().min(1).max(10).optional(),
  chapterId: z.string().trim().optional(),
  metadata: z.string().trim().optional(),
});

const memoryUpdateSchema = z.object({
  type: z.string().trim().min(1).optional(),
  category: z.string().nullable().optional(),
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  chapterId: z.string().nullable().optional(),
  metadata: z.string().nullable().optional(),
});

// 获取小说的所有记忆
router.get("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { type, limit } = req.query;
    
    const where: Record<string, unknown> = { novelId };
    if (type && typeof type === "string") {
      where.type = type;
    }
    
    const memories = await prisma.memory.findMany({
      where,
      orderBy: [
        { importance: "desc" },
        { updatedAt: "desc" },
      ],
      take: limit ? parseInt(limit as string) : 100,
    });
    
    res.json({ success: true, data: memories });
  } catch (error) {
    next(error);
  }
});

// 获取记忆统计
router.get("/:novelId/stats", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    
    const stats = await prisma.memory.groupBy({
      by: ["type"],
      where: { novelId },
      _count: { id: true },
    });
    
    const result = {
      total: 0,
      world: 0,
      character: 0,
      plot: 0,
      foreshadow: 0,
      pleasure: 0,
      style: 0,
    };
    
    for (const stat of stats) {
      const count = stat._count.id;
      result.total += count;
      if (stat.type in result) {
        (result as Record<string, number>)[stat.type] = count;
      }
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 搜索记忆 - 必须在 /:id 路由之前
router.get("/:novelId/search", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { q, type, limit } = req.query;
    
    if (!q || typeof q !== "string") {
      res.status(400).json({ success: false, error: "搜索关键词不能为空。" });
      return;
    }
    
    const where: Record<string, unknown> = {
      novelId,
      OR: [
        { title: { contains: q } },
        { content: { contains: q } },
      ],
    };
    
    if (type && typeof type === "string") {
      where.type = type;
    }
    
    const memories = await prisma.memory.findMany({
      where,
      orderBy: [
        { importance: "desc" },
        { updatedAt: "desc" },
      ],
      take: limit ? parseInt(limit as string) : 20,
    });
    
    res.json({ success: true, data: memories });
  } catch (error) {
    next(error);
  }
});

// 创建记忆
router.post("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const input = memoryCreateSchema.parse(req.body);
    
    const memory = await prisma.memory.create({
      data: {
        ...input,
        novelId,
      },
    });
    
    res.status(201).json({ success: true, data: memory });
  } catch (error) {
    next(error);
  }
});

// 批量创建记忆
router.post("/:novelId/batch", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { memories } = req.body as { memories: Array<z.infer<typeof memoryCreateSchema>> };
    
    if (!Array.isArray(memories) || memories.length === 0) {
      res.status(400).json({ success: false, error: "记忆列表不能为空。" });
      return;
    }
    
    const results = await prisma.memory.createMany({
      data: memories.map((m) => ({
        ...m,
        novelId,
      })),
    });
    
    res.status(201).json({ success: true, data: { count: results.count } });
  } catch (error) {
    next(error);
  }
});

// 获取单个记忆详情
router.get("/detail/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    
    const memory = await prisma.memory.findUnique({
      where: { id },
    });
    
    if (!memory) {
      res.status(404).json({ success: false, error: "记忆不存在。" });
      return;
    }
    
    res.json({ success: true, data: memory });
  } catch (error) {
    next(error);
  }
});

// 更新记忆
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = memoryUpdateSchema.parse(req.body);
    
    // 将 null 转换为 undefined 以兼容 Prisma
    const data: Record<string, unknown> = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.category !== undefined) data.category = input.category ?? undefined;
    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = input.content;
    if (input.importance !== undefined) data.importance = input.importance;
    if (input.chapterId !== undefined) data.chapterId = input.chapterId ?? undefined;
    if (input.metadata !== undefined) data.metadata = input.metadata ?? undefined;
    
    const memory = await prisma.memory.update({
      where: { id },
      data,
    });
    
    res.json({ success: true, data: memory });
  } catch (error) {
    next(error);
  }
});

// 删除记忆
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    await prisma.memory.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
