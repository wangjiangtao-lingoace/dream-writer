/**
 * 共享写作规则模块
 * Pipeline 模式和续写模式统一使用，确保规则一致性
 */

import { AI_SMELL_WORDS, AI_SMELL_PHRASES } from "./aiSmellWords";

// 15 条写作铁律（完整版）
export const WRITING_SYSTEM_PROMPT = `你是一位顶级中文网络小说作家，擅长写出让读者欲罢不能的故事。

你的写作铁律：
1. 禁止使用任何 AI 味词汇：不禁、不由得、宛如、仿佛、似乎在诉说、一缕、一抹、一丝、缓缓、淡淡地、静静地、默默地、轻轻地、娓娓道来、令人叹为观止、目光深邃、嘴角微微上扬
2. 禁止用「他心想」「她暗想」开头的大段内心独白，用行动和对话展现人物内心
3. 禁止用「突然」作为转折词，用具体的感官描写制造意外感
4. 禁止大段旁白式设定解释，设定融入对话和行动中自然展现
5. 对话必须像真人说话：有口头禅、有停顿、有未说完的话、有答非所问
6. 每个角色说话方式必须不同：粗人说粗话、文人引经据典、小孩用短句
7. 情节推进靠人物动机驱动，不是靠作者安排，每个人做事都要有理由
8. 描写具体化：不说「他很生气」，说「他攥紧拳头，咬肌鼓起，太阳穴突突跳」
9. 场景描写要有功能性：推动情节、揭示人物、制造氛围，三选一，否则删掉
10. 章末必须留钩子，让读者想看下一章

质量铁律：
11. 语言必须通俗白话，像真人作者写的小说，不要书面腔和翻译腔
12. 禁止水字数：不要无意义的环境渲染、不要重复表达同一个意思、不要为了凑字数而扩展描写
13. 每一段都必须有信息增量：推进情节、揭示人物、制造氛围，至少占一个，否则删掉
14. 描写必须符合当前场景和作品风格：都市文不要用古风用语，仙侠文不要用现代网络用语
15. 禁止万能句式：「他感到一阵xxx」「一股xxx的感觉涌上心头」「他的眼神变得xxx」
16. 必须使用第三人称视角写作（他/她/角色名），严禁使用第一人称（我/我们）
17. 禁止重复性身体反应模板：不要用"深吸一口气""冷汗""后背发凉""心脏骤缩""瞳孔一缩""青筋暴起""指节发白"来表现紧张/恐惧。这些已经被用烂了。用具体的、场景化的反应替代——比如角色手里的东西掉了、说话声音变了、某个习惯性小动作、或者干脆什么都不做让沉默本身制造张力`;

// Re-export from shared module for backward compatibility
export { AI_SMELL_WORDS, AI_SMELL_PHRASES } from "./aiSmellWords";

// 质量评分阈值
export const QUALITY_THRESHOLDS = {
  AI_SMELL_MAX_PERCENT: 1.0,      // AI 味词汇占比上限（%）
  WORD_COUNT_MIN_RATIO: 0.9,      // 字数下限比例（与生成 Prompt 90% 对齐）
  WORD_COUNT_MAX_RATIO: 1.5,      // 字数上限比例
  STYLE_MIN_SCORE: 6,             // 风格最低分
  INFO_DENSITY_MIN_SCORE: 6,      // 信息密度最低分
  CHARACTER_MIN_SCORE: 6,         // 角色一致性最低分
  EMOTION_MIN_SCORE: 5,           // 情绪匹配最低分
  MAX_RETRY_COUNT: 2,             // 最大重试次数
};

/**
 * 检测文本中的 AI 味词汇
 * 返回匹配的词汇列表和命中率
 */
export function detectAiSmell(text: string): {
  matches: string[];
  count: number;
  percentage: number;
} {
  const matches: string[] = [];
  let count = 0;

  // 检测单个词汇
  for (const word of AI_SMELL_WORDS) {
    const regex = new RegExp(word, "g");
    const found = text.match(regex);
    if (found) {
      matches.push(word);
      count += found.length;
    }
  }

  // 检测短语模式
  for (const phrase of AI_SMELL_PHRASES) {
    const regex = new RegExp(phrase, "g");
    const found = text.match(regex);
    if (found) {
      matches.push(phrase);
      count += found.length;
    }
  }

  const charCount = text.length;
  const percentage = charCount > 0 ? (count / charCount) * 100 : 0;

  return { matches, count, percentage };
}

/**
 * 检查字数是否合规
 */
export function checkWordCount(
  actualCount: number,
  targetCount: number,
): {
  compliant: boolean;
  ratio: number;
  message: string;
} {
  const ratio = actualCount / targetCount;
  const minRatio = QUALITY_THRESHOLDS.WORD_COUNT_MIN_RATIO;
  const maxRatio = QUALITY_THRESHOLDS.WORD_COUNT_MAX_RATIO;

  if (ratio < minRatio) {
    return {
      compliant: false,
      ratio,
      message: `字数不足：实际${actualCount}字，目标${targetCount}字（${Math.round(ratio * 100)}%）`,
    };
  }

  if (ratio > maxRatio) {
    return {
      compliant: false,
      ratio,
      message: `字数超标：实际${actualCount}字，目标${targetCount}字（${Math.round(ratio * 100)}%）`,
    };
  }

  return {
    compliant: true,
    ratio,
    message: `字数合规：${actualCount}字`,
  };
}
