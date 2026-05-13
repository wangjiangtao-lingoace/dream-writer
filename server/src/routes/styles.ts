import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { getStyleProfile, buildStylePrompt, generateStyledContent } from "../services/StyleService";

const router = Router();

const idSchema = z.object({ id: z.string().trim().min(1) });
const novelIdSchema = z.object({ novelId: z.string().trim().min(1) });

const styleProfileCreateSchema = z.object({
  name: z.string().trim().min(1, "风格名称不能为空。"),
  description: z.string().trim().optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).optional(),
  tense: z.enum(["past", "present"]).optional(),
  pacing: z.enum(["slow", "balanced", "fast"]).optional(),
  sentenceLength: z.enum(["short", "medium", "long", "mixed"]).optional(),
  vocabulary: z.enum(["modern", "classical", "mixed"]).optional(),
  dialogueRatio: z.enum(["low", "balanced", "high"]).optional(),
  emotionIntensity: z.enum(["low", "medium", "high"]).optional(),
  humorLevel: z.enum(["none", "low", "medium", "high"]).optional(),
  avoidAIWords: z.boolean().optional(),
  useShortSentences: z.boolean().optional(),
  useDialogue: z.boolean().optional(),
  useSensoryDetail: z.boolean().optional(),
  customRules: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

const styleProfileUpdateSchema = styleProfileCreateSchema.partial();

// 获取小说的所有风格配置
router.get("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const profiles = await prisma.styleProfile.findMany({
      where: { novelId },
      orderBy: { isDefault: "desc" },
    });
    res.json({ success: true, data: profiles });
  } catch (error) {
    next(error);
  }
});

// 获取默认风格配置
router.get("/:novelId/default", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const profile = await getStyleProfile(novelId);
    const prompt = buildStylePrompt(profile);
    res.json({ success: true, data: { profile, prompt } });
  } catch (error) {
    next(error);
  }
});

// 创建风格配置
router.post("/:novelId", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const input = styleProfileCreateSchema.parse(req.body);

    // 如果设置为默认，先取消其他默认
    if (input.isDefault) {
      await prisma.styleProfile.updateMany({
        where: { novelId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const profile = await prisma.styleProfile.create({
      data: {
        ...input,
        novelId,
        customRules: JSON.stringify(input.customRules || []),
      },
    });

    res.status(201).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

// 更新风格配置
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = styleProfileUpdateSchema.parse(req.body);

    // 如果设置为默认，先取消其他默认
    if (input.isDefault) {
      const profile = await prisma.styleProfile.findUnique({ where: { id } });
      if (profile) {
        await prisma.styleProfile.updateMany({
          where: { novelId: profile.novelId, isDefault: true },
          data: { isDefault: false },
        });
      }
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.narrativePov !== undefined) data.narrativePov = input.narrativePov;
    if (input.tense !== undefined) data.tense = input.tense;
    if (input.pacing !== undefined) data.pacing = input.pacing;
    if (input.sentenceLength !== undefined) data.sentenceLength = input.sentenceLength;
    if (input.vocabulary !== undefined) data.vocabulary = input.vocabulary;
    if (input.dialogueRatio !== undefined) data.dialogueRatio = input.dialogueRatio;
    if (input.emotionIntensity !== undefined) data.emotionIntensity = input.emotionIntensity;
    if (input.humorLevel !== undefined) data.humorLevel = input.humorLevel;
    if (input.avoidAIWords !== undefined) data.avoidAIWords = input.avoidAIWords;
    if (input.useShortSentences !== undefined) data.useShortSentences = input.useShortSentences;
    if (input.useDialogue !== undefined) data.useDialogue = input.useDialogue;
    if (input.useSensoryDetail !== undefined) data.useSensoryDetail = input.useSensoryDetail;
    if (input.customRules !== undefined) data.customRules = JSON.stringify(input.customRules);
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;

    const profile = await prisma.styleProfile.update({
      where: { id },
      data,
    });

    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

// 删除风格配置
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    await prisma.styleProfile.delete({ where: { id } });
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

// 去 AI 味处理
router.post("/:novelId/remove-ai-smell", async (req, res, next) => {
  try {
    const { novelId } = novelIdSchema.parse(req.params);
    const { content } = req.body;
    
    if (!content) {
      res.status(400).json({ success: false, error: "内容不能为空。" });
      return;
    }

    const result = await generateStyledContent(content, novelId);
    res.json({ success: true, data: { content: result } });
  } catch (error) {
    next(error);
  }
});

export default router;
