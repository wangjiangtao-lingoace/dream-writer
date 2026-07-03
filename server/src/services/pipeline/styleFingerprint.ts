/**
 * 风格指纹（Stylometric Fingerprinting）服务
 * 从参考章节中提取可量化的写作风格信号，用于生成时注入 Prompt 和生成后偏离检测
 */

// ============================================================
// 类型定义
// ============================================================

export interface StyleFingerprint {
  // 句式特征
  sentencePatterns: {
    avgLength: number;           // 平均句长
    shortRatio: number;          // 短句比例（<10字）
    longRatio: number;           // 长句比例（>35字）
    questionRatio: number;       // 疑问句比例
    exclamationRatio: number;    // 感叹句比例
    dialogueRatio: number;       // 对话句比例
  };

  // 词汇特征
  vocabularyProfile: {
    avgWordLength: number;       // 平均词长
    uniqueWordRatio: number;     // 词汇丰富度
    topAdjectives: string[];     // 常用形容词 top10
    topVerbs: string[];          // 常用动词 top10
    topDescriptors: string[];    // 常用描写词 top10
    colloquialRatio: number;     // 口语化词汇比例
  };

  // 段落特征
  paragraphProfile: {
    avgParagraphLength: number;  // 平均段落长度
    dialogueParagraphRatio: number; // 对话段比例
    descriptionParagraphRatio: number; // 描写段比例
    transitionStyle: string;     // 段落过渡方式（"空行" / "首行缩进" / "场景切换"）
  };

  // 语气特征
  toneProfile: {
    primaryTone: string;         // 主导语气（"冷峻" / "温暖" / "幽默" / "沉重" / "轻快"）
    emotionalRange: number;      // 情感波动范围 1-10
    narratorPerspective: string; // 叙述视角（"第一人称" / "第三人称有限" / "第三人称全知"）
    tensePreference: string;     // 时态偏好（"过去时" / "现在时"）
  };

  // 独特标记
  signaturePatterns: {
    favoriteOpenings: string[];  // 常用开头方式 top5
    favoriteTransitions: string[]; // 常用过渡词 top5
    favoriteEndings: string[];   // 常用结尾方式 top5
    avoidPatterns: string[];     // 应避免的模式（与指纹不符的表达）
  };

  // 元数据
  sourceChapters: number[];      // 来源章节
  wordCount: number;             // 总字数
  extractedAt: string;           // ISO 时间戳
}

// ============================================================
// 中文分词辅助（简单按标点+空格切分，不依赖外部库）
// ============================================================

/** 常见中文形容词（高频，用于简单词性推断） */
const COMMON_ADJECTIVES = new Set([
  "大", "小", "好", "坏", "美", "丑", "新", "旧", "老", "少",
  "高", "低", "长", "短", "快", "慢", "远", "近", "深", "浅",
  "冷", "热", "轻", "重", "强", "弱", "硬", "软", "亮", "暗",
  "红", "白", "黑", "青", "蓝", "绿", "金", "银", "紫", "灰",
  "真", "假", "对", "错", "难", "易", "早", "晚", "干", "湿",
  "浓", "淡", "厚", "薄", "宽", "窄", "圆", "扁", "尖", "钝",
  "狂", "怒", "悲", "喜", "痛", "苦", "甜", "酸", "辣", "咸",
  "凶", "狠", "恶", "善", "忠", "奸", "勇", "怯", "智", "愚",
  "静", "闹", "空", "满", "密", "疏", "粗", "细", "曲", "直",
]);

/** 常见动词 */
const COMMON_VERBS = new Set([
  "走", "跑", "跳", "飞", "看", "听", "说", "问", "答", "叫",
  "哭", "笑", "怒", "骂", "打", "杀", "拿", "放", "来", "去",
  "进", "出", "上", "下", "开", "关", "坐", "站", "躺", "睡",
  "吃", "喝", "穿", "戴", "写", "读", "想", "知", "信", "怕",
  "爱", "恨", "找", "等", "送", "接", "拉", "推", "提", "按",
  "拔", "砍", "刺", "挡", "闪", "躲", "追", "逃", "围", "解",
  "握", "抱", "跪", "拜", "点", "转", "踏", "跨", "靠", "撑",
  "挡", "挥", "劈", "戳", "掀", "扯", "撕", "扔", "抛", "捡",
]);

