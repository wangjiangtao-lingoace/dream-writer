import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { getRagIngestService } from "../services/RagIngestService";

const router = Router();

const idSchema = z.object({ id: z.string().trim().min(1) });
const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

const assetCreateSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空。"),
  category: z.string().trim().min(1, "分类不能为空。"),
  content: z.string().trim().min(1, "内容不能为空。"),
  tags: z.string().trim().optional(),
});

const assetUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  tags: z.string().nullable().optional(),
});

router.get("/", async (_req, res, next) => {
  try {
    const assets = await prisma.knowledgeAsset.findMany({
      where: { novelId: null },
      orderBy: { title: "asc" },
    });
    res.json({ success: true, data: assets });
  } catch (error) {
    next(error);
  }
});

router.get("/novel/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const assets = await prisma.knowledgeAsset.findMany({
      where: { novelId },
      orderBy: { title: "asc" },
    });
    res.json({ success: true, data: assets });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = assetCreateSchema.parse(req.body);
    const asset = await prisma.knowledgeAsset.create({ data: input });
    // fire-and-forget RAG ingest
    getRagIngestService()?.ingestText({
      ownerType: "knowledge_asset",
      ownerId: asset.id,
      novelId: asset.novelId ?? undefined,
      text: asset.content,
    }).catch(console.error);
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

router.post("/novel/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const input = assetCreateSchema.parse(req.body);
    const asset = await prisma.knowledgeAsset.create({
      data: { ...input, novelId },
    });
    // fire-and-forget RAG ingest
    getRagIngestService()?.ingestText({
      ownerType: "knowledge_asset",
      ownerId: asset.id,
      novelId,
      text: asset.content,
    }).catch(console.error);
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const asset = await prisma.knowledgeAsset.findUnique({ where: { id } });
    if (!asset) {
      res.status(404).json({ success: false, error: "知识资产不存在。" });
      return;
    }
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = assetUpdateSchema.parse(req.body);
    const existing = await prisma.knowledgeAsset.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "知识资产不存在。" });
      return;
    }
    // 校验 novelId 归属：query 参数传入时必须匹配
    const scope = req.query.novelId as string | undefined;
    if (scope !== undefined && existing.novelId !== scope) {
      res.status(403).json({ success: false, error: "无权操作该知识资产。" });
      return;
    }
    const asset = await prisma.knowledgeAsset.update({
      where: { id },
      data: input,
    });
    // fire-and-forget RAG ingest (only when content changed)
    if (input.content !== undefined) {
      getRagIngestService()?.ingestText({
        ownerType: "knowledge_asset",
        ownerId: asset.id,
        novelId: asset.novelId ?? undefined,
        text: asset.content,
      }).catch(console.error);
    }
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const existing = await prisma.knowledgeAsset.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "知识资产不存在。" });
      return;
    }
    // 校验 novelId 归属：query 参数传入时必须匹配
    const scope = req.query.novelId as string | undefined;
    if (scope !== undefined && existing.novelId !== scope) {
      res.status(403).json({ success: false, error: "无权操作该知识资产。" });
      return;
    }
    // C1: 删除前清理 RAG 向量数据，防止孤儿向量
    getRagIngestService()?.deleteChunks("knowledge_asset", id).catch(console.error);
    await prisma.knowledgeAsset.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
