import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";

const router = Router();

const idSchema = z.object({ id: z.string().trim().min(1) });
const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

const characterCreateSchema = z.object({
  name: z.string().trim().min(1, "人物名不能为空。"),
  role: z.string().trim().optional(),
  identity: z.string().trim().optional(),
  motivation: z.string().trim().optional(),
  appearance: z.string().trim().optional(),
  background: z.string().trim().optional(),
  relationsText: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.string().nullable().optional(),
  identity: z.string().nullable().optional(),
  motivation: z.string().nullable().optional(),
  appearance: z.string().nullable().optional(),
  background: z.string().nullable().optional(),
  relationsText: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const characters = await prisma.character.findMany({
      where: { novelId },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: characters });
  } catch (error) {
    next(error);
  }
});

router.post("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const input = characterCreateSchema.parse(req.body);
    const character = await prisma.character.create({
      data: { ...input, novelId },
    });
    res.status(201).json({ success: true, data: character });
  } catch (error) {
    next(error);
  }
});

router.get("/:novelId/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const character = await prisma.character.findUnique({ where: { id } });
    if (!character) {
      res.status(404).json({ success: false, error: "人物不存在。" });
      return;
    }
    res.json({ success: true, data: character });
  } catch (error) {
    next(error);
  }
});

router.put("/:novelId/:id", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { id } = idSchema.parse(req.params);
    const input = characterUpdateSchema.parse(req.body);
    const character = await prisma.character.update({
      where: { id, novelId },
      data: input,
    });
    res.json({ success: true, data: character });
  } catch (error) {
    next(error);
  }
});

router.delete("/:novelId/:id", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { id } = idSchema.parse(req.params);
    await prisma.character.delete({ where: { id, novelId } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
