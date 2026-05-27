import { prisma } from "../db/prisma";

// AI 味词汇表
const AI_SMELL_WORDS = [
  // 过渡连接词
  "首先", "其次", "最后", "总之", "综上所述", "由此可见",
  "值得注意的是", "需要指出的是", "毫无疑问", "显而易见",
  "事实上", "实际上", "换句话说", "也就是说", "具体来说",
  "一方面", "另一方面", "与此同时", "不仅如此", "更重要的是",
  "然而", "但是", "尽管如此", "虽然", "即使",
  "因此", "所以", "于是", "结果", "导致",
  "此外", "另外", "除此之外", "不仅", "而且",
  "例如", "比如", "譬如", "比方说",
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

  // 1. 替换 AI 味连接词
  const replacements: [RegExp, string][] = [
    // ── 过渡连接词（原始 31 条 + 补充 6 条）──
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
    [/不仅如此，?/g, ""],
    [/尤其值得注意的是，?/g, ""],

    // ── AI 模糊限定语（~10 条）──
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

    // ── 公式化总结（~10 条）──
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

    // ── 冗余修饰语（~10 条）──
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

    // ── AI 典型解释句式（~10 条）──
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

    // ── 万能填充短语（~10 条）──
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

    // ── 不自然的对话标记（~5 条）──
    [/说道：/g, "说："],
    [/回应道：/g, "说："],
    [/感叹道：/g, "叹道："],
    [/补充道：/g, "说："],
    [/询问道：/g, "问："],
  ];

  for (const [pattern, replacement] of replacements) {
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
