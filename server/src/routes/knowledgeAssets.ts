import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";

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
    const asset = await prisma.knowledgeAsset.update({
      where: { id },
      data: input,
    });
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    await prisma.knowledgeAsset.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
