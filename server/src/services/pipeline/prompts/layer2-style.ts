/**
 * 第二层：作品风格模板（动态）
 *
 * 从数据库 Novel + StyleProfile 动态生成。
 * 优先使用 styleDna 的可执行约束，回退到抽象风格维度。
 */

interface NovelInfo {
  title: string;
  genre?: string;
}

interface StyleInfo {
  name?: string;
  description?: string;
  subGenre?: string;
  targetReader?: string;
  references?: string;
  writingRules?: string[];
  avoidList?: string[];
  toneAndAtmosphere?: string;
  pacing?: string;
  chapterOpeningStyle?: string;
  chapterEndingStyle?: string;
  dialogueStyle?: string;
  humorStyle?: string;
  contrastPatterns?: string[];
  narrativePov?: string;
  tense?: string;
  sentenceLength?: string;
  vocabulary?: string;
  dialogueRatio?: string;
  emotionIntensity?: string;
  humorLevel?: string;
  masterWriterStyle?: string;
  styleDna?: string; // JSON string
}

interface StyleDna {
  readerEmotion?: string[];
  payoffMechanisms?: string[];
  rhythmRules?: {
    hookEvery?: number;
    jokeEvery?: number;
    payoffEvery?: number;
  };
  languageRules?: {
    sentence?: string;
    dialogueRatio?: number;
    narrationRatio?: number;
  };
  forbiddenPatterns?: string[];
  requiredPatterns?: string[];
  // v2.5 新增：本书固定口味
  fixedTaste?: {
    readerComeFor?: string[];      // 读者主要来看什么
    comedySource?: string[];       // 喜剧来源
    coreContradiction?: string[];  // 核心矛盾/反差
    signatureScenes?: string[];    // 标志性桥段
  };
  // v2.5 新增：节奏规则（每 N 章）
  chapterRhythm?: {
    payoffEveryN?: number;        // 每 N 章至少出现一次爽点闭环
    comedyEveryN?: number;        // 每 N 章至少出现一次喜剧桥段
    upgradeEveryN?: number;       // 每 N 章至少出现一次主线升级
  };
}

/**
 * 构建第二层：作品风格模板
 */
export function buildLayer2Style(novel: NovelInfo, style?: StyleInfo | null): string {
  if (!style) {
    return `【作品定位】
作品名称：${novel.title}
作品类型：${novel.genre || '未指定'}`;
  }

  // 尝试解析 styleDna
  let dna: StyleDna | null = null;
  if (style.styleDna) {
    try {
      dna = JSON.parse(style.styleDna);
    } catch { /* ignore */ }
  }

  // 如果有 styleDna，使用可执行约束模式
  if (dna && (dna.rhythmRules || dna.languageRules || dna.forbiddenPatterns?.length)) {
    return buildDnaStyle(novel, style, dna);
  }

  // 回退到传统抽象风格模式
  return buildAbstractStyle(novel, style);
}

/**
 * Style DNA 模式：可执行约束
 */
