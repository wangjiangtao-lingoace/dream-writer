import { Router } from "express";
import { z } from "zod";
import { BookAnalysisService } from "../services/BookAnalysisService";
import { imitationPlanService } from "../services/ImitationPlanService";

const router = Router();
const service = new BookAnalysisService();

const idSchema = z.object({ id: z.string().trim().min(1) });
const sectionSchema = z.object({
  id: z.string().trim().min(1),
  sectionKey: z.string().trim().min(1),
});

const createSchema = z.object({
  title: z.string().trim().min(1, "拆书标题不能为空。"),
  sourceTitle: z.string().trim().optional(),
  sourceText: z.string().trim().optional(),
  novelId: z.string().trim().min(1).nullable().optional(),
});

const oneClickSchema = z.object({
  title: z.string().trim().min(1, "拆书标题不能为空。"),
  sourceTitle: z.string().trim().optional(),
  sourceText: z.string().trim().min(80, "原文至少需要 80 个字，才能进行有效拆书。"),
  novelId: z.string().trim().min(1, "一键拆书创作需要先选择作品。"),
});

const listQuerySchema = z.object({
  novelId: z.string().trim().min(1).optional(),
  scope: z.enum(["novel", "global", "all"]).optional(),
});

const updateSectionSchema = z.object({
  editedContent: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  frozen: z.boolean().optional(),
  usedForImitation: z.boolean().optional(),
});

const publishSchema = z.object({
  novelId: z.string().trim().min(1).nullable().optional(),
});

router.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    res.json({ success: true, data: await service.listBookAnalyses(query) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    res.status(201).json({ success: true, data: await service.createBookAnalysis(input) });
  } catch (error) {
    next(error);
  }
});

router.post("/one-click", async (req, res, next) => {
  try {
    const input = oneClickSchema.parse(req.body);
    const analysis = await service.createBookAnalysis(input);
    if (!analysis) {
      throw new Error("拆书创建失败。");
    }

    const materializedAnalysis = await service.materializeToKnowledge(analysis.id, input.novelId);
    const imitationPlan = await imitationPlanService.createFromBookAnalysis(analysis.id, input.novelId);
    const materializedPlan = await imitationPlanService.materialize(imitationPlan.id);
    const pipelineJob = await imitationPlanService.applyToPipeline(imitationPlan.id, {
      autoContinue: true,
      autoDraftChapters: 3,
      volumeCount: 1,
      chaptersPerVolume: 3,
      targetWordCount: 1800,
      sourcePolicy: "verified_only",
    });

    res.status(201).json({
      success: true,
      data: {
        analysis,
        materializedAnalysis,
        imitationPlan: materializedPlan,
        pipelineJob,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const analysis = await service.getBookAnalysis(id);
    if (!analysis) {
      res.status(404).json({ success: false, error: "拆书任务不存在。" });
      return;
    }
    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/rebuild", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    res.json({ success: true, data: await service.rebuildBookAnalysis(id) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/sections/:sectionKey", async (req, res, next) => {
  try {
    const { id, sectionKey } = sectionSchema.parse(req.params);
    const input = updateSectionSchema.parse(req.body);
    res.json({ success: true, data: await service.updateSection(id, sectionKey, input) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/publish", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = publishSchema.parse(req.body);
    res.json({ success: true, data: await service.publishToKnowledge(id, input.novelId) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/materialize", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = publishSchema.parse(req.body);
    res.json({ success: true, data: await service.materializeToKnowledge(id, input.novelId) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/imitation-plan", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = publishSchema.parse(req.body);
    res.status(201).json({ success: true, data: await imitationPlanService.createFromBookAnalysis(id, input.novelId) });
  } catch (error) {
    next(error);
  }
});

export default router;