/** 常见描写词（形容词 + 感官词 + 状态词） */
const COMMON_DESCRIPTORS = new Set([
  ...COMMON_ADJECTIVES,
  "微微", "轻轻", "缓缓", "慢慢", "静静", "默默", "淡淡",
  "深深", "紧紧", "重重", "狠狠", "悄悄", "偷偷", "明明",
  "忽然", "突然", "骤然", "猛然", "竟然", "居然", "果然",
  "隐约", "朦胧", "模糊", "清晰", "分明", "依稀", "恍惚",
]);

/** 口语化词汇 */
const COLLOQUIAL_WORDS = new Set([
  "嗯", "啊", "哦", "呀", "吧", "呢", "嘛", "哈", "嘿", "喂",
  "靠", "我去", "卧槽", "特么", "尼玛", "老子", "老娘", "哥们",
  "兄弟", "大姐", "大哥", "大叔", "大爷", "小子", "丫头",
  "得了", "算了", "行了", "好了", "够了", "去吧", "来吧",
  "说真的", "说实话", "老实说", "说白了", "说到底",
]);

/** 情感词表（正面/负面/中性） */
const POSITIVE_EMOTION_WORDS = new Set([
  "笑", "喜", "乐", "悦", "欢", "美", "好", "爱", "赞", "福",
  "幸", "甜", "暖", "光", "明", "亮", "希望", "期待", "满足",
  "感激", "欣慰", "欣喜", "兴奋", "快乐", "幸福", "温馨",
]);

const NEGATIVE_EMOTION_WORDS = new Set([
  "哭", "悲", "痛", "苦", "怒", "恨", "怕", "惧", "忧", "愁",
  "惨", "伤", "死", "亡", "暗", "黑", "冷", "寒", "血", "泪",
  "绝望", "恐惧", "愤怒", "悲伤", "痛苦", "焦虑", "不安",
]);

/** 句末标点 */
const SENTENCE_ENDINGS = /[。！？；…\n]/;

/** 句首过渡词（用于检测段落首词） */
const TRANSITION_WORDS = [
  "然而", "但是", "可是", "不过", "只是", "只是",
  "于是", "因此", "所以", "结果",
  "接着", "随后", "然后", "接下来",
  "同时", "此刻", "这时", "此时",
  "忽然", "突然", "骤然", "猛然",
  "终于", "最终", "到底",
];

// ============================================================
// 核心提取函数
// ============================================================

/**
 * 从多章参考文本中提取风格指纹
 */
export function extractStyleFingerprint(
  chapters: Array<{ order: number; content: string }>
): StyleFingerprint {
  // 合并所有章节内容
  const allContent = chapters.map(c => c.content).join("\n\n");
  const sourceChapters = chapters.map(c => c.order);
  const wordCount = allContent.length;

  // 1. 句式特征
  const sentencePatterns = analyzeSentencePatterns(allContent);

  // 2. 词汇特征
  const vocabularyProfile = analyzeVocabularyProfile(allContent);

  // 3. 段落特征
  const paragraphProfile = analyzeParagraphProfile(allContent);

  // 4. 语气特征
  const toneProfile = analyzeToneProfile(allContent);

  // 5. 独特标记
  const signaturePatterns = analyzeSignaturePatterns(allContent);

  return {
    sentencePatterns,
    vocabularyProfile,
    paragraphProfile,
    toneProfile,
    signaturePatterns,
    sourceChapters,
    wordCount,
    extractedAt: new Date().toISOString(),
  };
}

// ============================================================
// 句式特征分析
// ============================================================

function analyzeSentencePatterns(text: string): StyleFingerprint["sentencePatterns"] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { avgLength: 0, shortRatio: 0, longRatio: 0, questionRatio: 0, exclamationRatio: 0, dialogueRatio: 0 };
  }

  let totalLength = 0;
  let shortCount = 0;
  let longCount = 0;
  let questionCount = 0;
  let exclamationCount = 0;
  let dialogueCount = 0;

  for (const s of sentences) {
    const len = s.replace(/[。！？；…\s]/g, "").length;
    totalLength += len;

    if (len < 10) shortCount++;
    if (len > 35) longCount++;
    if (s.includes("“") || s.includes("”") || s.includes("「") || s.includes("」") || s.includes("：")) dialogueCount++;
    if (s.includes("?") || s.includes("？")) questionCount++;
    if (s.includes("!") || s.includes("！")) exclamationCount++;
  }

  const count = sentences.length;
  return {
    avgLength: Math.round(totalLength / count),
    shortRatio: round2(shortCount / count),
    longRatio: round2(longCount / count),
    questionRatio: round2(questionCount / count),
    exclamationRatio: round2(exclamationCount / count),
    dialogueRatio: round2(dialogueCount / count),
  };
}

