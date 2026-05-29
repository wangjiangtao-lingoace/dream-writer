import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { encryptApiKey, decryptApiKey } from "../utils/crypto";

const router = Router();

const createSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  isDefault: z.boolean().optional(),
});

// GET /api/ai-config — 列表（不返回 apiKey）
router.get("/", async (_req, res, next) => {
  try {
    const configs = await prisma.aIConfig.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: { id: true, provider: true, model: true, baseUrl: true, isDefault: true, createdAt: true, updatedAt: true },
    });
    res.json({ success: true, data: configs });
  } catch (error) {
    next(error);
  }
});

// GET /api/ai-config/default — 默认配置（内部使用，返回解密后的 apiKey）
router.get("/default", async (_req, res, next) => {
  try {
    const config = await prisma.aIConfig.findFirst({ where: { isDefault: true } });
    if (!config) {
      res.status(404).json({ success: false, error: "未配置默认 AI 模型。" });
      return;
    }
    res.json({
      success: true,
      data: { ...config, apiKey: decryptApiKey(config.apiKey) },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai-config — 创建
router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    if (input.isDefault) {
      await prisma.aIConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    const config = await prisma.aIConfig.create({
      data: {
        provider: input.provider,
        model: input.model,
        apiKey: encryptApiKey(input.apiKey),
        baseUrl: input.baseUrl || null,
        isDefault: input.isDefault ?? false,
      },
      select: { id: true, provider: true, model: true, baseUrl: true, isDefault: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/ai-config/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await prisma.aIConfig.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai-config/:id/test — 测试连接
router.post("/:id/test", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const config = await prisma.aIConfig.findUnique({ where: { id } });
    if (!config) {
      res.status(404).json({ success: false, error: "配置不存在。" });
      return;
    }
    const apiKey = decryptApiKey(config.apiKey);
    const baseURL = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    // 简单测试：发送一个最小请求
    const testURL = `${baseURL}/models`;
    const response = await fetch(testURL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      res.json({ success: true, data: { success: true, message: "连接成功！" } });
    } else {
      const text = await response.text().catch(() => "");
      res.json({ success: true, data: { success: false, message: `连接失败: HTTP ${response.status} ${text.slice(0, 100)}` } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "连接测试失败";
    res.json({ success: true, data: { success: false, message } });
  }
});

export default router;
