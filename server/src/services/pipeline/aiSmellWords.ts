/**
 * 统一 AI 味词汇表
 * writingRules.ts（检测）和 StyleService.ts（替换）共用此单一来源
 */

// 单个词汇（正则检测 + 替换用）
export const AI_SMELL_WORDS = [
  // 原 writingRules.ts 词汇（已移除正常中文词汇：不禁、不由得、仿佛、缓缓、静静地、默默地、轻轻地）
  "宛如", "似乎在诉说", "一缕", "一抹", "一丝",
  "淡淡地", "娓娓道来", "令人叹为观止",
  "目光深邃", "嘴角微微上扬", "令人震撼", "无与伦比", "深刻地", "极大地",
  "宛如一幅画", "如同一首诗", "仿佛在诉说", "似乎在低语",
  // ===== 全书评审发现的高频AI模板（2026-06-23 第1-136章评审） =====
  "深吸一口气", "深吸一口阴气",
  "冷汗", "冷汗涔涔",
  "后背发凉", "后脊发凉",
  "心脏骤缩", "青筋暴起",
  "铁锈味", "空气凝固",
  // 原 StyleService.ts 过渡连接词（已移除正常连接词：于是、结果、导致、此外、不仅、而且、例如、比如）
  "最后", "综上所述", "由此可见",
  "值得注意的是", "需要指出的是", "毫无疑问", "显而易见",
  "事实上", "实际上", "换句话说", "也就是说", "具体来说",
  "一方面", "另一方面", "与此同时", "不仅如此", "更重要的是",
  "尽管如此",
  "除此之外",
  "譬如", "比方说",
  "总的来说", "总体而言", "概括来说",
  "不难发现", "需要强调", "毋庸置疑", "不可否认",
  // AI 模糊限定
  "从某种意义上说", "在某种程度上", "某种程度上",
  "可以说", "不妨说", "或许可以认为",
  // 公式化总结
  "总而言之", "归根结底", "一言以蔽之", "简而言之", "说到底", "本质上",
  // 冗余修饰
  "非常十分", "极其非常", "特别十分", "相当非常", "尤其特别",
  // AI 典型解释句式
  "这意味着", "这说明了", "这表明", "这反映了", "这体现了", "这揭示了",
  // 万能填充短语
  "在这个过程中", "在这种情况下", "在这种背景下", "在这样的环境中", "在这一点上",
];

// 短语模式（正则检测用）
export const AI_SMELL_PHRASES = [
  "他心想", "她暗想", "他感到一阵", "一股.+的感觉涌上心头",
  "他的眼神变得", "她的眼神变得", "他不禁", "她不禁",
  "令人感到", "让人感到", "一股莫名的", "一阵莫名的",
  "深深地", "重重地", "缓缓地", "静静地",
  // ===== 全书评审发现的高频AI模板（2026-06-23 第1-136章评审） =====
  "后背.*发凉", "后脊.*发凉", "后背.*凉", "后脊.*凉",
  "后背.*寒意", "后脊.*寒意",
  "心沉了下去", "心脏像是被.*攥紧", "心脏.*骤缩",
  "瞳孔.*缩", "瞳孔.*微缩", "瞳孔.*骤缩",
  "青筋.*暴起", "额角青筋.*跳动",
  "指节.*发白", "指节.*抠进",
  "后背.*冷汗", "冷汗.*冒出来",
  "空气.*凝固", "空气.*粘稠",
  "像针扎", "像.*针扎",
];

// ============================================================
// 散文风格检测词表（write-good 风格扩展）
// ============================================================

// 弱化词：削弱语气、使表达模糊的词语
export const WEAKENING_WORDS = [
  "非常", "真的", "极其", "十分", "相当", "比较", "有点", "稍微", "略微",
  "几乎", "差不多", "大约", "或许", "可能", "大概", "似乎", "好像", "仿佛", "貌似",
];

// 冗余模式：表达臃肿、可简化的短语
export const REDUNDANT_PATTERNS: Array<{ pattern: RegExp; suggestion: string }> = [
  { pattern: /他心里想/g, suggestion: "他想" },
  { pattern: /用眼睛看/g, suggestion: "看" },
  { pattern: /用手拿/g, suggestion: "拿" },
  { pattern: /开口说道/g, suggestion: "说" },
  { pattern: /心中暗想/g, suggestion: "暗想" },
  { pattern: /不禁不由得/g, suggestion: "不禁" },
  { pattern: /突然之间/g, suggestion: "突然" },
  { pattern: /立刻马上/g, suggestion: "立刻" },
  { pattern: /互相彼此/g, suggestion: "彼此" },
];

