/**
 * 章级质量后验模块
 * 纯程序检测，无 LLM 调用（正则 + 字数 + 结构分析）
 */

import { PhaseContext } from "./pipelineUtils";
import { detectAiSmell, checkWordCount, QUALITY_THRESHOLDS } from "./writingRules";
import { detectSentencePatterns, detectParagraphPatterns, detectAIStructure, scoreProseStyle, scoreReadability } from "./aiSmellWords";
import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { detectStyleDeviation, type StyleFingerprint } from "./styleFingerprint";

// 主题偏离检测：不同 genre 禁止出现的关键词
const GENRE_FORBIDDEN_WORDS: Record<string, string[]> = {
  "都市": ["修仙", "灵气", "筑基", "金丹", "元婴", "渡劫", "飞升", "仙人", "法宝", "灵石", "丹田", "经脉", "真气", "内力", "斗气", "魔法", "异世界", "穿越", "重生", "系统", "面板", "属性点", "经验值", "升级", "等级提升"],
  "玄幻": ["手机", "互联网", "公司", "CEO", "总裁", "办公室", "股票", "上市", "都市", "现代", "科技", "程序员", "外卖", "快递"],
  "仙侠": ["手机", "互联网", "公司", "CEO", "总裁", "办公室", "股票", "上市", "都市", "现代", "科技", "程序员"],
  "言情": ["修仙", "灵气", "筑基", "金丹", "元婴", "渡劫", "飞升", "战斗", "杀戮", "血腥", "暴力"],
  "悬疑": ["修仙", "灵气", "筑基", "金丹", "元婴", "渡劫", "飞升", "魔法", "异世界"],
  "历史": ["手机", "互联网", "电脑", "汽车", "飞机", "现代", "科技", "公司"],
  "科幻": ["修仙", "灵气", "筑基", "金丹", "元婴", "渡劫", "飞升", "法宝", "灵石", "丹田", "魔法", "异世界", "斗气", "武魂"],
  "末日": ["修仙", "灵气", "魔法", "异世界", "古代", "朝廷", "皇帝", "江湖", "武林", "仙人", "法宝", "灵石"],
  "游戏": ["修仙", "灵气", "古代", "朝廷", "皇帝", "江湖", "武林", "真实世界", "仙人", "法宝", "灵石"],
  "竞技": ["修仙", "灵气", "魔法", "异世界", "古代", "朝廷", "皇帝", "斗气", "武魂", "法宝", "灵石"],
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
  // 深度检测维度
  sentencePattern: number;   // 0-100, 句式AI味（越高越像AI）
  paragraphPattern: number;  // 0-100, 段落AI味（越高越像AI）
  structurePattern: number;  // 0-100, 结构AI味（越高越像AI）
  // 综合分（加权后）
  aiSmellComposite: number;  // 0-100, 综合AI味（词汇40% + 句式30% + 段落20% + 结构10%）
  proseStyle: number;        // 0-10, 散文风格评分（10为最佳）
  readability: number;       // 0-10, 可读性评分（10为最佳）
  // 风格一致性
  styleConsistency: number;  // 0-10, 风格一致性评分（10为完全一致，0为严重偏离）
}

