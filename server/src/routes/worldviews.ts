import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";

const router = Router();

const idSchema = z.object({ id: z.string().trim().min(1) });

const worldviewCreateSchema = z.object({
  novelId: z.string().trim().min(1, "作品ID不能为空。"),
  name: z.string().trim().min(1, "世界观名称不能为空。"),
  summary: z.string().trim().optional(),
  rules: z.string().trim().optional(),
  geography: z.string().trim().optional(),
  factions: z.string().trim().optional(),
  history: z.string().trim().optional(),
  customNotes: z.string().trim().optional(),
});

const worldviewUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  summary: z.string().nullable().optional(),
  rules: z.string().nullable().optional(),
  geography: z.string().nullable().optional(),
  factions: z.string().nullable().optional(),
  history: z.string().nullable().optional(),
  customNotes: z.string().nullable().optional(),
});

router.get("/", async (req, res, next) => {
  try {
    const novelId = req.query.novelId as string | undefined;
    const where = novelId ? { novelId } : {};
    const worldviews = await prisma.worldview.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: worldviews });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = worldviewCreateSchema.parse(req.body);
    const worldview = await prisma.worldview.create({ data: input });
    res.status(201).json({ success: true, data: worldview });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const worldview = await prisma.worldview.findUnique({ where: { id } });
    if (!worldview) {
      res.status(404).json({ success: false, error: "世界观不存在。" });
      return;
    }
    res.json({ success: true, data: worldview });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = worldviewUpdateSchema.parse(req.body);
    const worldview = await prisma.worldview.update({
      where: { id },
      data: input,
    });
    res.json({ success: true, data: worldview });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    await prisma.worldview.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