/** 按句末标点分句 */
function splitSentences(text: string): string[] {
  const parts = text.split(SENTENCE_ENDINGS);
  return parts.map(s => s.trim()).filter(s => s.length >= 2);
}

// ============================================================
// 词汇特征分析
// ============================================================

function analyzeVocabularyProfile(text: string): StyleFingerprint["vocabularyProfile"] {
  // 提取所有词（中文连续字符 + 英文单词）
  const words = extractWords(text);
  if (words.length === 0) {
    return { avgWordLength: 0, uniqueWordRatio: 0, topAdjectives: [], topVerbs: [], topDescriptors: [], colloquialRatio: 0 };
  }

  const totalLength = words.reduce((sum, w) => sum + w.length, 0);
  const uniqueWords = new Set(words);
  const freq = wordFrequency(words);

  // 分类统计
  const adjFreq: Record<string, number> = {};
  const verbFreq: Record<string, number> = {};
  const descFreq: Record<string, number> = {};
  let colloquialCount = 0;

  for (const [word, count] of Object.entries(freq)) {
    if (COMMON_ADJECTIVES.has(word)) adjFreq[word] = count;
    if (COMMON_VERBS.has(word)) verbFreq[word] = count;
    if (COMMON_DESCRIPTORS.has(word)) descFreq[word] = count;
    if (COLLOQUIAL_WORDS.has(word)) colloquialCount += count;
  }

  return {
    avgWordLength: round2(totalLength / words.length),
    uniqueWordRatio: round2(uniqueWords.size / words.length),
    topAdjectives: topN(adjFreq, 10),
    topVerbs: topN(verbFreq, 10),
    topDescriptors: topN(descFreq, 10),
    colloquialRatio: round2(colloquialCount / words.length),
  };
}

/** 提取词列表：中文连续 2-4 字 + 英文单词 */
function extractWords(text: string): string[] {
  const words: string[] = [];
  // 中文连续字符（2-4 字为一个词）
  const chineseRegex = /[一-鿿]{2,4}/g;
  let match;
  while ((match = chineseRegex.exec(text)) !== null) {
    // 拆分为 2 字词
    const str = match[0];
    for (let i = 0; i < str.length - 1; i += 2) {
      words.push(str.slice(i, Math.min(i + 2, str.length)));
    }
  }
  return words;
}

function wordFrequency(words: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  return freq;
}

function topN(freq: Record<string, number>, n: number): string[] {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word]) => word);
}

// ============================================================
// 段落特征分析
// ============================================================

function analyzeParagraphProfile(text: string): StyleFingerprint["paragraphProfile"] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length === 0) {
    return { avgParagraphLength: 0, dialogueParagraphRatio: 0, descriptionParagraphRatio: 0, transitionStyle: "空行" };
  }

  let totalLength = 0;
  let dialogueCount = 0;
  let descriptionCount = 0;

  for (const p of paragraphs) {
    totalLength += p.length;

    // 对话段：包含引号或对话标记
    if (p.includes("“") || p.includes("”") || p.includes("「") || p.includes("」") || p.includes("：")) {
      dialogueCount++;
    }

    // 描写段：不含引号且包含描写词
    if (!p.includes("“") && !p.includes("”") && !p.includes("「") && !p.includes("」")) {
      const hasDescriptor = [...COMMON_DESCRIPTORS].some(d => p.includes(d));
      if (hasDescriptor) descriptionCount++;
    }
  }

  // 检测过渡方式
  const transitionStyle = detectTransitionStyle(paragraphs);

  return {
    avgParagraphLength: Math.round(totalLength / paragraphs.length),
    dialogueParagraphRatio: round2(dialogueCount / paragraphs.length),
    descriptionParagraphRatio: round2(descriptionCount / paragraphs.length),
    transitionStyle,
  };
}

function detectTransitionStyle(paragraphs: string[]): string {
  // 检测是否有空行分隔
  const hasEmptyLineSeparation = paragraphs.length > 1;
  // 检测是否有首行缩进
  let indentCount = 0;
  for (const p of paragraphs) {
    if (p.startsWith("　　") || p.startsWith("  ")) indentCount++;
  }
  const indentRatio = indentCount / Math.max(paragraphs.length, 1);

  if (indentRatio > 0.5) return "首行缩进";
  if (hasEmptyLineSeparation) return "空行";
  return "场景切换";
}