// 陈词滥调：中文小说中被滥用的成语/短语
export const CLICHE_PHRASES = [
  "不由自主", "恍然大悟", "心如刀割", "怒火中烧", "义愤填膺",
  "热泪盈眶", "泪流满面", "心乱如麻", "思绪万千", "百感交集",
  "魂飞魄散", "心惊胆战", "胆战心惊", "提心吊胆", "忐忑不安",
  "坐立不安", "心急如焚", "迫不及待", "急不可耐", "勃然大怒",
  "怒发冲冠", "咬牙切齿", "恨之入骨", "深恶痛绝", "痛不欲生",
  "生不如死", "死去活来", "昏天暗地", "天昏地暗", "飞沙走石",
  "惊天动地", "排山倒海", "翻天覆地", "天翻地覆",
];

// 替换规则（StyleService.removeAISmell 用）
export const AI_SMELL_REPLACEMENTS: [RegExp, string][] = [
  // 过渡连接词
  [/首先，?/g, ""],
  [/其次，?/g, ""],
  [/最后，?/g, ""],
  [/总之，?/g, ""],
  [/综上所述，?/g, ""],
  [/由此可见，?/g, ""],
  [/值得注意的是，?/g, ""],
  [/需要指出的是，?/g, ""],
  [/毫无疑问，?/g, ""],
  [/显而易见，?/g, ""],
  [/事实上，?/g, ""],
  [/实际上，?/g, ""],
  [/换句话说，?/g, ""],
  [/也就是说，?/g, ""],
  [/具体来说，?/g, ""],
  [/一方面，?/g, ""],
  [/另一方面，?/g, ""],
  [/与此同时，?/g, ""],
  [/不仅如此，?/g, ""],
  [/更重要的是，?/g, ""],
  [/因此，?/g, ""],
  [/所以，?/g, ""],
  [/于是，?/g, ""],
  [/此外，?/g, ""],
  [/另外，?/g, ""],
  [/除此之外，?/g, ""],
  [/总的来说，?/g, ""],
  [/总体而言，?/g, ""],
  [/概括来说，?/g, ""],
  [/从某种意义上说，?/g, ""],
  [/在某种程度上，?/g, ""],
  [/不难发现，?/g, ""],
  [/需要强调的是，?/g, ""],
  [/毋庸置疑，?/g, ""],
  [/不可否认，?/g, ""],
  [/尤其值得注意的是，?/g, ""],
  // AI 模糊限定语
  [/某种程度上，?/g, ""],
  [/可以说，?/g, ""],
  [/不妨说，?/g, ""],
  [/或许可以认为，?/g, ""],
  [/也许可以这样理解，?/g, ""],
  [/大致可以认为，?/g, ""],
  [/可以说的是，?/g, ""],
  [/在一定意义上，?/g, ""],
  [/从这个角度来看，?/g, ""],
  [/换一个角度来说，?/g, ""],
  // 公式化总结
  [/总而言之，?/g, ""],
  [/归根结底，?/g, ""],
  [/一言以蔽之，?/g, ""],
  [/简而言之，?/g, ""],
  [/说到底，?/g, ""],
  [/本质上，?/g, ""],
  [/归根到底，?/g, ""],
  [/概括而言，?/g, ""],
  [/总结一下，?/g, ""],
  [/综合来看，?/g, ""],
  // 冗余修饰语
  [/非常十分/g, "十分"],
  [/极其非常/g, "极其"],
  [/特别十分/g, "特别"],
  [/相当非常/g, "相当"],
  [/尤其特别/g, "尤其"],
  [/十分非常/g, "十分"],
  [/无比非常/g, "无比"],
  [/异常十分/g, "异常"],
  [/极为非常/g, "极为"],
  [/格外特别/g, "格外"],
  // AI 典型解释句式
  [/这意味着，?/g, ""],
  [/这说明了，?/g, ""],
  [/这表明，?/g, ""],
  [/这反映了，?/g, ""],
  [/这体现了，?/g, ""],
  [/这揭示了，?/g, ""],
  [/这暗示了，?/g, ""],
  [/这恰恰说明，?/g, ""],
  [/这充分表明，?/g, ""],
  [/这无疑表明，?/g, ""],
  // 万能填充短语
  [/在这个过程中，?/g, ""],
  [/在这种情况下，?/g, ""],
  [/在这种背景下，?/g, ""],
  [/在这样的环境中，?/g, ""],
  [/在这一点上，?/g, ""],
  [/在这样的情况下，?/g, ""],
  [/在这一过程中，?/g, ""],
  [/在这一背景下，?/g, ""],
  [/在这样的条件下，?/g, ""],
  [/在这个背景下，?/g, ""],
  // 不自然的对话标记（已移除丢失细微差别的替换：说道→说、回应道→说）
  [/感叹道：/g, "叹道："],
  [/询问道：/g, "问："],
];

