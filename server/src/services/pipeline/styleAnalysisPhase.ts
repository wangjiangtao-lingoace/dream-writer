import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";

/**
 * 风格分析阶段：从用户已有章节中提取写作风格，生成风格约束
 * 仅当有已有章节时运行，结果用于后续写作阶段的风格前置约束
 */
export async function executeStyleAnalysisPhase(
  ctx: PhaseContext,
  jobId: string,
  novelId: string,
  config: PipelineConfig,
) {
  await ctx.updateJobProgress(jobId, "style_analysis", "analyze");

  // 加载已有章节（最近 5 章，约 8000 字）
  const chapters = await prisma.chapter.findMany({
    where: { novelId, content: { not: "" } },
    orderBy: { order: "asc" },
  });

  if (chapters.length === 0) {
    // 无已有章节，跳过风格分析
    await ctx.savePhaseResult(jobId, "style_analysis", "analyze",
      { source: "skipped" }, { reason: "无已有章节" });
    return;
  }

  let chapterContent = "";
  const recentChapters = chapters.slice(-5);
  for (const ch of recentChapters) {
    if (ch.content?.trim()) {
      chapterContent += `\n\n--- 第${ch.order}章 ${ch.title || ""} ---\n${ch.content}`;
    }
  }
  if (chapterContent.length > 8000) {
    chapterContent = chapterContent.slice(0, 8000) + "\n...(内容截断)";
  }

  const system = `你是一位资深文学风格分析师。你的任务是从用户的实际写作中提取精确的风格特征，用于指导后续章节的生成。

分析维度：
1. 句式特征：平均句长、碎片句使用、节奏模式
2. 词汇水平：文学 vs 口语化程度、术语偏好
3. 对话模式：引号风格、对话归属方式、潜台词密度
4. 幽默风格：类型（讽刺/荒诞/冷幽默）、频率、表达方式
5. 节奏偏好：场景平均长度、转场风格、悬念模式
6. 段落结构：平均段落长度、单行段落使用频率
7. 叙事声音：与角色的距离、作者评论频率、比喻风格
8. 具体避免项：从原文中总结哪些写法是这个作者不会用的`;

  const prompt = `请分析以下章节内容的写作风格，提取精确的风格特征。

【章节内容】
${chapterContent}

请返回JSON：
{
  "styleName": "风格命名（如：幽默都市轻喜剧、硬核科幻纪实风等）",
  "styleDescription": "一段话概括这个作者的写作风格",

  "sentenceFeatures": {
    "avgLength": "平均句长描述（如：短句为主，平均15字）",
    "fragmentUsage": "碎片句使用情况",
    "rhythmPattern": "节奏模式描述"
  },

  "vocabulary": {
    "level": "词汇水平（口语化/半文学/文学化）",
    "preferences": "用词偏好描述",
    "specialTerms": "特殊用语习惯"
  },

  "dialogueStyle": {
    "quoteStyle": "引号风格",
    "attribution": "对话归属方式（如：少用'XX说'，多用动作穿插）",
    "subtextDensity": "潜台词密度（高/中/低）",
    "example": "一段对话示例（从原文摘取）"
  },

  "humorStyle": {
    "type": "幽默类型",
    "frequency": "频率",
    "expression": "表达方式描述",
    "example": "一段幽默示例（从原文摘取）"
  },

  "pacing": {
    "sceneLength": "场景平均长度偏好",
    "transitions": "转场风格",
    "suspensePattern": "悬念模式"
  },

  "paragraphStructure": {
    "avgLength": "平均段落长度",
    "singleLineUsage": "单行段落使用频率",
    "pattern": "段落结构模式"
  },

  "narrativeVoice": {
    "distance": "与角色的距离（紧贴/中等/全知）",
    "commentary": "作者评论频率",
    "metaphorStyle": "比喻风格"
  },

  "avoidList": ["这个作者绝对不会用的写法1", "写法2", "写法3"],

  "exampleParagraphs": [
    "从原文中摘取的风格示例段落1（100-200字，能代表这个作者的核心风格）",
    "示例段落2",
    "示例段落3"
  ],

  "styleDna": {
    "readerEmotion": ["读者在每个阶段应感受到的情绪，如：开局就笑、每章有反转感"],
    "payoffMechanisms": ["本书的核心爽点机制，如：身份反差、扮猪吃虎"],
    "rhythmRules": {
      "hookEvery": 500,
      "jokeEvery": 700,
      "payoffEvery": 1500
    },
    "languageRules": {
      "sentence": "短句为主/长短句结合",
      "dialogueRatio": 0.4,
      "narrationRatio": 0.6
    },
    "forbiddenPatterns": ["从原文分析出的绝对不会出现的写法"],
    "requiredPatterns": ["从原文分析出的必须遵守的写法模式"]
  }
}

注意：
- exampleParagraphs 必须是从原文中直接摘取的，不能改写
- avoidList 必须基于原文分析，不要列出通用的 AI 味词汇
- 每个维度的描述必须具体，不能用"适中""一般"等模糊词`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 4000 });
  const styleAnalysis = parseLlmJson(result) || {};

  // 保存为 PhaseResult
  await ctx.savePhaseResult(jobId, "style_analysis", "analyze",
    { chaptersAnalyzed: recentChapters.length, totalChars: chapterContent.length },
    styleAnalysis);

  // 更新或创建 StyleProfile
  const existingStyle = await prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } });
  const customRules = {
    ...(styleAnalysis.sentenceFeatures && { sentenceFeatures: styleAnalysis.sentenceFeatures }),
    ...(styleAnalysis.vocabulary && { vocabulary: styleAnalysis.vocabulary }),
    ...(styleAnalysis.dialogueStyle && { dialogueStyle: styleAnalysis.dialogueStyle }),
    ...(styleAnalysis.humorStyle && { humorStyle: styleAnalysis.humorStyle }),
    ...(styleAnalysis.pacing && { pacing: styleAnalysis.pacing }),
    ...(styleAnalysis.paragraphStructure && { paragraphStructure: styleAnalysis.paragraphStructure }),
    ...(styleAnalysis.narrativeVoice && { narrativeVoice: styleAnalysis.narrativeVoice }),
    ...(styleAnalysis.avoidList && { avoidList: styleAnalysis.avoidList }),
    ...(styleAnalysis.exampleParagraphs && { userStyleExamples: styleAnalysis.exampleParagraphs }),
  };

  if (existingStyle) {
    await prisma.styleProfile.update({
      where: { id: existingStyle.id },
      data: {
        name: styleAnalysis.styleName || existingStyle.name,
        description: styleAnalysis.styleDescription || existingStyle.description,
        customRules: JSON.stringify(customRules),
        styleDna: styleAnalysis.styleDna ? JSON.stringify(styleAnalysis.styleDna) : undefined,
      },
    });
  } else {
    await prisma.styleProfile.create({
      data: {
        novelId,
        name: styleAnalysis.styleName || "用户风格",
        description: styleAnalysis.styleDescription || "",
        isDefault: true,
        customRules: JSON.stringify(customRules),
        styleDna: styleAnalysis.styleDna ? JSON.stringify(styleAnalysis.styleDna) : null,
      },
    });
  }

  // 保存到知识库
  await ctx.saveToKnowledgeBase(novelId, 'style', '写作风格分析', styleAnalysis);
}
