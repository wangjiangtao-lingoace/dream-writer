/**
 * 章级质量后验模块
 * 纯程序检测，无 LLM 调用（正则 + 字数 + 结构分析）
 */

import { PhaseContext } from "./pipelineUtils";
import { detectAiSmell, checkWordCount, QUALITY_THRESHOLDS } from "./writingRules";

export interface QualityScores {
  aiSmell: number;      // 0-100, 越低越好（AI味词汇占比百分比）
  wordCount: number;    // 0-10, 字数合规度
}

export interface QualityIssue {
  type: "ai_smell" | "word_count";
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

  // 综合判定（无 LLM）
  const scores: QualityScores = {
    aiSmell: aiSmellResult.percentage,
    wordCount: wordCountResult.compliant ? 10 : Math.round(wordCountResult.ratio * 10),
  };

  const shouldRetry =
    aiSmellResult.percentage > QUALITY_THRESHOLDS.AI_SMELL_MAX_PERCENT ||
    !wordCountResult.compliant;

  const passed = issues.length === 0;
  const retryHint = shouldRetry ? issues.map((i) => i.description).join("；") : undefined;

  return { passed, scores, issues, shouldRetry, retryHint };
}