// ============================================================
// 深度检测模块：句式 / 段落 / 结构
// ============================================================

export interface SentencePatternResult {
  score: number;          // 0-100, 越高越像 AI
  details: string[];
}

export interface ParagraphPatternResult {
  score: number;          // 0-100, 越高越像 AI
  details: string[];
}

export interface StructureResult {
  score: number;          // 0-100, 越高越像 AI
  details: string[];
}

/**
 * 句式模式检测
 * 检测 AI 常见的句式单一、模板化问题
 */
export function detectSentencePatterns(text: string): SentencePatternResult {
  const details: string[] = [];
  let score = 0;

  // 按中文句号/问号/感叹号/省略号分句
  const sentences = text
    .split(/(?<=[。！？…]+)/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length < 3) {
    return { score: 0, details: ["句子数过少，跳过检测"] };
  }

  // 1. 句长方差检测：AI 生成的文本句长往往非常均匀
  const lengths = sentences.map(s => s.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLen, 2), 0) / lengths.length;
  const cv = Math.sqrt(variance) / (avgLen || 1); // 变异系数

  if (cv < 0.25 && sentences.length > 10) {
    score += 20;
    details.push(`句长过于均匀（变异系数=${cv.toFixed(2)}），AI倾向生成长度接近的句子`);
  } else if (cv < 0.35 && sentences.length > 10) {
    score += 10;
    details.push(`句长变异偏低（变异系数=${cv.toFixed(2)}），句子长度变化不足`);
  }

  // 2. 句首模式重复：AI 经常用相同结构开头
  const startPatterns: Record<string, number> = {};
  for (const s of sentences) {
    // 提取前 2 个字符作为句首模式
    const start = s.slice(0, 2);
    if (start.length >= 2) {
      startPatterns[start] = (startPatterns[start] || 0) + 1;
    }
  }
  const totalSentences = sentences.length;
  const maxStartCount = Math.max(...Object.values(startPatterns));
  const dominantStartRatio = maxStartCount / totalSentences;

  if (dominantStartRatio > 0.2) {
    const dominant = Object.entries(startPatterns).find(([, v]) => v === maxStartCount)?.[0];
    score += 15;
    details.push(`句首"${dominant}"出现${maxStartCount}次（${(dominantStartRatio * 100).toFixed(0)}%），句式开头单一`);
  }

  // 3. "主语+动作"模板检测：AI 常用 "他/她 + 动词" 的平铺句式
  const subjectVerbPattern = /^(他|她|我|你|角色名|其)/;
  const svCount = sentences.filter(s => subjectVerbPattern.test(s)).length;
  const svRatio = svCount / totalSentences;
  if (svRatio > 0.5) {
    score += 15;
    details.push(`${(svRatio * 100).toFixed(0)}%的句子以"他/她/我"开头，句式缺乏变化`);
  }

  // 4. 感叹词/语气词堆积检测
  const exclamationPattern = /[！]{2,}/g;
  const exclamations = text.match(exclamationPattern);
  if (exclamations && exclamations.length > 3) {
    score += 10;
    details.push(`出现${exclamations.length}处连续感叹号，过度使用感叹表达情绪`);
  }

  // 5. 对话标记单一：只用"说"不用其他标记
  const dialogueMarks = text.match(/["""][^"""]*["""][，,]?(?:他|她|我|你)?(?:淡淡|冷冷|轻声|沉声|厉声)?(?:说道|道|说|问|答|喊|叫|笑|叹)/g) || [];
  const saidOnly = dialogueMarks.filter(m => /说道|说[，,。]/.test(m)).length;
  if (dialogueMarks.length > 3 && saidOnly / dialogueMarks.length > 0.7) {
    score += 10;
    details.push(`对话标记过度依赖"说"，${dialogueMarks.length}处对话中${saidOnly}处用"说"`);
  }

  // 6. "着/了/过" 助词堆积（AI 常过度使用时态助词）
  const zheLeGuo = text.match(/[了着过]/g)?.length || 0;
  const zheRatio = zheLeGuo / (text.length || 1);
  if (zheRatio > 0.08) {
    score += 10;
    details.push(`"了/着/过"助词密度偏高（${(zheRatio * 100).toFixed(1)}%），句式可能单调`);
  }

  return { score: Math.min(100, score), details };
}

/**
 * 段落模式检测
 * 检测 AI 常见的段落结构模板化问题
 */
export function detectParagraphPatterns(text: string): ParagraphPatternResult {
  const details: string[] = [];
  let score = 0;

  // 按换行分段
  const paragraphs = text
    .split(/\n\s*\n|\n/)
    .map(p => p.trim())
    .filter(p => p.length > 20); // 过滤过短段落

  if (paragraphs.length < 3) {
    return { score: 0, details: ["段落数过少，跳过检测"] };
  }

  // 1. 段长方差检测：AI 段落长度往往非常均匀
  const pLengths = paragraphs.map(p => p.length);
  const pAvgLen = pLengths.reduce((a, b) => a + b, 0) / pLengths.length;
  const pVariance = pLengths.reduce((sum, l) => sum + Math.pow(l - pAvgLen, 2), 0) / pLengths.length;
  const pCv = Math.sqrt(pVariance) / (pAvgLen || 1);

  if (pCv < 0.2 && paragraphs.length > 5) {
    score += 20;
    details.push(`段落长度过于均匀（变异系数=${pCv.toFixed(2)}），缺乏长短节奏变化`);
  } else if (pCv < 0.3 && paragraphs.length > 5) {
    score += 10;
    details.push(`段落长度变异偏低（变异系数=${pCv.toFixed(2)}），段落节奏单调`);
  }

  // 2. "环境描写→对话→内心活动" 三段式模板检测
  const envDialogueInner = paragraphs.filter(p => {
    const hasEnv = /[天月风云雨阳光暗影夜色]{1,}/.test(p) && /[屋楼街巷山河树花]{1,}/.test(p);
    const hasDialogue = /["""]/.test(p);
    const hasInner = /[心想觉感思]|内心/.test(p);
    return (hasEnv && !hasDialogue && !hasInner) || (!hasEnv && hasDialogue && !hasInner) || (!hasEnv && !hasDialogue && hasInner);
  });

  // 检测连续段落是否呈现 环境→对话→心理 的循环
  let cyclicCount = 0;
  for (let i = 0; i < paragraphs.length - 2; i++) {
    const p1 = paragraphs[i];
    const p2 = paragraphs[i + 1];
    const p3 = paragraphs[i + 2];
    const p1IsEnv = /[天月风云雨阳光暗影夜色屋楼街巷山河树花]/.test(p1) && !/["""]/.test(p1);
    const p2IsDialogue = /["""]/.test(p2);
    const p3IsInner = /[心想觉感思]|内心/.test(p3) && !/["""]/.test(p3);
    if (p1IsEnv && p2IsDialogue && p3IsInner) {
      cyclicCount++;
    }
  }
  if (cyclicCount >= 2) {
    score += 15;
    details.push(`检测到${cyclicCount}次"环境→对话→心理"循环模式，段落结构模板化`);
  }

  // 3. 段首连接词堆砌：每段都用连接词开头
  const connectorPattern = /^(于是|然而|但|不过|可是|因此|所以|结果|随即|紧接着|这时|此时|此刻|片刻后|过了一会儿|不久|很快|随后)/;
  const connectorCount = paragraphs.filter(p => connectorPattern.test(p)).length;
  const connectorRatio = connectorCount / paragraphs.length;
  if (connectorRatio > 0.4) {
    score += 15;
    details.push(`${(connectorRatio * 100).toFixed(0)}%的段落以连接词开头，段落衔接模板化`);
  }

  // 4. 段末总结句检测：AI 常在段末加一句总结/升华
  const summaryEndings = paragraphs.filter(p => {
    const lastSentence = p.split(/[。！？]/).filter(s => s.trim()).pop()?.trim() || "";
    return /^(这|那|他|她)(?:似乎|仿佛|好像|觉得|感到|明白|意识到|知道)/.test(lastSentence) ||
      /(?:意味|说明|表明|代表)(?:着|了)/.test(lastSentence) ||
      /(?:一般|一样|似的)$/.test(lastSentence);
  });
  if (summaryEndings.length >= 3) {
    score += 10;
    details.push(`${summaryEndings.length}个段落末尾有总结/升华句，AI倾向为每段加"收束语"`);
  }

  // 5. 感官五感堆砌：段落中连续出现多种感官描写
  const sensoryPattern = /(?:看到|听到|闻到|感到|感觉到|触到|尝到|目光|耳边|鼻尖|指尖|皮肤|味道|气味|声音|光影)/g;
  const sensoryMatches = text.match(sensoryPattern) || [];
  // 检查是否有三感以上在同一段
  const overSensory = paragraphs.filter(p => {
    const m = p.match(sensoryPattern);
    return m && m.length >= 3;
  });
  if (overSensory.length >= 2) {
    score += 10;
    details.push(`${overSensory.length}个段落出现3种以上感官描写堆砌，刻意"五感俱全"`);
  }

  return { score: Math.min(100, score), details };
}

/**
 * 整体结构检测
 * 检测 AI 常见的章节宏观结构模板化问题
 */
export function detectAIStructure(text: string): StructureResult {
  const details: string[] = [];
  let score = 0;

  const paragraphs = text
    .split(/\n\s*\n|\n/)
    .map(p => p.trim())
    .filter(p => p.length > 20);

  if (paragraphs.length < 5) {
    return { score: 0, details: ["段落数过少，跳过结构检测"] };
  }

  // 1. "起承转合"公式化检测：AI 常按固定比例分配篇幅
  const totalLen = paragraphs.reduce((sum, p) => sum + p.length, 0);
  const quarterLen = totalLen / 4;
  let cumulative = 0;
  const quarterEnds: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    cumulative += paragraphs[i].length;
    if (quarterEnds.length < 4 && cumulative >= quarterLen * (quarterEnds.length + 1)) {
      quarterEnds.push(i);
    }
  }

  // 检查每四分之一段的句式是否雷同（简单检查平均句长）
  if (quarterEnds.length === 4) {
    const quarters: string[][] = [[], [], [], []];
    let qi = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      if (qi < 3 && i > quarterEnds[qi]) qi++;
      quarters[qi].push(paragraphs[i]);
    }

    const qAvgLens = quarters.map(q => {
      const len = q.join("").length;
      return q.length > 0 ? len / q.length : 0;
    });

    const qMaxLen = Math.max(...qAvgLens);
    const qMinLen = Math.min(...qAvgLens);
    if (qMinLen > 0 && qMaxLen / qMinLen < 1.3) {
      score += 15;
      details.push(`章节四个部分的平均段落长度比值仅为${(qMaxLen / qMinLen).toFixed(1)}:1，篇幅分配过于均匀`);
    }
  }

  // 2. 节奏模式检测：是否"对话段→描写段→对话段→描写段"均匀交替
  let alternationCount = 0;
  let prevType: "dialogue" | "narration" | "" = "";
  for (const p of paragraphs) {
    const isDialogue = /["""]/.test(p) && p.match(/["""]/g)!.length >= 2;
    const type = isDialogue ? "dialogue" : "narration";
    if (prevType && type !== prevType) {
      alternationCount++;
    }
    prevType = type;
  }
  const altRatio = alternationCount / (paragraphs.length - 1);
  if (altRatio > 0.75 && paragraphs.length > 8) {
    score += 15;
    details.push(`对话与叙述交替率${(altRatio * 100).toFixed(0)}%，节奏过于规律，缺乏打破常规的段落`);
  }

  // 3. 情绪曲线平坦度检测：AI 经常全程保持相同情绪基调
  const emotionWords = {
    positive: /(?:笑|开心|高兴|欢喜|愉快|兴奋|激动|幸福|满意|安心|温暖|感动)/g,
    negative: /(?:哭|悲伤|难过|痛苦|愤怒|恐惧|害怕|紧张|焦虑|绝望|痛苦|寒意|冰冷)/g,
    neutral: /(?:平静|沉默|安静|淡淡|缓缓|默默)/g,
  };

  const paragraphEmotions = paragraphs.map(p => {
    const pos = (p.match(emotionWords.positive) || []).length;
    const neg = (p.match(emotionWords.negative) || []).length;
    const neu = (p.match(emotionWords.neutral) || []).length;
    if (pos > neg && pos > neu) return "positive";
    if (neg > pos && neg > neu) return "negative";
    return "neutral";
  });

  // 计算情绪变化次数
  let emotionChanges = 0;
  for (let i = 1; i < paragraphEmotions.length; i++) {
    if (paragraphEmotions[i] !== paragraphEmotions[i - 1]) emotionChanges++;
  }
  const emotionChangeRate = emotionChanges / (paragraphEmotions.length - 1);

  if (emotionChangeRate < 0.15 && paragraphs.length > 8) {
    score += 10;
    details.push(`情绪变化率仅${(emotionChangeRate * 100).toFixed(0)}%，整章情绪基调过于平坦`);
  }

  // 4. 章末钩子公式化：最后 3 段是否用了固定钩子模板
  const lastParagraphs = paragraphs.slice(-3).join("");
  const hookPatterns = [
    /[。…]$|他.*不知道|她.*不知道|目光.*落向|看向.*远方|转身.*离去|消失在|门.*推开|声音.*响起|突然.*响|背后.*传来|意味深长|意味不明|嘴角.*勾起|眼中.*闪过/,
  ];
  const hasFormulaicHook = hookPatterns.some(p => p.test(lastParagraphs));
  if (hasFormulaicHook) {
    score += 10;
    details.push(`章末使用了公式化钩子模板（如"意味深长""转身离去"等），建议用具体悬念替代`);
  }

  // 5. 对称结构检测：首尾段是否有明显的"呼应"模式（AI 常刻意首尾呼应）
  const firstPara = paragraphs[0];
  const lastPara = paragraphs[paragraphs.length - 1];
  const firstWords = new Set((firstPara.match(/[一-龥]{2,}/g) || []).slice(0, 20));
  const lastWords = new Set((lastPara.match(/[一-龥]{2,}/g) || []).slice(0, 20));
  let sharedCount = 0;
  for (const w of firstWords) {
    if (lastWords.has(w)) sharedCount++;
  }
  if (firstWords.size > 5 && sharedCount >= Math.min(5, firstWords.size * 0.5)) {
    score += 10;
    details.push(`首尾段共享${sharedCount}个关键词，可能存在刻意的"首尾呼应"模板`);
  }

  return { score: Math.min(100, score), details };
}

// ============================================================
// 可读性评分模块
// ============================================================

export interface ReadabilityResult {
  score: number;          // 0-10, 10为最佳
  details: {
    avgSentenceLength: number;    // 平均句长（字数）
    avgParagraphLength: number;   // 平均段落长度（字数）
    shortSentenceRatio: number;   // 短句比例（<10字）
    longSentenceRatio: number;    // 长句比例（>40字）
    vocabularyRichness: number;   // 词汇丰富度（不重复词/总词数）
    dialogueRatio: number;        // 对话比例
    descriptionRatio: number;     // 描写比例
  };
  issues: string[];
  suggestion: string;
}

/**
 * 中文可读性评分（0-10，10为最佳）
 * 检测维度：句长、段落、节奏、词汇丰富度、对话与描写比例
 */
export function scoreReadability(content: string): ReadabilityResult {
  const issues: string[] = [];
  let score = 10;

  // ---- 分句：按句号/问号/感叹号/分号/省略号/换行 ----
  const sentences = content
    .split(/[。！？；…\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // ---- 分段：按双换行或连续空行 ----
  const paragraphs = content
    .split(/\n\s*\n|\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (sentences.length === 0 || paragraphs.length === 0) {
    return {
      score: 0,
      details: { avgSentenceLength: 0, avgParagraphLength: 0, shortSentenceRatio: 0, longSentenceRatio: 0, vocabularyRichness: 0, dialogueRatio: 0, descriptionRatio: 0 },
      issues: ["内容为空或过短，无法评分"],
      suggestion: "请提供有效文本内容",
    };
  }

  // ---- 1. 平均句长 ----
  const sentenceLengths = sentences.map(s => s.replace(/\s/g, "").length);
  const avgSentenceLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;

  if (avgSentenceLength < 10) {
    score -= 1.5;
    issues.push(`平均句长仅${avgSentenceLength.toFixed(1)}字，过短导致碎片化`);
  } else if (avgSentenceLength < 15) {
    score -= 0.5;
    issues.push(`平均句长${avgSentenceLength.toFixed(1)}字，略低于理想区间(15-25)`);
  } else if (avgSentenceLength > 35) {
    score -= 1.5;
    issues.push(`平均句长达${avgSentenceLength.toFixed(1)}字，过长影响可读性`);
  } else if (avgSentenceLength > 25) {
    score -= 0.5;
    issues.push(`平均句长${avgSentenceLength.toFixed(1)}字，略高于理想区间(15-25)`);
  }

  // ---- 2. 段落长度 ----
  const paragraphLengths = paragraphs.map(p => p.replace(/\s/g, "").length);
  const avgParagraphLength = paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length;

  if (avgParagraphLength < 50) {
    score -= 1;
    issues.push(`平均段落${avgParagraphLength.toFixed(0)}字，过短缺乏展开`);
  } else if (avgParagraphLength > 500) {
    score -= 1;
    issues.push(`平均段落${avgParagraphLength.toFixed(0)}字，过长影响阅读节奏`);
  }

  // ---- 3. 短句比例 ----
  const shortCount = sentenceLengths.filter(l => l < 10).length;
  const shortSentenceRatio = shortCount / sentenceLengths.length;

  if (shortSentenceRatio > 0.4) {
    score -= 1;
    issues.push(`短句比例${(shortSentenceRatio * 100).toFixed(0)}%，碎片化严重`);
  } else if (shortSentenceRatio < 0.2 && sentenceLengths.length > 5) {
    score -= 0.5;
    issues.push(`短句比例仅${(shortSentenceRatio * 100).toFixed(0)}%，缺乏节奏变化`);
  }

  // ---- 4. 长句比例 ----
  const longCount = sentenceLengths.filter(l => l > 40).length;
  const longSentenceRatio = longCount / sentenceLengths.length;

  if (longSentenceRatio > 0.15) {
    score -= 1;
    issues.push(`长句比例${(longSentenceRatio * 100).toFixed(0)}%，影响可读性`);
  }

  // ---- 5. 词汇丰富度 ----
  const chineseWords = content.match(/[一-鿿]{2,4}/g) || [];
  const uniqueWords = new Set(chineseWords);
  const vocabularyRichness = chineseWords.length > 0 ? uniqueWords.size / chineseWords.length : 0;

  if (vocabularyRichness < 0.6 && chineseWords.length > 20) {
    score -= 1;
    issues.push(`词汇丰富度${vocabularyRichness.toFixed(2)}，词汇贫乏`);
  }

  // ---- 6. 对话比例 ----
  const dialogueChars = (content.match(/["""][\s\S]*?["""]/g) || [])
    .reduce((sum, d) => sum + d.length, 0);
  const totalChars = content.replace(/\s/g, "").length;
  const dialogueRatio = totalChars > 0 ? dialogueChars / totalChars : 0;

  if (dialogueRatio < 0.2 && totalChars > 500) {
    score -= 0.5;
    issues.push(`对话比例仅${(dialogueRatio * 100).toFixed(0)}%，缺乏互动感`);
  } else if (dialogueRatio > 0.4) {
    score -= 0.5;
    issues.push(`对话比例${(dialogueRatio * 100).toFixed(0)}%，描写不足`);
  }

  // ---- 7. 描写比例 ----
  const descriptionPatterns = /(?:看到|望着|目光|眼前|周围|面前|景色|景象|阳光|月光|风|雨|声音|气味|味道|触感|指尖|耳边|鼻尖|远处|近处|天空|地面|墙上|窗外|树|花|山|水|路|街|屋|楼|灯|影|色|光|暗|冷|热|静|喧)/g;
  const descriptionHits = (content.match(descriptionPatterns) || []).length;
  const descriptionRatio = totalChars > 0 ? descriptionHits / totalChars : 0;

  if (descriptionRatio < 0.005 && totalChars > 500) {
    score -= 0.5;
    issues.push(`描写比例过低，缺乏画面感`);
  }

  // 保底
  score = Math.max(0, Math.min(10, score));

  // 生成建议
  const suggestionParts: string[] = [];
  if (avgSentenceLength < 15) suggestionParts.push("适当增加句子长度，补充细节描写");
  if (avgSentenceLength > 25) suggestionParts.push("拆分长句，使用短句调节节奏");
  if (shortSentenceRatio > 0.4) suggestionParts.push("减少碎片化短句，合并相关语句");
  if (longSentenceRatio > 0.15) suggestionParts.push("将超长句拆分为多个短句");
  if (vocabularyRichness < 0.6) suggestionParts.push("丰富词汇表达，避免重复用词");
  if (dialogueRatio < 0.2) suggestionParts.push("增加角色对话，提升互动感");
  if (dialogueRatio > 0.4) suggestionParts.push("增加场景描写和内心活动");
  if (descriptionRatio < 0.005) suggestionParts.push("增加环境与感官描写，提升画面感");

  const suggestion = suggestionParts.length > 0
    ? suggestionParts.join("；")
    : "可读性良好，继续保持";

  return {
    score,
    details: {
      avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      avgParagraphLength: Math.round(avgParagraphLength),
      shortSentenceRatio: Math.round(shortSentenceRatio * 100) / 100,
      longSentenceRatio: Math.round(longSentenceRatio * 100) / 100,
      vocabularyRichness: Math.round(vocabularyRichness * 100) / 100,
      dialogueRatio: Math.round(dialogueRatio * 100) / 100,
      descriptionRatio: Math.round(descriptionRatio * 10000) / 10000,
    },
    issues,
    suggestion,
  };
}

// ============================================================
// 散文风格深度检测（write-good 风格扩展）
// ============================================================

export interface WeakeningWordsResult {
  count: number;
  ratio: number;   // 每1000字的弱化词数量
  words: string[];
}

export interface RedundantPatternsResult {
  count: number;
  matches: Array<{ original: string; suggestion: string; index: number }>;
}

export interface ClichePhrasesResult {
  count: number;
  phrases: string[];
}

export interface ProseStyleScore {
  score: number;                        // 0-10, 10为最佳
  details: Record<string, number>;      // 各维度分数
  issues: string[];                     // 具体问题描述
}

/**
 * 检测弱化词密度
 * 每1000字不超过5个弱化词为佳
 */
export function detectWeakeningWords(content: string): WeakeningWordsResult {
  const words: string[] = [];
  for (const word of WEAKENING_WORDS) {
    const regex = new RegExp(word, "g");
    const matches = content.match(regex);
    if (matches) {
      for (let i = 0; i < matches.length; i++) {
        words.push(word);
      }
    }
  }
  const charCount = content.length || 1;
  const ratio = (words.length / charCount) * 1000;
  return { count: words.length, ratio, words };
}

/**
 * 检测冗余表达
 * 返回匹配到的冗余短语及简化建议
 */
export function detectRedundantPatterns(content: string): RedundantPatternsResult {
  const matches: Array<{ original: string; suggestion: string; index: number }> = [];
  for (const { pattern, suggestion } of REDUNDANT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      matches.push({ original: m[0], suggestion, index: m.index });
    }
  }
  return { count: matches.length, matches };
}

/**
 * 检测陈词滥调
 * 返回命中的成语/短语列表
 */
export function detectClichePhrases(content: string): ClichePhrasesResult {
  const phrases: string[] = [];
  for (const phrase of CLICHE_PHRASES) {
    if (content.includes(phrase)) {
      phrases.push(phrase);
    }
  }
  return { count: phrases.length, phrases };
}

/**
 * 综合散文风格评分
 * 整合弱化词、冗余表达、陈词滥调三个维度
 * 返回 0-10 分（10 为最佳）
 *
 * 评分逻辑：
 *   - 基础分 10
 *   - 弱化词密度：每千字超过5个扣分，上限扣3分
 *   - 冗余表达：每个扣0.3分，上限扣3分
 *   - 陈词滥调：每个扣0.2分，上限扣4分
 */
export function scoreProseStyle(content: string): ProseStyleScore {
  const details: Record<string, number> = {};
  const issues: string[] = [];
  let score = 10;

  // 1. 弱化词
  const weakening = detectWeakeningWords(content);
  details.weakeningRatio = weakening.ratio;
  if (weakening.ratio > 5) {
    const penalty = Math.min(3, (weakening.ratio - 5) * 0.3);
    score -= penalty;
    issues.push(`弱化词密度偏高（每千字${weakening.ratio.toFixed(1)}个），削弱了语气力度`);
  }

  // 2. 冗余表达
  const redundant = detectRedundantPatterns(content);
  details.redundantCount = redundant.count;
  if (redundant.count > 0) {
    const penalty = Math.min(3, redundant.count * 0.3);
    score -= penalty;
    const samples = redundant.matches.slice(0, 3).map(m => `"${m.original}"→"${m.suggestion}"`);
    issues.push(`发现${redundant.count}处冗余表达，如${samples.join("、")}`);
  }

  // 3. 陈词滥调
  const cliche = detectClichePhrases(content);
  details.clicheCount = cliche.count;
  if (cliche.count > 0) {
    const penalty = Math.min(4, cliche.count * 0.2);
    score -= penalty;
    issues.push(`发现${cliche.count}处陈词滥调：${cliche.phrases.slice(0, 5).join("、")}`);
  }

  details.finalScore = Math.max(0, Math.round(score * 10) / 10);
  return { score: Math.max(0, Math.round(score * 10) / 10), details, issues };
}
