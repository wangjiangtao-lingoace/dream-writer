import { prisma } from "../db/prisma";
import { AI_SMELL_REPLACEMENTS } from "./pipeline/aiSmellWords";

// 获取小说的风格配置
export async function getStyleProfile(novelId: string): Promise<{
  narrativePov: string;
  tense: string;
  pacing: string;
  sentenceLength: string;
  vocabulary: string;
  dialogueRatio: string;
  emotionIntensity: string;
  humorLevel: string;
  avoidAIWords: boolean;
  useShortSentences: boolean;
  useDialogue: boolean;
  useSensoryDetail: boolean;
  customRules: string[];
}> {
  const profile = await prisma.styleProfile.findFirst({
    where: {
      novelId,
      isDefault: true,
    },
  });

  if (!profile) {
    // 返回默认风格
    return {
      narrativePov: "third_person",
      tense: "past",
      pacing: "balanced",
      sentenceLength: "mixed",
      vocabulary: "modern",
      dialogueRatio: "balanced",
      emotionIntensity: "medium",
      humorLevel: "low",
      avoidAIWords: true,
      useShortSentences: true,
      useDialogue: true,
      useSensoryDetail: true,
      customRules: [],
    };
  }

  return {
    narrativePov: profile.narrativePov,
    tense: profile.tense,
    pacing: profile.pacing,
    sentenceLength: profile.sentenceLength,
    vocabulary: profile.vocabulary,
    dialogueRatio: profile.dialogueRatio,
    emotionIntensity: profile.emotionIntensity,
    humorLevel: profile.humorLevel,
    avoidAIWords: profile.avoidAIWords,
    useShortSentences: profile.useShortSentences,
    useDialogue: profile.useDialogue,
    useSensoryDetail: profile.useSensoryDetail,
    customRules: JSON.parse(profile.customRules || "[]"),
  };
}

// 构建风格提示词
export function buildStylePrompt(profile: Awaited<ReturnType<typeof getStyleProfile>>): string {
  const rules: string[] = [];

  // 叙事视角
  switch (profile.narrativePov) {
    case "first_person":
      rules.push("使用第一人称视角写作");
      break;
    case "third_person":
      rules.push("使用第三人称有限视角写作");
      break;
    case "mixed":
      rules.push("可以灵活切换视角");
      break;
  }

  // 时态
  switch (profile.tense) {
    case "past":
      rules.push("使用过去时态");
      break;
    case "present":
      rules.push("使用现在时态");
      break;
  }

  // 节奏
  switch (profile.pacing) {
    case "slow":
      rules.push("节奏要慢，多描写心理和环境");
      break;
    case "balanced":
      rules.push("节奏适中，张弛有度");
      break;
    case "fast":
      rules.push("节奏要快，多用动作和对话推进");
      break;
  }

  // 句子长度
  switch (profile.sentenceLength) {
    case "short":
      rules.push("多用短句，增强节奏感");
      break;
    case "long":
      rules.push("可以用长句，增强文学性");
      break;
    case "mixed":
      rules.push("长短句结合，富有变化");
      break;
  }

  // 词汇风格
  switch (profile.vocabulary) {
    case "modern":
      rules.push("使用现代白话文");
      break;
    case "classical":
      rules.push("适当使用古典词汇，增加文采");
      break;
    case "mixed":
      rules.push("古今词汇混用，雅俗共赏");
      break;
  }

  // 对话比例
  switch (profile.dialogueRatio) {
    case "low":
      rules.push("少用对话，多用叙述");
      break;
    case "balanced":
      rules.push("对话和叙述平衡");
      break;
    case "high":
      rules.push("多用对话推进剧情");
      break;
  }

  // 情感强度
  switch (profile.emotionIntensity) {
    case "low":
      rules.push("情感表达要克制内敛");
      break;
    case "medium":
      rules.push("情感表达适度");
      break;
    case "high":
      rules.push("情感表达要强烈饱满");
      break;
  }

  // 幽默程度
  switch (profile.humorLevel) {
    case "none":
      rules.push("保持严肃风格");
      break;
    case "low":
      rules.push("偶尔可以有轻松的时刻");
      break;
    case "medium":
      rules.push("适当加入幽默元素");
      break;
    case "high":
      rules.push("多用幽默和调侃");
      break;
  }

  // 特殊要求
  if (profile.avoidAIWords) {
    rules.push("避免使用 AI 味的套话和连接词");
  }
  if (profile.useShortSentences) {
    rules.push("多用短句，增强可读性");
  }
  if (profile.useDialogue) {
    rules.push("多用对话，增强场景感");
  }
  if (profile.useSensoryDetail) {
    rules.push("使用感官描写，增强代入感");
  }

  // 自定义规则
  if (profile.customRules.length > 0) {
    rules.push(...profile.customRules);
  }

  return rules.join("；");
}

// 去 AI 味处理
export function removeAISmell(text: string): string {
  let result = text;

  for (const [pattern, replacement] of AI_SMELL_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 2. 清理多余的空行
  result = result.replace(/\n{3,}/g, "\n\n");

  // 3. 清理开头和结尾的空白
  result = result.trim();

  return result;
}

// 增强文本（添加感官描写、动作细节等）
export async function enhanceText(text: string, novelId: string): Promise<string> {
  const profile = await getStyleProfile(novelId);
  
  // 如果不需要增强，直接返回
  if (!profile.useSensoryDetail && !profile.useShortSentences) {
    return text;
  }

  // 基础增强：分段、添加动作描写
  let enhanced = text;

  // 1. 将长段落拆分成短段落
  enhanced = enhanced.replace(/([^。！？\n]{100,}[。！？])/g, "$1\n\n");

  // 2. 清理多余的空行
  enhanced = enhanced.replace(/\n{3,}/g, "\n\n");

  return enhanced;
}

// 生成风格化的正文
export async function generateStyledContent(
  content: string,
  novelId: string
): Promise<string> {
  // 1. 去 AI 味
  let styled = removeAISmell(content);

  // 2. 增强文本
  styled = await enhanceText(styled, novelId);

  return styled;
}