function buildDnaStyle(novel: NovelInfo, style: StyleInfo, dna: StyleDna): string {
  const parts: string[] = [];

  // 作品定位（精简）
  parts.push(`【作品定位】
作品名称：${novel.title}
作品类型：${novel.genre || '未指定'}
核心风格：${style.description || style.name || '未指定'}`);

  // 风格 DNA — 可执行约束
  const dnaLines: string[] = [];

  // 读者情绪节奏
  if (dna.readerEmotion?.length) {
    dnaLines.push(`读者情绪节奏：${dna.readerEmotion.join(' → ')}`);
  }

  // 核心爽点机制
  if (dna.payoffMechanisms?.length) {
    dnaLines.push(`核心爽点机制：${dna.payoffMechanisms.join('、')}`);
  }

  // 节奏控制规则
  if (dna.rhythmRules) {
    const rr = dna.rhythmRules;
    const rhythmParts: string[] = [];
    if (rr.hookEvery) rhythmParts.push(`每 ${rr.hookEvery} 字必须有一个钩子/悬念`);
    if (rr.jokeEvery) rhythmParts.push(`每 ${rr.jokeEvery} 字必须有一个笑点/轻松时刻`);
    if (rr.payoffEvery) rhythmParts.push(`每 ${rr.payoffEvery} 字必须有一个爽点/情绪释放`);
    if (rhythmParts.length) {
      dnaLines.push(`节奏控制：\n${rhythmParts.map(r => `- ${r}`).join('\n')}`);
    }
  }

  // 语言约束规则
  if (dna.languageRules) {
    const lr = dna.languageRules;
    const langParts: string[] = [];
    if (lr.sentence) langParts.push(lr.sentence);
    if (lr.dialogueRatio) langParts.push(`对话占比 ${Math.round(lr.dialogueRatio * 100)}%`);
    if (lr.narrationRatio) langParts.push(`叙述占比 ${Math.round(lr.narrationRatio * 100)}%`);
    if (langParts.length) {
      dnaLines.push(`语言约束：${langParts.join('，')}`);
    }
  }

  // 禁止写法模式
  if (dna.forbiddenPatterns?.length) {
    dnaLines.push(`禁止写法：\n${dna.forbiddenPatterns.map(p => `- ${p}`).join('\n')}`);
  }

  // 必须写法模式
  if (dna.requiredPatterns?.length) {
    dnaLines.push(`必须写法：\n${dna.requiredPatterns.map(p => `- ${p}`).join('\n')}`);
  }

  if (dnaLines.length > 0) {
    parts.push(`【风格 DNA — 必须严格遵守】\n${dnaLines.join('\n')}`);
  }

  // 本书固定口味（v2.5 新增）
  if (dna.fixedTaste) {
    const tasteLines: string[] = [];
    if (dna.fixedTaste.readerComeFor?.length) {
      tasteLines.push(`读者主要来看：\n${dna.fixedTaste.readerComeFor.map(r => `- ${r}`).join('\n')}`);
    }
    if (dna.fixedTaste.comedySource?.length) {
      tasteLines.push(`喜剧来源：\n${dna.fixedTaste.comedySource.map(c => `- ${c}`).join('\n')}`);
    }
    if (dna.fixedTaste.coreContradiction?.length) {
      tasteLines.push(`核心矛盾/反差：\n${dna.fixedTaste.coreContradiction.map(c => `- ${c}`).join('\n')}`);
    }
    if (dna.fixedTaste.signatureScenes?.length) {
      tasteLines.push(`标志性桥段：\n${dna.fixedTaste.signatureScenes.map(s => `- ${s}`).join('\n')}`);
    }
    if (tasteLines.length > 0) {
      parts.push(`【本书固定口味 — 长期锁定】\n${tasteLines.join('\n')}`);
    }
  }

  // 章节节奏规则（v2.5 新增）
  if (dna.chapterRhythm) {
    const rhythmLines: string[] = [];
    if (dna.chapterRhythm.payoffEveryN) rhythmLines.push(`每 ${dna.chapterRhythm.payoffEveryN} 章至少出现一次"阴间努力 → 阳间收益"的完整闭环`);
    if (dna.chapterRhythm.comedyEveryN) rhythmLines.push(`每 ${dna.chapterRhythm.comedyEveryN} 章至少出现一次喜剧桥段`);
    if (dna.chapterRhythm.upgradeEveryN) rhythmLines.push(`每 ${dna.chapterRhythm.upgradeEveryN} 章至少出现一次主线升级`);
    if (rhythmLines.length > 0) {
      parts.push(`【章节节奏规则】\n${rhythmLines.join('\n')}`);
    }
  }

  // 作家风格模仿（保留）
  if (style.masterWriterStyle) {
    parts.push(`【作家风格模仿】\n${style.masterWriterStyle}`);
  }

  // 补充传统维度中 DNA 未覆盖的关键项
  const supplementLines: string[] = [];
  if (style.chapterOpeningStyle) supplementLines.push(`开篇：${style.chapterOpeningStyle}`);
  if (style.chapterEndingStyle) supplementLines.push(`收尾：${style.chapterEndingStyle}`);
  if (style.dialogueStyle) supplementLines.push(`对话风格：${style.dialogueStyle}`);
  if (supplementLines.length > 0) {
    parts.push(`【补充约束】\n${supplementLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * 传统抽象风格模式（回退）
 */
function buildAbstractStyle(novel: NovelInfo, style: StyleInfo): string {
  const parts: string[] = [];

  // 作品定位
  parts.push(`【作品定位】
作品名称：${novel.title}
作品类型：${novel.genre || '未指定'}
${style.subGenre ? `子类型：${style.subGenre}` : ''}
${style.targetReader ? `目标读者：${style.targetReader}` : ''}
${style.references ? `参考作品：${style.references}` : ''}
核心风格：${style.description || style.name || '未指定'}`);

  // 风格维度
  const styleDims: string[] = [];
  if (style.toneAndAtmosphere) styleDims.push(`基调：${style.toneAndAtmosphere}`);
  if (style.pacing) styleDims.push(`节奏：${style.pacing}`);
  if (style.narrativePov) styleDims.push(`视角：${style.narrativePov}`);
  if (style.sentenceLength) styleDims.push(`句式：${style.sentenceLength}`);
  if (style.dialogueRatio) styleDims.push(`对话比例：${style.dialogueRatio}`);
  if (style.emotionIntensity) styleDims.push(`情感强度：${style.emotionIntensity}`);
  if (style.humorLevel && style.humorLevel !== 'none') styleDims.push(`幽默程度：${style.humorLevel}`);
  if (style.humorStyle) styleDims.push(`搞笑风格：${style.humorStyle}`);
  if (style.chapterOpeningStyle) styleDims.push(`开篇：${style.chapterOpeningStyle}`);
  if (style.chapterEndingStyle) styleDims.push(`收尾：${style.chapterEndingStyle}`);
  if (style.dialogueStyle) styleDims.push(`对话风格：${style.dialogueStyle}`);
  if (style.masterWriterStyle) styleDims.push(`作家风格模仿：${style.masterWriterStyle}`);

  if (styleDims.length > 0) {
    parts.push(`【风格维度】
${styleDims.join('\n')}`);
  }

  // 反差模式（喜剧核心）
  if (style.contrastPatterns && style.contrastPatterns.length > 0) {
    parts.push(`【反差/喜剧模式】
${style.contrastPatterns.map(c => `- ${c}`).join('\n')}`);
  }

  // 写作重点
  if (style.writingRules && style.writingRules.length > 0) {
    parts.push(`【写作重点】
${style.writingRules.map(r => `- ${r}`).join('\n')}`);
  }

  // 禁止内容
  if (style.avoidList && style.avoidList.length > 0) {
    parts.push(`【禁止内容】
${style.avoidList.map(a => `- ${a}`).join('\n')}`);
  }

  return parts.join('\n\n');
}