// ============================================================
// 语气特征分析
// ============================================================

function analyzeToneProfile(text: string): StyleFingerprint["toneProfile"] {
  const words = extractWords(text);
  const wordSet = new Set(words);

  // 主导语气：通过情感词分布判断
  let positiveCount = 0;
  let negativeCount = 0;
  for (const w of words) {
    if (POSITIVE_EMOTION_WORDS.has(w)) positiveCount++;
    if (NEGATIVE_EMOTION_WORDS.has(w)) negativeCount++;
  }

  const totalEmotion = positiveCount + negativeCount;
  let primaryTone = "中性";
  if (totalEmotion > 0) {
    const positiveRatio = positiveCount / totalEmotion;
    if (positiveRatio > 0.6) primaryTone = "温暖";
    else if (positiveRatio < 0.4) primaryTone = "冷峻";
    else primaryTone = "平稳";
  }

  // 情感波动范围：基于情感词分布的标准差
  const emotionalRange = calculateEmotionalRange(text);

  // 叙述视角
  const narratorPerspective = detectNarratorPerspective(text);

  // 时态偏好
  const tensePreference = detectTensePreference(text);

  return { primaryTone, emotionalRange, narratorPerspective, tensePreference };
}

function calculateEmotionalRange(text: string): number {
  // 将文本分成 10 段，计算每段的情感得分，然后计算波动
  const segments = splitIntoSegments(text, 10);
  const scores = segments.map(seg => {
    let score = 0;
    for (const w of extractWords(seg)) {
      if (POSITIVE_EMOTION_WORDS.has(w)) score++;
      if (NEGATIVE_EMOTION_WORDS.has(w)) score--;
    }
    return score;
  });

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // 将标准差映射到 1-10 范围
  return Math.min(10, Math.max(1, Math.round(stdDev * 2)));
}

function splitIntoSegments(text: string, n: number): string[] {
  const segmentLength = Math.ceil(text.length / n);
  const segments: string[] = [];
  for (let i = 0; i < text.length; i += segmentLength) {
    segments.push(text.slice(i, i + segmentLength));
  }
  return segments;
}

function detectNarratorPerspective(text: string): string {
  // 统计第一人称和第三人称代词出现频率
  const firstPersonRegex = /我|我们|咱|咱们/g;
  const thirdPersonRegex = /他|她|他们|她们|其/g;

  const firstPersonMatches = text.match(firstPersonRegex) || [];
  const thirdPersonMatches = text.match(thirdPersonRegex) || [];

  const total = firstPersonMatches.length + thirdPersonMatches.length;
  if (total === 0) return "第三人称有限";

  const firstPersonRatio = firstPersonMatches.length / total;

  if (firstPersonRatio > 0.3) return "第一人称";
  if (firstPersonRatio < 0.1) return "第三人称全知";
  return "第三人称有限";
}

function detectTensePreference(text: string): string {
  // 检测过去时态标记
  const pastTenseRegex = /了|过|曾经|已经|曾|既/g;
  // 检测现在时态标记
  const presentTenseRegex = /着|正在|正|在|现/g;

  const pastMatches = text.match(pastTenseRegex) || [];
  const presentMatches = text.match(presentTenseRegex) || [];

  const total = pastMatches.length + presentMatches.length;
  if (total === 0) return "过去时";

  const pastRatio = pastMatches.length / total;
  return pastRatio > 0.5 ? "过去时" : "现在时";
}

// ============================================================
// 独特标记分析
// ============================================================

function analyzeSignaturePatterns(text: string): StyleFingerprint["signaturePatterns"] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);

  // 开头方式：取每段前 10 字
  const openings = paragraphs.map(p => p.slice(0, 10)).filter(s => s.length >= 4);
  const openingFreq = wordFrequency(openings);
  const favoriteOpenings = topN(openingFreq, 5);

  // 过渡词：统计段首词频
  const firstWords = paragraphs.map(p => {
    const match = p.match(/^[一-鿿]{2,4}/);
    return match ? match[0] : "";
  }).filter(s => s.length >= 2);
  const transitionFreq = wordFrequency(firstWords);
  const favoriteTransitions = topN(transitionFreq, 5);

  // 结尾方式：取每段后 10 字
  const endings = paragraphs.map(p => p.slice(-10)).filter(s => s.length >= 4);
  const endingFreq = wordFrequency(endings);
  const favoriteEndings = topN(endingFreq, 5);

  // 应避免的模式：AI 常用但本书不常用的模式
  const avoidPatterns = detectAvoidPatterns(text);

  return { favoriteOpenings, favoriteTransitions, favoriteEndings, avoidPatterns };
}

