import { Router, Request, Response } from "express";
import { analysisToNovelService } from "../services/AnalysisToNovelService";
import { prisma } from "../db/prisma";

const router = Router();

/**
 * 仅提取结构化数据（不落库）
 * POST /api/analysis-to-novel/extract/:analysisId
 */
router.post("/extract/:analysisId", async (req: Request, res: Response) => {
  try {
    const analysisId = req.params.analysisId as string;

    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });

    if (!analysis || analysis.status !== "succeeded") {
      return res.status(400).json({ success: false, error: "拆书任务不存在或未完成" });
    }

    // 整理拆书内容
    const sections: any = {};
    for (const section of analysis.sections) {
      sections[section.sectionKey] = section.aiContent || section.editedContent || "";
    }

    // 提取结构化数据
    const extractedData = await analysisToNovelService.extractDataFromAnalysis(sections);

    res.json({
      success: true,
      data: extractedData,
    });
  } catch (error: any) {
    console.error("提取数据失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 将拆书结果落库到小说
 * POST /api/analysis-to-novel/:novelId/:analysisId
 */
router.post("/:novelId/:analysisId", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const analysisId = req.params.analysisId as string;

    // 验证小说存在
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      return res.status(404).json({ success: false, error: "小说不存在" });
    }

    // 验证拆书任务存在且完成
    const analysis = await prisma.bookAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return res.status(404).json({ success: false, error: "拆书任务不存在" });
    }
    if (analysis.status !== "succeeded") {
      return res.status(400).json({ success: false, error: "拆书任务未完成" });
    }

    // 执行落库
    await analysisToNovelService.processAnalysisToNovel(novelId, analysisId);

    // 返回更新后的小说详情
    const updatedNovel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        chapters: true,
        characters: true,
        worldviews: true,
        mainlines: true,
        hooks: true,
        styleProfiles: true,
        assets: true,
      },
    });

    res.json({
      success: true,
      data: updatedNovel,
      message: "拆书结果已成功落库",
    });
  } catch (error: any) {
    console.error("拆书落库失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
