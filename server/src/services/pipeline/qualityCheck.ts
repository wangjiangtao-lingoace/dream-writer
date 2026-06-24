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

// 跳章检测：检查是否出现了不该出现的状态跳跃
const CONTINUITY_KEYWORDS = {
  // 时间跳跃关键词
  timeJump: ["几天后", "一周后", "一个月后", "几个月后", "一年后", "多年后", "第二天", "第三天", "次日", "隔天"],
  // 状态突变关键词
  statusJump: ["突然", "忽然", "竟然", "居然", "没想到", "意想不到"],
  // 知识跳跃关键词（角色突然知道不该知道的信息）
  knowledgeJump: ["原来", "其实", "事实上", "真相是", "后来才知道"],
};

export interface QualityScores {
  aiSmell: number;      // 0-100, 越低越好（AI味词汇占比百分比）
  wordCount: number;    // 0-10, 字数合规度
  genreDeviation: number; // 0-10, 主题偏离度（0=无偏离）
  continuity: number;   // 0-10, 剧情承接度（10=完美承接）
}

export interface QualityIssue {
  type: "ai_smell" | "word_count" | "genre_deviation" | "continuity";
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

  // 4. 剧情承接检测（纯程序）
  const continuityResult = await detectContinuityIssues(novelId, chapterOrder, content);
  if (continuityResult.score < 7) {
    issues.push({
      type: "continuity",
      severity: continuityResult.score < 5 ? "critical" : continuityResult.score < 7 ? "high" : "medium",
      description: `剧情承接问题：${continuityResult.issues.slice(0, 3).join("；")}`,
    });
  }

  // 综合判定（无 LLM）
  const scores: QualityScores = {
    aiSmell: aiSmellResult.percentage,
    wordCount: wordCountResult.compliant ? 10 : Math.round(wordCountResult.ratio * 10),
    genreDeviation: genreResult.deviationScore,
    continuity: continuityResult.score,
  };

  const shouldRetry =
    aiSmellResult.percentage > QUALITY_THRESHOLDS.AI_SMELL_MAX_PERCENT ||
    !wordCountResult.compliant ||
    genreResult.deviationScore >= 3 ||
    continuityResult.score < 5;

  const passed = issues.length === 0;
  const retryHint = shouldRetry ? issues.map((i) => i.description).join("；") : undefined;

  return { passed, scores, issues, shouldRetry, retryHint };
}

/**
 * 剧情承接检测：检查是否存在跳章、状态突变、知识跳跃等问题
 */
async function detectContinuityIssues(novelId: string, chapterOrder: number, content: string): Promise<{
  score: number;
  issues: string[];
}> {
  const issues: string[] = [];

  // 1. 检查时间跳跃
  for (const keyword of CONTINUITY_KEYWORDS.timeJump) {
    if (content.includes(keyword)) {
      // 检查是否在开头 300 字内出现（允许开头承接）
      const first300 = content.slice(0, 300);
      if (!first300.includes(keyword)) {
        issues.push(`正文中间出现时间跳跃词"${keyword}"，可能导致剧情断裂`);
      }
    }
  }

  // 2. 检查状态突变
  for (const keyword of CONTINUITY_KEYWORDS.statusJump) {
    const regex = new RegExp(`.{0,50}${keyword}.{0,50}`, "g");
    const matches = content.match(regex);
    if (matches && matches.length > 2) {
      issues.push(`状态突变词"${keyword}"出现${matches.length}次，可能导致剧情跳跃`);
    }
  }

  // 3. 检查知识跳跃（角色突然知道不该知道的信息）
  for (const keyword of CONTINUITY_KEYWORDS.knowledgeJump) {
    const regex = new RegExp(`.{0,30}${keyword}.{0,30}`, "g");
    const matches = content.match(regex);
    if (matches && matches.length > 1) {
      issues.push(`知识跳跃词"${keyword}"出现${matches.length}次，可能存在信息来源不明`);
    }
  }

  // 4. 检查是否有上一章内容的承接（前 300 字）
  if (chapterOrder > 1) {
    const prevChapter = await prisma.chapter.findFirst({
      where: { novelId, order: chapterOrder - 1 },
      select: { content: true },
    });

    if (prevChapter && prevChapter.content) {
      const prevEnding = prevChapter.content.slice(-200);
      const currBeginning = content.slice(0, 300);

      // 检查是否有共同的关键词（简单的文本相似度）
      const prevWords = new Set(prevEnding.match(/[一-龥]{2,}/g) || []);
      const currWords = new Set(currBeginning.match(/[一-龥]{2,}/g) || []);

      let commonWords = 0;
      for (const word of prevWords) {
        if (currWords.has(word)) commonWords++;
      }

      // 如果共同词太少，可能是跳章
      if (prevWords.size > 5 && commonWords < 2) {
        issues.push("本章开头与上一章结尾关联度低，可能存在跳章");
      }
    }
  }

  // 计算分数（10分制，扣分制）
  let score = 10;
  score -= Math.min(3, issues.length); // 每个问题扣1分，最多扣3分

  // 额外扣分：如果问题严重
  if (issues.some(i => i.includes("跳章"))) score -= 2;
  if (issues.some(i => i.includes("知识跳跃"))) score -= 1;

  return { score: Math.max(0, score), issues };
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