function detectAvoidPatterns(text: string): string[] {
  const avoidPatterns: string[] = [];

  // 检测 AI 常用但本书中出现频率低的模式
  const aiPatterns = [
    "不禁", "宛如", "似乎在诉说", "一缕", "一抹", "一丝",
    "淡淡地", "娓娓道来", "令人叹为观止", "目光深邃",
    "嘴角微微上扬", "令人震撼", "无与伦比", "深刻地", "极大地",
  ];

  for (const pattern of aiPatterns) {
    const regex = new RegExp(pattern, "g");
    const matches = text.match(regex);
    // 如果出现次数很少（0-2次），标记为应避免
    if (!matches || matches.length <= 2) {
      avoidPatterns.push(pattern);
    }
  }

  return avoidPatterns.slice(0, 10);
}

// ============================================================
// Prompt 转换
// ============================================================

/**
 * 将风格指纹转为 Prompt 注入文本
 */
export function fingerprintToPrompt(fp: StyleFingerprint): string {
  const lines: string[] = [];

  lines.push("【风格指纹 — 从已写章节提取的量化风格约束】");

  // 句式约束
  const sp = fp.sentencePatterns;
  lines.push(`句式：平均句长${sp.avgLength}字，短句占比${(sp.shortRatio * 100).toFixed(0)}%，长句占比${(sp.longRatio * 100).toFixed(0)}%`);
  if (sp.dialogueRatio > 0.3) lines.push(`对话占比高（${(sp.dialogueRatio * 100).toFixed(0)}%），需保持对话驱动`);
  if (sp.questionRatio > 0.1) lines.push(`疑问句较多（${(sp.questionRatio * 100).toFixed(0)}%），保持设问风格`);

  // 词汇约束
  const vp = fp.vocabularyProfile;
  lines.push(`词汇丰富度：${(vp.uniqueWordRatio * 100).toFixed(0)}%`);
  if (vp.topAdjectives.length > 0) lines.push(`常用形容词：${vp.topAdjectives.slice(0, 5).join("、")}`);
  if (vp.topVerbs.length > 0) lines.push(`常用动词：${vp.topVerbs.slice(0, 5).join("、")}`);
  if (vp.colloquialRatio > 0.1) lines.push(`口语化比例：${(vp.colloquialRatio * 100).toFixed(0)}%`);

  // 段落约束
  const pp = fp.paragraphProfile;
  lines.push(`段落：平均${pp.avgParagraphLength}字，对话段${(pp.dialogueParagraphRatio * 100).toFixed(0)}%，描写段${(pp.descriptionParagraphRatio * 100).toFixed(0)}%`);
  lines.push(`过渡方式：${pp.transitionStyle}`);

  // 语气约束
  const tp = fp.toneProfile;
  lines.push(`语气：${tp.primaryTone}，情感波动${tp.emotionalRange}/10`);
  lines.push(`视角：${tp.narratorPerspective}，时态：${tp.tensePreference}`);

  // 独特标记
  const sig = fp.signaturePatterns;
  if (sig.favoriteOpenings.length > 0) lines.push(`常用开头：${sig.favoriteOpenings.slice(0, 3).join("、")}`);
  if (sig.favoriteTransitions.length > 0) lines.push(`常用过渡：${sig.favoriteTransitions.slice(0, 3).join("、")}`);
  if (sig.favoriteEndings.length > 0) lines.push(`常用结尾：${sig.favoriteEndings.slice(0, 3).join("、")}`);
  if (sig.avoidPatterns.length > 0) lines.push(`避免使用：${sig.avoidPatterns.slice(0, 5).join("、")}`);

  return lines.join("\n");
}

// ============================================================
// 偏离检测
// ============================================================

export interface StyleDeviation {
  deviationScore: number; // 0-10，0 为完全一致
  deviations: Array<{
    dimension: string;
    expected: string;
    actual: string;
    severity: "warning" | "critical";
  }>;
}

/**
 * 检测生成文本与风格指纹的偏离度
 */
