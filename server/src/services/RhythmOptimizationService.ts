import { LlmInvokeService } from "./llm/LlmInvokeService";
import { prisma } from "../db/prisma";
import { buildStoryContext } from "./StoryStateService";
import { analyzePleasureRhythm, analyzeEmotionRhythm } from "./StoryStateService";

const llmService = new LlmInvokeService();

// 节奏分析结果
interface RhythmAnalysis {
  overallScore: number;
  rhythmScore: number;
  emotionScore: number;
  pleasureScore: number;
  issues: Array<{
    type: "rhythm" | "emotion" | "pleasure" | "pacing";
    severity: "low" | "medium" | "high";
    description: string;
    suggestion: string;
  }>;
  recommendations: string[];
}

// 节奏优化建议
interface RhythmOptimization {
  chapter: number;
  currentRhythm: string;
  suggestedRhythm: string;
  reason: string;
  actions: string[];
}

// 分析全书节奏
export async function analyzeBookRhythm(novelId: string): Promise<RhythmAnalysis> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      chapters: { orderBy: { order: "asc" } },
      pleasurePoints: { orderBy: { chapterOrder: "asc" } },
      emotionCurve: { orderBy: { chapterOrder: "asc" } },
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const pleasureAnalysis = await analyzePleasureRhythm(novelId);
  const emotionAnalysis = await analyzeEmotionRhythm(novelId);

  const issues: RhythmAnalysis["issues"] = [];
  const recommendations: string[] = [];

  // 分析爽点节奏
  if (pleasureAnalysis.averageInterval < 3) {
    issues.push({
      type: "pleasure",
      severity: "high",
      description: "爽点过于密集",
      suggestion: "增加章节间隔，避免读者疲劳",
    });
  } else if (pleasureAnalysis.averageInterval > 10) {
    issues.push({
      type: "pleasure",
      severity: "medium",
      description: "爽点间隔过长",
      suggestion: "增加爽点频率，保持读者兴趣",
    });
  }

  // 分析情绪节奏
  const tensionRatio = (emotionAnalysis.emotionDistribution["tension"] || 0) / (emotionAnalysis.totalEntries || 1);
  const releaseRatio = (emotionAnalysis.emotionDistribution["release"] || 0) / (emotionAnalysis.totalEntries || 1);

  if (tensionRatio > 0.6) {
    issues.push({
      type: "emotion",
      severity: "medium",
      description: "压抑情绪过多",
      suggestion: "增加释放和喘息章节",
    });
  }

  if (releaseRatio > 0.6) {
    issues.push({
      type: "emotion",
      severity: "medium",
      description: "释放情绪过多",
      suggestion: "增加紧张章节，增强对比",
    });
  }

  // 分析章节长度一致性
  const wordCounts = novel.chapters.map((c) => c.wordCount);
  const avgWordCount = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const wordCountVariance = wordCounts.reduce((sum, wc) => sum + Math.pow(wc - avgWordCount, 2), 0) / wordCounts.length;
  const wordCountStdDev = Math.sqrt(wordCountVariance);

  if (wordCountStdDev > avgWordCount * 0.5) {
    issues.push({
      type: "pacing",
      severity: "low",
      description: "章节长度差异较大",
      suggestion: "保持章节长度相对一致",
    });
  }

  // 生成建议
  if (issues.length === 0) {
    recommendations.push("整体节奏良好，继续保持。");
  } else {
    for (const issue of issues) {
      recommendations.push(issue.suggestion);
    }
  }

  // 计算评分
  const rhythmScore = Math.max(0, 100 - issues.filter((i) => i.type === "rhythm").length * 20);
  const emotionScore = Math.max(0, 100 - issues.filter((i) => i.type === "emotion").length * 20);
  const pleasureScore = Math.max(0, 100 - issues.filter((i) => i.type === "pleasure").length * 20);
  const overallScore = Math.round((rhythmScore + emotionScore + pleasureScore) / 3);

  return {
    overallScore,
    rhythmScore,
    emotionScore,
    pleasureScore,
    issues,
    recommendations,
  };
}

