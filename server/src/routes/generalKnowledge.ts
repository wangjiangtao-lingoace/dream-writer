import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { getRagIngestService } from "../services/RagIngestService";

const router = Router();

// 获取所有通用知识库
router.get("/", async (req: Request, res: Response) => {
  try {
    const { category, search, limit, offset } = req.query;

    const where: any = {};
    if (category) where.category = category as string;
    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { content: { contains: search as string } },
        { tags: { contains: search as string } },
      ];
    }

    const take = limit ? parseInt(limit as string) : 50;
    const skip = offset ? parseInt(offset as string) : 0;

    const [items, total] = await Promise.all([
      prisma.generalKnowledge.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take,
        skip,
      }),
      prisma.generalKnowledge.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items,
        total,
        limit: take,
        offset: skip,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建通用知识库条目
router.post("/", async (req: Request, res: Response) => {
  try {
    const { title, category, content, tags } = req.body;

    if (!title || !category || !content) {
      return res.status(400).json({
        success: false,
        error: "标题、分类和内容为必填项",
      });
    }

    const item = await prisma.generalKnowledge.create({
      data: {
        title,
        category,
        content,
        tags,
      },
    });
    // fire-and-forget RAG ingest
    getRagIngestService()?.ingestText({
      ownerType: "general_knowledge",
      ownerId: item.id,
      text: content,
    }).catch(console.error);
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取分类统计
router.get("/stats/categories", async (req: Request, res: Response) => {
  try {
    const stats = await prisma.generalKnowledge.groupBy({
      by: ["category"],
      _count: {
        id: true,
      },
    });

    const result = stats.map((stat) => ({
      category: stat.category,
      count: stat._count.id,
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个通用知识库条目
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.generalKnowledge.findUnique({
      where: { id },
    });
    if (!item) {
      return res.status(404).json({ success: false, error: "条目不存在" });
    }
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新通用知识库条目
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { title, category, content, tags } = req.body;

    const item = await prisma.generalKnowledge.update({
      where: { id },
      data: {
        title,
        category,
        content,
        tags,
      },
    });
    // fire-and-forget RAG ingest (only when content changed)
    if (content !== undefined) {
      getRagIngestService()?.ingestText({
        ownerType: "general_knowledge",
        ownerId: item.id,
        text: item.content,
      }).catch(console.error);
    }
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除通用知识库条目
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    // C1: 删除前清理 RAG 向量数据，防止孤儿向量
    getRagIngestService()?.deleteChunks("general_knowledge", id).catch(console.error);
    await prisma.generalKnowledge.delete({
      where: { id },
    });
    res.json({ success: true, message: "条目已删除" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