export interface QualityIssue {
  type: "ai_smell" | "word_count" | "genre_deviation" | "continuity" | "narrative_quality";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface QualityResult {
  passed: boolean;
  scores: QualityScores;
  issues: QualityIssue[];
  shouldRetry: boolean;
  retryHint?: string;
  narrativeQuality?: NarrativeQualityResult;
}

export interface NarrativeQualityResult {
  overallScore: number;         // 1-10
  sceneConcrete: number;        // 1-10 场景具体度
  readerPromiseFulfilled: number; // 1-10 读者承诺兑现
  payoffVisible: number;        // 1-10 爽点可见度
  comedyEffective: number;      // 1-10 喜剧效果
  characterVoice: number;       // 1-10 人物声音区分度
  emotionCurve: number;         // 1-10 情绪曲线
  stateChanged: number;         // 1-10 状态变化
  summaryInsteadOfScene: boolean; // 是否用概述代替了场景
  issues: string[];
}

/**
 * 单章质量后验：程序检测 + 条件 LLM 叙事质量检测
 */
export async function validateChapterQuality(
  ctx: PhaseContext,
  novelId: string,
  chapterOrder: number,
  content: string,
  targetWordCount: number,
  chapterOutline: any,
  options?: { isKeyChapter?: boolean; retryCount?: number },
): Promise<QualityResult> {
  const issues: QualityIssue[] = [];

  // 1. AI 味正则检测（纯程序）
  const aiSmellResult = detectAiSmell(content);

  // 1.1 句式模式检测
  const sentencePatternResult = detectSentencePatterns(content);

  // 1.2 段落模式检测
  const paragraphPatternResult = detectParagraphPatterns(content);

  // 1.3 结构模式检测
  const structureResult = detectAIStructure(content);

  // 1.4 散文风格检测
  const proseStyleResult = scoreProseStyle(content);

  // 1.5 可读性评分
  const readabilityResult = scoreReadability(content);

  // 1.6 综合 AI 味评分：词汇(40%) + 句式(25%) + 段落(15%) + 结构(10%) + 可读性(10%)
  // 可读性分数转换为 AI 味分（10分制→百分制，分数越低越好）
  const readabilityAsSmell = (10 - readabilityResult.score) * 10;
  const aiSmellComposite =
    aiSmellResult.percentage * 0.4 +
    sentencePatternResult.score * 0.25 +
    paragraphPatternResult.score * 0.15 +
    structureResult.score * 0.1 +
    readabilityAsSmell * 0.1;

  if (aiSmellComposite > QUALITY_THRESHOLDS.AI_SMELL_MAX_PERCENT) {
    const detailParts: string[] = [];
    if (aiSmellResult.percentage > QUALITY_THRESHOLDS.AI_SMELL_MAX_PERCENT) {
      detailParts.push(`词汇命中${aiSmellResult.matches.slice(0, 3).join("、")}`);
    }
    if (sentencePatternResult.score > 30) {
      detailParts.push(...sentencePatternResult.details.slice(0, 2));
    }
    if (paragraphPatternResult.score > 30) {
      detailParts.push(...paragraphPatternResult.details.slice(0, 2));
    }
    if (structureResult.score > 30) {
      detailParts.push(...structureResult.details.slice(0, 2));
    }
    issues.push({
      type: "ai_smell",
      severity: aiSmellComposite > 3 ? "critical" : "high",
      description: `AI味过重（综合${aiSmellComposite.toFixed(1)}%：词汇${aiSmellResult.percentage.toFixed(1)}% + 句式${sentencePatternResult.score} + 段落${paragraphPatternResult.score} + 结构${structureResult.score}）：${detailParts.join("；")}`,
    });
  }

  // 1.7 可读性问题报告
  if (readabilityResult.score < 7) {
    issues.push({
      type: "ai_smell",
      severity: readabilityResult.score < 5 ? "critical" : "high",
      description: `可读性不佳（${readabilityResult.score}/10）：${readabilityResult.issues.join("；")}`,
    });
  }

  // 1.8 散文风格问题报告
  if (proseStyleResult.score < 7) {
    issues.push({
      type: "ai_smell",
      severity: proseStyleResult.score < 5 ? "critical" : "high",
      description: `散文风格不佳（${proseStyleResult.score}/10）：${proseStyleResult.issues.join("；")}`,
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

  // 3.5. 风格一致性检测（纯程序）
  const styleConsistencyResult = await detectStyleConsistency(novelId, content);
  if (styleConsistencyResult.score < 5) {
    issues.push({
      type: "narrative_quality",
      severity: styleConsistencyResult.score < 3 ? "critical" : "high",
      description: styleConsistencyResult.issues.join("；") || `风格一致性不足（${styleConsistencyResult.score}/10）`,
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

  // 综合判定（程序检测）
  const scores: QualityScores = {
    aiSmell: aiSmellResult.percentage,
    wordCount: wordCountResult.compliant ? 10 : Math.round(wordCountResult.ratio * 10),
    genreDeviation: genreResult.deviationScore,
    continuity: continuityResult.score,
    sentencePattern: sentencePatternResult.score,
    paragraphPattern: paragraphPatternResult.score,
    structurePattern: structureResult.score,
    aiSmellComposite,
    proseStyle: proseStyleResult.score,
    readability: readabilityResult.score,
    styleConsistency: styleConsistencyResult.score,
  };

  const programShouldRetry =
    aiSmellComposite > QUALITY_THRESHOLDS.AI_SMELL_MAX_PERCENT ||
    !wordCountResult.compliant ||
    genreResult.deviationScore >= 3 ||
    continuityResult.score < 5 ||
    proseStyleResult.score < 5 ||
    styleConsistencyResult.score < 3;

  // 条件启用 LLM 叙事质量检测
  let narrativeQuality: NarrativeQualityResult | undefined;
  const hasWarnings = issues.some(i => i.severity === "high" || i.severity === "critical");
  const retryCount = options?.retryCount || 0;
  const shouldRunNarrativeLLM =
    options?.isKeyChapter ||
    scores.wordCount < 8 ||
    scores.continuity < 7 ||
    scores.genreDeviation > 0 ||
    hasWarnings ||
    retryCount > 0;

  if (shouldRunNarrativeLLM) {
    try {
      narrativeQuality = await runNarrativeQualityCheck(ctx, content, chapterOutline, targetWordCount);
    } catch (e) {
      console.warn("[qualityCheck] LLM 叙事质量检测失败，跳过:", e);
    }
  }

  // LLM 叙事检测结果参与 passed/shouldRetry 判定
  let narrativeFailed = false;
  if (narrativeQuality) {
    narrativeFailed =
      narrativeQuality.sceneConcrete < 7 ||
      narrativeQuality.readerPromiseFulfilled < 7 ||
      narrativeQuality.payoffVisible < 7 ||
      narrativeQuality.characterVoice < 7 ||
      narrativeQuality.emotionCurve < 6 ||
      narrativeQuality.stateChanged < 7 ||
      narrativeQuality.summaryInsteadOfScene === true;
    if (narrativeFailed) {
      issues.push({
        type: "narrative_quality" as any,
        severity: "high",
        description: `叙事质量不合格：${narrativeQuality.issues.join("；") || "场景、爽点或人物口吻不足"}`,
      });
    }
  }

  const shouldRetry = programShouldRetry || narrativeFailed;
  const passed = issues.length === 0;
  const retryHint = shouldRetry ? issues.map((i) => i.description).join("；") : undefined;

  return { passed, scores, issues, shouldRetry, retryHint, narrativeQuality };
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
      const prevWords = new Set<string>(prevEnding.match(/[一-龥]{2,}/g) || []);
      const currWords = new Set<string>(currBeginning.match(/[一-龥]{2,}/g) || []);

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

/**
 * LLM 叙事质量检测（条件调用）
 * 仅对关键章/风险章/重试章启用
 */
async function runNarrativeQualityCheck(
  ctx: PhaseContext,
  content: string,
  chapterOutline: any,
  targetWordCount: number,
): Promise<NarrativeQualityResult> {
  const system = `你是一位严苛的网文质量审读编辑。你的任务是评估章节的叙事质量，而不是文学质量。
评分标准必须严格，不能放水：
- 7分以上 = 合格，可以发布
- 5-6分 = 勉强，需要修改
- 5分以下 = 不合格，必须重写
请根据实际质量独立评分，不要参考任何预设分数区间。`;

  const contentExcerpt = content.length > 6000
    ? content.slice(0, 3000) + "\n...(中段省略)...\n" + content.slice(-3000)
    : content;

  const prompt = `请严格评估以下章节的叙事质量。

【章节大纲】
${JSON.stringify(chapterOutline || {}, null, 2)}

【目标字数】${targetWordCount}

【章节正文】
${contentExcerpt}

请逐项评分（1-10分），必须诚实打分：

1. sceneConcrete（场景具体度）：场景是否具体可感？是否有空间/物件/动作细节？还是泛泛而谈？
2. readerPromiseFulfilled（读者承诺兑现）：章纲承诺给读者的体验是否兑现了？如"爽""紧张""搞笑"是否真的做到了？
3. payoffVisible（爽点可见度）：爽点是否清晰可感？还是模糊不清、一笔带过？
4. comedyEffective（喜剧效果）：如果需要搞笑，是否真的好笑？是否只是硬凑笑点？
5. characterVoice（人物声音区分度）：不同角色的说话方式是否有区别？还是千人一面？
6. emotionCurve（情绪曲线）：是否有情绪起伏？还是全程平铺直叙？
7. stateChanged（状态变化）：章节结束时，角色/局势是否发生了可感知的变化？
8. summaryInsteadOfScene（是否概述代替场景）：是否用"几天后""他做了XX"的概述代替了具体场景？

请返回JSON：
{
  "overallScore": 5,
  "sceneConcrete": 5,
  "readerPromiseFulfilled": 5,
  "payoffVisible": 5,
  "comedyEffective": 5,
  "characterVoice": 5,
  "emotionCurve": 5,
  "stateChanged": 5,
  "summaryInsteadOfScene": false,
  "issues": ["具体问题1", "具体问题2"]
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 1500 });
  const parsed = parseLlmJson(result) || {};

  return {
    overallScore: Number(parsed.overallScore) || 5,
    sceneConcrete: Number(parsed.sceneConcrete) || 5,
    readerPromiseFulfilled: Number(parsed.readerPromiseFulfilled) || 5,
    payoffVisible: Number(parsed.payoffVisible) || 5,
    comedyEffective: Number(parsed.comedyEffective) || 5,
    characterVoice: Number(parsed.characterVoice) || 5,
    emotionCurve: Number(parsed.emotionCurve) || 5,
    stateChanged: Number(parsed.stateChanged) || 5,
    summaryInsteadOfScene: !!parsed.summaryInsteadOfScene,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  };
}

/**
 * 风格一致性检测：从 StyleProfile 读取缓存指纹，检测生成内容的偏离度
 * 返回 0-10 分（10 = 完全一致，0 = 严重偏离）
 */
async function detectStyleConsistency(
  novelId: string,
  content: string,
): Promise<{ score: number; issues: string[] }> {
  const issues: string[] = [];

  try {
    const styleProfile = await prisma.styleProfile.findFirst({
      where: { novelId, isDefault: true },
      select: { fingerprint: true },
    });

    if (!styleProfile?.fingerprint) {
      // 无指纹，不扣分
      return { score: 10, issues };
    }

    const fp: StyleFingerprint = JSON.parse(styleProfile.fingerprint);
    const result = detectStyleDeviation(fp, content);

    // 偏离度转为一致性分（10 - 偏离度）
    const score = Math.max(0, 10 - result.deviationScore);

    if (result.deviationScore > 3) {
      const detailParts = result.deviations.map(
        d => `${d.dimension}：期望${d.expected}，实际${d.actual}`
      );
      issues.push(`风格偏离（偏离度${result.deviationScore}/10）：${detailParts.slice(0, 3).join("；")}`);
    }

    return { score, issues };
  } catch (e) {
    console.warn("[qualityCheck] 风格一致性检测异常:", e);
    return { score: 10, issues };
  }
}