// 生成节奏优化建议
export async function generateRhythmOptimizations(
  novelId: string,
  fromChapter: number,
  toChapter: number
): Promise<RhythmOptimization[]> {
  const storyContext = await buildStoryContext(novelId);
  const pleasureAnalysis = await analyzePleasureRhythm(novelId);
  const emotionAnalysis = await analyzeEmotionRhythm(novelId);

  const prompt = [
    "你是一位小说节奏优化专家，负责优化长篇小说的节奏。",
    "",
    `当前章节范围：第${fromChapter}章 - 第${toChapter}章`,
    "",
    "剧情状态：",
    storyContext,
    "",
    "爽点分析：",
    `- 平均间隔：${pleasureAnalysis.averageInterval}章`,
    `- 类型分布：${JSON.stringify(pleasureAnalysis.typeDistribution)}`,
    `- 建议：${pleasureAnalysis.suggestion}`,
    "",
    "情绪分析：",
    `- 分布：${JSON.stringify(emotionAnalysis.emotionDistribution)}`,
    `- 高潮次数：${emotionAnalysis.climaxCount}`,
    `- 建议：${emotionAnalysis.suggestion}`,
    "",
    "请为每一章生成节奏优化建议。",
    "",
    "每章需要包含：",
    "1. 当前节奏",
    "2. 建议节奏",
    "3. 原因",
    "4. 具体行动",
    "",
    "请用 JSON 数组格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位小说节奏优化专家，擅长调整长篇小说的节奏和情绪曲线。",
    prompt,
    temperature: 0.5,
    maxTokens: 2000,
  });

  try {
    return JSON.parse(result || "[]");
  } catch {
    return [];
  }
}

// 自动优化章节节奏
export async function autoOptimizeChapterRhythm(
  novelId: string,
  chapterId: string
): Promise<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });

  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const storyContext = await buildStoryContext(novelId);
  const pleasureAnalysis = await analyzePleasureRhythm(novelId);
  const emotionAnalysis = await analyzeEmotionRhythm(novelId);

  const prompt = [
    "你是一位小说润色专家，负责优化章节的节奏。",
    "",
    `小说：${chapter.novel.title}`,
    `章节：第${chapter.order}章 ${chapter.title}`,
    "",
    "剧情状态：",
    storyContext,
    "",
    "当前内容：",
    chapter.content || "章节内容为空",
    "",
    "节奏分析：",
    `- 爽点间隔：${pleasureAnalysis.averageInterval}章`,
    `- 情绪分布：${JSON.stringify(emotionAnalysis.emotionDistribution)}`,
    "",
    "请优化这个章节的节奏：",
    "1. 调整句子长度",
    "2. 调整段落节奏",
    "3. 调整对话比例",
    "4. 调整描写密度",
    "",
    "请输出优化后的内容。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位小说润色专家，擅长调整章节的节奏和可读性。",
    prompt,
    temperature: 0.5,
    maxTokens: 4000,
  });

  return result || chapter.content || "";
}

// 节奏监控
export async function monitorRhythm(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      chapters: { orderBy: { order: "desc" }, take: 10 },
      pleasurePoints: { orderBy: { chapterOrder: "desc" }, take: 10 },
      emotionCurve: { orderBy: { chapterOrder: "desc" }, take: 10 },
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const latestChapter = novel.chapters[0];
  if (!latestChapter) {
    return { status: "no_chapters" };
  }

  const pleasureAnalysis = await analyzePleasureRhythm(novelId);
  const emotionAnalysis = await analyzeEmotionRhythm(novelId);

  const warnings: string[] = [];

  // 检查爽点重复
  const recentPleasures = novel.pleasurePoints.slice(0, 5);
  const recentTypes = recentPleasures.map((p) => p.type);
  const uniqueTypes = new Set(recentTypes);
  if (uniqueTypes.size === 1 && recentTypes.length >= 3) {
    warnings.push("最近爽点类型过于单一，建议多样化。");
  }

  // 检查情绪单调
  const recentEmotions = novel.emotionCurve.slice(0, 5);
  const recentEmotionTypes = recentEmotions.map((e) => e.emotionType);
  const uniqueEmotions = new Set(recentEmotionTypes);
  if (uniqueEmotions.size === 1 && recentEmotionTypes.length >= 3) {
    warnings.push("最近情绪过于单调，建议增加变化。");
  }

  // 检查疲劳度
  if (pleasureAnalysis.averageInterval < 2) {
    warnings.push("爽点过于密集，读者可能疲劳。");
  }

  return {
    latestChapter: latestChapter.order,
    pleasureAnalysis,
    emotionAnalysis,
    warnings,
  };
}
