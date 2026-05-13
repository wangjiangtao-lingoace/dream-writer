import { Router } from "express";
import { z } from "zod";
import { imitationPlanService } from "../services/ImitationPlanService";

const router = Router();
const idSchema = z.object({ id: z.string().trim().min(1) });
const applySchema = z.object({
  autoContinue: z.boolean().optional(),
  autoDraftChapters: z.number().int().min(1).max(3).optional(),
  volumeCount: z.number().int().min(1).max(10).optional(),
  chaptersPerVolume: z.number().int().min(1).max(30).optional(),
  targetWordCount: z.number().int().min(500).max(8000).optional(),
  sourcePolicy: z.literal("verified_only").optional(),
  overwriteExistingChapters: z.boolean().optional(),
}).optional();

router.post("/:id/materialize", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    res.json({ success: true, data: await imitationPlanService.materialize(id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/apply-to-pipeline", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const config = applySchema.parse(req.body);
    res.json({ success: true, data: await imitationPlanService.applyToPipeline(id, config || {}) });
  } catch (error) {
    next(error);
  }
});

export default router;