export function detectStyleDeviation(
  fp: StyleFingerprint,
  generatedContent: string
): StyleDeviation {
  const deviations: StyleDeviation["deviations"] = [];
  let totalPenalty = 0;

  // 1. 句式偏离
  const genSentencePatterns = analyzeSentencePatterns(generatedContent);
  const sp = fp.sentencePatterns;

  const avgLenDiff = Math.abs(genSentencePatterns.avgLength - sp.avgLength);
  if (avgLenDiff > 10) {
    deviations.push({
      dimension: "平均句长",
      expected: `${sp.avgLength}字`,
      actual: `${genSentencePatterns.avgLength}字`,
      severity: avgLenDiff > 20 ? "critical" : "warning",
    });
    totalPenalty += avgLenDiff > 20 ? 2 : 1;
  }

  const shortRatioDiff = Math.abs(genSentencePatterns.shortRatio - sp.shortRatio);
  if (shortRatioDiff > 0.2) {
    deviations.push({
      dimension: "短句比例",
      expected: `${(sp.shortRatio * 100).toFixed(0)}%`,
      actual: `${(genSentencePatterns.shortRatio * 100).toFixed(0)}%`,
      severity: shortRatioDiff > 0.3 ? "critical" : "warning",
    });
    totalPenalty += shortRatioDiff > 0.3 ? 2 : 1;
  }

  const dialogueRatioDiff = Math.abs(genSentencePatterns.dialogueRatio - sp.dialogueRatio);
  if (dialogueRatioDiff > 0.2) {
    deviations.push({
      dimension: "对话比例",
      expected: `${(sp.dialogueRatio * 100).toFixed(0)}%`,
      actual: `${(genSentencePatterns.dialogueRatio * 100).toFixed(0)}%`,
      severity: dialogueRatioDiff > 0.3 ? "critical" : "warning",
    });
    totalPenalty += dialogueRatioDiff > 0.3 ? 2 : 1;
  }

  // 2. 词汇偏离
  const genVocabProfile = analyzeVocabularyProfile(generatedContent);
  const vp = fp.vocabularyProfile;

  const uniqueWordDiff = Math.abs(genVocabProfile.uniqueWordRatio - vp.uniqueWordRatio);
  if (uniqueWordDiff > 0.15) {
    deviations.push({
      dimension: "词汇丰富度",
      expected: `${(vp.uniqueWordRatio * 100).toFixed(0)}%`,
      actual: `${(genVocabProfile.uniqueWordRatio * 100).toFixed(0)}%`,
      severity: uniqueWordDiff > 0.25 ? "critical" : "warning",
    });
    totalPenalty += uniqueWordDiff > 0.25 ? 2 : 1;
  }

  // 3. 段落偏离
  const genParagraphProfile = analyzeParagraphProfile(generatedContent);
  const pp = fp.paragraphProfile;

  const paraLenDiff = Math.abs(genParagraphProfile.avgParagraphLength - pp.avgParagraphLength);
  if (paraLenDiff > 50) {
    deviations.push({
      dimension: "段落长度",
      expected: `${pp.avgParagraphLength}字`,
      actual: `${genParagraphProfile.avgParagraphLength}字`,
      severity: paraLenDiff > 100 ? "critical" : "warning",
    });
    totalPenalty += paraLenDiff > 100 ? 2 : 1;
  }

  // 4. 语气偏离
  const genToneProfile = analyzeToneProfile(generatedContent);
  const tp = fp.toneProfile;

  if (genToneProfile.narratorPerspective !== tp.narratorPerspective) {
    deviations.push({
      dimension: "叙述视角",
      expected: tp.narratorPerspective,
      actual: genToneProfile.narratorPerspective,
      severity: "critical",
    });
    totalPenalty += 3;
  }

  if (genToneProfile.tensePreference !== tp.tensePreference) {
    deviations.push({
      dimension: "时态偏好",
      expected: tp.tensePreference,
      actual: genToneProfile.tensePreference,
      severity: "warning",
    });
    totalPenalty += 1;
  }

  const toneDiff = Math.abs(genToneProfile.emotionalRange - tp.emotionalRange);
  if (toneDiff > 3) {
    deviations.push({
      dimension: "情感波动",
      expected: `${tp.emotionalRange}/10`,
      actual: `${genToneProfile.emotionalRange}/10`,
      severity: toneDiff > 5 ? "critical" : "warning",
    });
    totalPenalty += toneDiff > 5 ? 2 : 1;
  }

  // 计算总偏离分（0-10）
  const deviationScore = Math.min(10, totalPenalty);

  return { deviationScore, deviations };
}

// ============================================================
// 工具函数
// ============================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
