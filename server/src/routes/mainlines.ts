import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma";

const router = Router({ mergeParams: true });

// 获取小说的所有主线
router.get("/", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const mainlines = await prisma.mainline.findMany({
      where: { novelId },
      orderBy: { sortOrder: "asc" },
    });
    res.json({ success: true, data: mainlines });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建主线
router.post("/", async (req: Request, res: Response) => {
  try {
    const novelId = req.params.novelId as string;
    const { title, description, sortOrder, status } = req.body;

    const mainline = await prisma.mainline.create({
      data: {
        novelId,
        title,
        description,
        sortOrder: sortOrder || 0,
        status: status || "active",
      },
    });
    res.json({ success: true, data: mainline });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个主线详情
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const mainline = await prisma.mainline.findUnique({
      where: { id },
    });
    if (!mainline) {
      return res.status(404).json({ success: false, error: "主线不存在" });
    }
    res.json({ success: true, data: mainline });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新主线
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { title, description, sortOrder, status } = req.body;

    const mainline = await prisma.mainline.update({
      where: { id },
      data: {
        title,
        description,
        sortOrder,
        status,
      },
    });
    res.json({ success: true, data: mainline });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除主线
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.mainline.delete({
      where: { id },
    });
    res.json({ success: true, message: "主线已删除" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
