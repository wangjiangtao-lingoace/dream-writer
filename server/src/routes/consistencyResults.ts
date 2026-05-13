import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

// 获取小说的所有一致性校验结果
router.get("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = req.params;
    const results = await prisma.consistencyCheckResult.findMany({
      where: { novelId },
      orderBy: { checkedAt: "desc" },
    });
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

// 获取单个章节的校验结果
router.get("/:novelId/:chapterId", async (req, res, next) => {
  try {
    const { novelId, chapterId } = req.params;
    const result = await prisma.consistencyCheckResult.findUnique({
      where: { novelId_chapterId: { novelId, chapterId } },
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 创建或更新校验结果
router.post("/", async (req, res, next) => {
  try {
    const { novelId, chapterId, overallScore, summary, issues } = req.body;

    if (!novelId || !chapterId) {
      res.status(400).json({ success: false, error: "小说ID和章节ID不能为空。" });
      return;
    }

    // 使用 upsert 创建或更新
    const result = await prisma.consistencyCheckResult.upsert({
      where: { novelId_chapterId: { novelId, chapterId } },
      update: {
        overallScore: overallScore || 0,
        summary: summary || "",
        checkedAt: new Date(),
      },
      create: {
        novelId,
        chapterId,
        overallScore: overallScore || 0,
        summary: summary || "",
        checkedAt: new Date(),
      },
    });

    // 如果有 issues，同时保存到 ConsistencyIssue 表
    if (issues && Array.isArray(issues)) {
      // 先删除该章节的旧 issues
      await prisma.consistencyIssue.deleteMany({
        where: { novelId, chapterId },
      });

      // 批量创建新 issues
      if (issues.length > 0) {
        await prisma.consistencyIssue.createMany({
          data: issues.map((issue: any) => ({
            novelId,
            chapterId,
            type: issue.type || "unknown",
            severity: issue.severity || "medium",
            description: issue.description || "",
            evidence: issue.evidence || "",
            suggestion: issue.suggestion || "",
            status: issue.status === "fixed" ? "resolved" : issue.status === "ignored" ? "ignored" : "open",
          })),
        });
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 删除校验结果
router.delete("/:novelId/:chapterId", async (req, res, next) => {
  try {
    const { novelId, chapterId } = req.params;

    // 删除校验结果
    await prisma.consistencyCheckResult.deleteMany({
      where: { novelId, chapterId },
    });

    // 同时删除关联的 issues
    await prisma.consistencyIssue.deleteMany({
      where: { novelId, chapterId },
    });

    res.json({ success: true, message: "已删除校验结果。" });
  } catch (error) {
    next(error);
  }
});

// 更新 issue 状态
router.patch("/:novelId/:chapterId/issues/:issueIndex", async (req, res, next) => {
  try {
    const { novelId, chapterId, issueIndex } = req.params;
    const { status } = req.body;

    if (!["resolved", "ignored"].includes(status)) {
      res.status(400).json({ success: false, error: "状态只能是 resolved 或 ignored。" });
      return;
    }

    // 获取该章节的所有 issues
    const issues = await prisma.consistencyIssue.findMany({
      where: { novelId, chapterId },
      orderBy: { createdAt: "asc" },
    });

    const index = parseInt(issueIndex, 10);
    if (index < 0 || index >= issues.length) {
      res.status(404).json({ success: false, error: "问题索引不存在。" });
      return;
    }

    // 更新指定 issue 的状态
    const updated = await prisma.consistencyIssue.update({
      where: { id: issues[index].id },
      data: { status },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
