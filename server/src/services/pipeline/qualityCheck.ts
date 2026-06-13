/**
 * 章级质量后验模块
 * 纯程序检测，无 LLM 调用（正则 + 字数 + 结构分析）
 */

import { PhaseContext } from "./pipelineUtils";
import { detectAiSmell, checkWordCount, QUALITY_THRESHOLDS } from "./writingRules";
import { prisma } from "../../db/prisma";

// 主题偏离检测：不同 genre 禁止出现的关键词
const GENRE_FORBIDDEN_WORDS: Record<string, string[]> = {
  "都市": ["修仙", "灵气", "筑基", "金丹", "元婴", "渡劫", "飞升", "仙人", "法宝", "灵石", "丹田", "经脉", "真气", "内力", "斗气", "魔法", "异世界", "穿越", "重生", "系统", "面板", "属性点", "经验值", "升级", "等级提升"],
  "玄幻": ["手机", "互联网", "公司", "CEO", "总裁", "办公室", "股票", "上市", "都市", "现代", "科技", "程序员", "外卖", "快递"],
  "仙侠": ["手机", "互联网", "公司", "CEO", "总裁", "办公室", "股票", "上市", "都市", "现代", "科技", "程序员"],
  "言情": ["修仙", "灵气", "筑基", "金丹", "元婴", "渡劫", "飞升", "战斗", "杀戮", "血腥", "暴力"],
  "悬疑": ["修仙", "灵气", "筑基", "金丹", "元婴", "渡劫", "飞升", "魔法", "异世界"],
  "历史": ["手机", "互联网", "电脑", "汽车", "飞机", "现代", "科技", "公司"],
};

export interface QualityScores {
  aiSmell: number;      // 0-100, 越低越好（AI味词汇占比百分比）
  wordCount: number;    // 0-10, 字数合规度
  genreDeviation: number; // 0-10, 主题偏离度（0=无偏离）
}

export interface QualityIssue {
  type: "ai_smell" | "word_count" | "genre_deviation";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface QualityResult {
  passed: boolean;
  scores: QualityScores;
  issues: QualityIssue[];
  shouldRetry: boolean;
  retryHint?: string;
}

/**
 * 单章质量后验：纯程序检测，无 LLM 调用
 */
export async function validateChapterQuality(
  ctx: PhaseContext,
  novelId: string,
  chapterOrder: number,
  content: string,
  targetWordCount: number,
  chapterOutline: any,
): Promise<QualityResult> {
  const issues: QualityIssue[] = [];

  // 1. AI 味正则检测（纯程序）
  const aiSmellResult = detectAiSmell(content);
  if (aiSmellResult.percentage > QUALITY_THRESHOLDS.AI_SMELL_MAX_PERCENT) {
    issues.push({
      type: "ai_smell",
      severity: aiSmellResult.percentage > 2 ? "critical" : "high",
      description: `AI味词汇过多（${aiSmellResult.percentage.toFixed(2)}%）：${aiSmellResult.matches.slice(0, 5).join("、")}`,
    });
  }

  // 2. 字数校验（纯程序）
  const wordCountResult = checkWordCount(content.length, targetWordCount);
  if (!wordCountResult.compliant) {
    issues.push({
      type: "word_count",
      severity: wordCountResult.ratio < 0.6 || wordCountResult.ratio > 1.5 ? "critical" : "medium",
      description: wordCountResult.message,
    });
  }

  // 3. 主题偏离检测（纯程序）
  const genreResult = await detectGenreDeviation(novelId, content);
  if (genreResult.deviationScore > 0) {
    issues.push({
      type: "genre_deviation",
      severity: genreResult.deviationScore >= 3 ? "critical" : genreResult.deviationScore >= 2 ? "high" : "medium",
      description: `主题偏离（发现${genreResult.matchCount}个不该出现的${genreResult.genre}类词汇）：${genreResult.matchedWords.slice(0, 5).join("、")}`,
    });
  }

  // 综合判定（无 LLM）
  const scores: QualityScores = {
    aiSmell: aiSmellResult.percentage,
    wordCount: wordCountResult.compliant ? 10 : Math.round(wordCountResult.ratio * 10),
    genreDeviation: genreResult.deviationScore,
  };

  const shouldRetry =
    aiSmellResult.percentage > QUALITY_THRESHOLDS.AI_SMELL_MAX_PERCENT ||
    !wordCountResult.compliant ||
    genreResult.deviationScore >= 3;

  const passed = issues.length === 0;
  const retryHint = shouldRetry ? issues.map((i) => i.description).join("；") : undefined;

  return { passed, scores, issues, shouldRetry, retryHint };
}

/**
 * 主题偏离检测：检查内容中是否出现了与 genre 不符的关键词
 */
async function detectGenreDeviation(novelId: string, content: string): Promise<{
  genre: string;
  matchCount: number;
  matchedWords: string[];
  deviationScore: number;
}> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { genre: true },
  });

  const genre = novel?.genre || "";
  if (!genre) return { genre: "", matchCount: 0, matchedWords: [], deviationScore: 0 };

  // 匹配 genre 对应的禁止词表
  const forbiddenWords = GENRE_FORBIDDEN_WORDS[genre] || [];
  if (forbiddenWords.length === 0) return { genre, matchCount: 0, matchedWords: [], deviationScore: 0 };

  const matchedWords: string[] = [];
  let matchCount = 0;

  for (const word of forbiddenWords) {
    const regex = new RegExp(word, "g");
    const found = content.match(regex);
    if (found) {
      matchedWords.push(word);
      matchCount += found.length;
    }
  }

  // 偏离评分：0=无偏离，1=轻微，2=中等，3=严重
  let deviationScore = 0;
  if (matchCount >= 5) deviationScore = 3;
  else if (matchCount >= 3) deviationScore = 2;
  else if (matchCount >= 1) deviationScore = 1;

  return { genre, matchCount, matchedWords, deviationScore };
}
