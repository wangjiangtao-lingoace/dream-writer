import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma";

const router = Router({ mergeParams: true });

// 获取小说的所有钩子
router.get("/", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const { type, status } = req.query;

    const where: any = { novelId };
    if (type) where.type = type as string;
    if (status) where.status = status as string;

    const hooks = await prisma.hook.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: hooks });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建钩子
router.post("/", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const { chapterId, title, description, type, intensity, status } = req.body;

    const hook = await prisma.hook.create({
      data: {
        novelId,
        chapterId,
        title,
        description,
        type: type || "suspense",
        intensity: intensity || 5,
        status: status || "planted",
      },
    });
    res.json({ success: true, data: hook });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个钩子详情
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const hook = await prisma.hook.findUnique({
      where: { id },
    });
    if (!hook) {
      return res.status(404).json({ success: false, error: "钩子不存在" });
    }
    res.json({ success: true, data: hook });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新钩子
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { chapterId, title, description, type, intensity, status } = req.body;

    const hook = await prisma.hook.update({
      where: { id },
      data: {
        chapterId,
        title,
        description,
        type,
        intensity,
        status,
      },
    });
    res.json({ success: true, data: hook });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除钩子
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.hook.delete({
      where: { id },
    });
    res.json({ success: true, message: "钩子已删除" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量更新钩子状态
router.patch("/batch/status", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const { ids, status } = req.body;

    await prisma.hook.updateMany({
      where: {
        id: { in: ids },
        novelId,
      },
      data: { status },
    });
    res.json({ success: true, message: "钩子状态已更新" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
