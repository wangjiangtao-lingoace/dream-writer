import { Router, Request, Response } from "express";
import { z } from "zod";
import { ImportAnalysisService } from "../services/ImportAnalysisService";
import { ContinuationService } from "../services/ContinuationService";

const router = Router();
const importService = new ImportAnalysisService();
const continuationService = new ContinuationService();

// ─── 导入分析 ───

const importSchema = z.object({
  text: z.string().trim().min(100, "文本内容过短，至少需要 100 字。"),
  title: z.string().trim().optional(),
  genre: z.string().trim().optional(),
});

router.post("/import/analyze", async (req: Request, res: Response) => {
  try {
    const params = importSchema.parse(req.body);
    const result = await importService.analyzeAndImport(params);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0]?.message });
      return;
    }
    console.error("[continuation] import analyze error:", err);
    res.status(500).json({ success: false, error: err.message || "导入分析失败" });
  }
});

// ─── 续写章节 ───

const idSchema = z.object({ id: z.string().trim().min(1) });

const continueSchema = z.object({
  chapterCount: z.number().int().min(1).max(10).optional().default(1),
  targetWordCount: z.number().int().min(500).max(5000).optional().default(1800),
});

router.post("/novels/:id/continue", async (req: Request, res: Response) => {
  try {
    const { id } = idSchema.parse(req.params);
    const params = continueSchema.parse(req.body);
    const chapters = await continuationService.continueWriting({
      novelId: id,
      chapterCount: params.chapterCount,
      targetWordCount: params.targetWordCount,
    });
    res.json({ success: true, data: { chapters } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0]?.message });
      return;
    }
    console.error("[continuation] continue writing error:", err);
    res.status(500).json({ success: false, error: err.message || "续写失败" });
  }
});

export default router;
