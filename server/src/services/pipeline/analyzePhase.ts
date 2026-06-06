import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { getRagRetrieveService } from "../RagRetrieveService";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";
import { generateOutline } from "./generators";

export async function executeAnalyzePhase(
  ctx: PhaseContext,
  jobId: string,
  novelId: string,
  config: PipelineConfig,
) {
  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) throw new Error("作品不存在");

  const sourceType = config.sourceType || "idea";
  let analysisInput: string;
  let outlineSourceTag: string;

  if (sourceType === "content") {
    // 续写模式：加载已有章节内容（最近 10 章，最多约 8000 字）
    const chapters = await prisma.chapter.findMany({
      where: { novelId, content: { not: "" } },
      orderBy: { order: "asc" },
    });

    if (chapters.length === 0) {
      throw new Error("没有已有章节内容，无法进行续写分析");
    }

    let chapterContent = "";
    const recentChapters = chapters.slice(-10);
    for (const ch of recentChapters) {
      if (ch.content?.trim()) {
        chapterContent += `\n\n--- 第${ch.order}章 ${ch.title || ""} ---\n${ch.content}`;
      }
    }
    if (chapterContent.length > 8000) {
      chapterContent = chapterContent.slice(0, 8000) + "\n...(内容截断)";
    }

    analysisInput = `【作品标题】${novel.title}\n${novel.genre ? `【类型】${novel.genre}\n` : ""}${novel.synopsis ? `【简介】${novel.synopsis}\n` : ""}\n【已有章节内容】${chapterContent}`;
    outlineSourceTag = "existing_chapters";
  } else {
    // 默认 idea 模式：使用灵感/创意素材
    analysisInput = novel.inspiration || "";
    outlineSourceTag = "inspiration";
  }

  // imitation 模式：注入拆书分析作为额外参考
  if (config.mode === "imitation" && config.bookAnalysisId) {
    const bookAnalysisContext = await ctx.buildBookAnalysisContext(novelId, config, jobId);
    if (bookAnalysisContext) {
      analysisInput += `\n\n${bookAnalysisContext}`;
    }
  }

  // 1. 分析输入包含哪些内容
  await ctx.updateJobProgress(jobId, "outline", "analyze");
  const analysis = await analyzeInput(ctx, analysisInput);
  await ctx.savePhaseResult(jobId, "outline", "analyze", { source: outlineSourceTag }, analysis);

  // 2. 拆解已有内容入库
  await ctx.updateJobProgress(jobId, "outline", "decompose");
  const decomposed = await decomposeIntoAssets(ctx, novelId, analysisInput, analysis, config);
  await ctx.savePhaseResult(jobId, "outline", "decompose", { source: outlineSourceTag, analysis }, decomposed);

  // 3. 生成大纲
  await ctx.updateJobProgress(jobId, "outline", "outline");
  const knowledgeQuery = sourceType === "content"
    ? `${novel.title} ${novel.genre || ""} 章节内容分析`
    : `${novel.title} ${analysisInput} ${config.genre || ""}`;
  const knowledgeContext = await getRagRetrieveService()?.retrieve(
    knowledgeQuery,
    { novelId, topK: 10 }
  ) ?? "";

  const outlineResult = sourceType === "content"
    ? await generateOutlineFromChapters(ctx, novelId, analysisInput, knowledgeContext, config)
    : await generateOutline(ctx, novelId, analysisInput, knowledgeContext, config);

  await ctx.savePhaseResult(jobId, "outline", "outline", { source: outlineSourceTag }, outlineResult);
  await ctx.saveToKnowledgeBase(novelId, 'outline', '故事大纲', outlineResult);
}

async function analyzeInput(ctx: PhaseContext, inspiration: string): Promise<{
  hasOutline: boolean;
  hasCharacters: boolean;
  hasWorldview: boolean;
  hasStyle: boolean;
  hasVolumes: boolean;
  summary: string;
  details: Record<string, string>;
}> {
  const system = `你是一位资深网文编辑，擅长分析创作素材的完整性。
你的任务是判断用户提供的素材中已经包含了哪些内容，以便后续流程只补充缺失部分，不重复生成已有内容。`;

  const prompt = `请分析以下创作素材，判断其中已包含哪些内容类型。

【创作素材】
${inspiration}

判断标准：
- hasOutline: 是否包含故事结构（开篇、发展、高潮、结局等情节安排）
- hasCharacters: 是否包含人物设定（至少一个角色有名字、身份、性格描述）
- hasWorldview: 是否包含世界观设定（世界规则、力量体系、势力分布、地理环境等）
- hasStyle: 是否包含风格描述（文风、语调、节奏、叙事视角等）
- hasVolumes: 是否包含卷结构或章节规划（明确的卷/章划分和内容安排）

请以JSON格式返回分析结果：
{
  "hasOutline": true/false,
  "hasCharacters": true/false,
  "hasWorldview": true/false,
  "hasStyle": true/false,
  "hasVolumes": true/false,
  "summary": "一句话总结素材的完整度，例如：素材包含详细的大纲和人物设定，但缺少世界观和风格描述",
  "details": {
    "outline": "简述素材中大纲内容的情况",
    "characters": "简述素材中人物设定的情况",
    "worldview": "简述素材中世界观的情况",
    "style": "简述素材中风格描述的情况",
    "volumes": "简述素材中卷结构的情况"
  }
}

注意：只有内容确实足够详细时才标记为 true。如果只是一笔带过或非常模糊，应标记为 false。`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 1000 });
  const parsed = parseLlmJson(result) || {};
  return {
    hasOutline: !!parsed.hasOutline,
    hasCharacters: !!parsed.hasCharacters,
    hasWorldview: !!parsed.hasWorldview,
    hasStyle: !!parsed.hasStyle,
    hasVolumes: !!parsed.hasVolumes,
    summary: parsed.summary || "分析完成",
    details: parsed.details || {},
  };
}

export async function decomposeIntoAssets(
  ctx: PhaseContext,
  novelId: string,
  inspiration: string,
  analysis: { hasOutline: boolean; hasCharacters: boolean; hasWorldview: boolean; hasStyle: boolean; hasVolumes: boolean },
  config: PipelineConfig,
): Promise<{
  decomposed: string[];
  skipped: string[];
}> {
  const decomposed: string[] = [];
  const skipped: string[] = [];

  // 拆解大纲
  if (analysis.hasOutline) {
    try {
      const outlineResult = await decomposeOutline(ctx, inspiration, config);
      if (outlineResult && Object.keys(outlineResult).length > 1) {
        await ctx.persistGeneratedAssets(novelId, "outline", outlineResult);
        await ctx.saveToKnowledgeBase(novelId, 'outline', '故事大纲', outlineResult);
        decomposed.push("大纲");
      } else {
        skipped.push("大纲（解析结果不完整）");
      }
    } catch (e) {
      console.warn("拆解大纲失败:", e);
      skipped.push("大纲（解析失败）");
    }
  } else {
    skipped.push("大纲（素材中未包含）");
  }

  // 拆解人物
  if (analysis.hasCharacters) {
    try {
      const charactersResult = await decomposeCharacters(ctx, inspiration);
      if (charactersResult?.characters?.length > 0) {
        await ctx.persistGeneratedAssets(novelId, "character", charactersResult);
        await ctx.saveToKnowledgeBase(novelId, 'character', '人物设定', charactersResult);
        decomposed.push(`人物（${charactersResult.characters.length}个）`);
      } else {
        skipped.push("人物（解析结果不完整）");
      }
    } catch (e) {
      console.warn("拆解人物失败:", e);
      skipped.push("人物（解析失败）");
    }
  } else {
    skipped.push("人物（素材中未包含）");
  }

  // 拆解世界观
  if (analysis.hasWorldview) {
    try {
      const worldviewResult = await decomposeWorldview(ctx, inspiration);
      if (worldviewResult && Object.keys(worldviewResult).length > 1) {
        await ctx.persistGeneratedAssets(novelId, "worldview", worldviewResult);
        await ctx.saveToKnowledgeBase(novelId, 'worldview', '世界观设定', worldviewResult);
        decomposed.push("世界观");
      } else {
        skipped.push("世界观（解析结果不完整）");
      }
    } catch (e) {
      console.warn("拆解世界观失败:", e);
      skipped.push("世界观（解析失败）");
    }
  } else {
    skipped.push("世界观（素材中未包含）");
  }

  // 拆解风格
  if (analysis.hasStyle) {
    try {
      const styleResult = await decomposeStyle(ctx, inspiration, config);
      if (styleResult && Object.keys(styleResult).length > 1) {
        await ctx.persistGeneratedAssets(novelId, "style", styleResult);
        await ctx.saveToKnowledgeBase(novelId, 'style', '写作风格', styleResult);
        decomposed.push("风格");
      } else {
        skipped.push("风格（解析结果不完整）");
      }
    } catch (e) {
      console.warn("拆解风格失败:", e);
      skipped.push("风格（解析失败）");
    }
  } else {
    skipped.push("风格（素材中未包含）");
  }

  // 拆解卷结构
  if (analysis.hasVolumes) {
    try {
      const volumesResult = await decomposeVolumes(ctx, inspiration);
      if (volumesResult?.volumes?.length > 0) {
        await ctx.persistGeneratedAssets(novelId, "volume", volumesResult);
        if (volumesResult.chapterOutlines) {
          await ctx.persistGeneratedAssets(novelId, "chapter_outline", volumesResult);
        }
        await ctx.saveToKnowledgeBase(novelId, 'volume', '卷纲规划', volumesResult);
        decomposed.push(`卷纲（${volumesResult.volumes.length}卷）`);
      } else {
        skipped.push("卷纲（解析结果不完整）");
      }
    } catch (e) {
      console.warn("拆解卷纲失败:", e);
      skipped.push("卷纲（解析失败）");
    }
  } else {
    skipped.push("卷纲（素材中未包含）");
  }

  return { decomposed, skipped };
}

async function decomposeOutline(ctx: PhaseContext, inspiration: string, config: PipelineConfig): Promise<any> {
  const system = `你是一位资深网文策划师。你的任务是将用户提供的创作素材整理为结构化大纲。
核心原则：最大程度保留原文内容和表达，只做结构化整理，不改写、不压缩、不丢失任何细节。

语言要求：保留原文的通俗白话表达，禁止替换成 AI 味的书面语。如果原文用了口语化的描述，保持原样。`;

  const prompt = `请将以下创作素材整理为结构化大纲JSON。

【创作素材】
${inspiration}

【类型】
${config.genre || "自动判断"}

要求：
1. 直接从素材中提取内容填入对应字段
2. 保留原文的生动表达，不要压缩成概括
3. 如果某个字段在素材中没有明确提到，用空字符串""表示

请输出JSON：
{
  "title": "从素材中提取标题",
  "genre": "从素材中提取类型",
  "theme": "核心主题",
  "hook": "开篇钩子",
  "coreSetting": "核心设定",
  "mainConflict": "主要冲突",
  "protagonist": { "name": "", "identity": "", "goal": "", "growth": "" },
  "antagonist": { "name": "", "identity": "", "motivation": "" },
  "plotStructure": { "beginning": "", "development": "", "climax": "", "resolution": "" },
  "highlights": "亮点",
  "targetAudience": "目标读者"
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 2000 });
  return parseLlmJson(result) || {};
}

async function decomposeCharacters(ctx: PhaseContext, inspiration: string): Promise<any> {
  const system = `你是一位资深网文人物设计师。你的任务是将用户创作素材中的人物设定提取为结构化数据。
核心原则：最大程度保留原文描述，只做结构化整理，不改写人物特色。`;

  const prompt = `请从以下创作素材中提取所有人物设定。

【创作素材】
${inspiration}

要求：
1. 提取素材中提到的所有人物
2. 保留原文的人物描述，不要改写
3. 如果某个字段在素材中没有提到，用空字符串""

请输出JSON：
{
  "characters": [
    {
      "name": "人物名",
      "role": "角色定位（主角/配角/反派等）",
      "identity": "身份描述",
      "motivation": "动机/目标",
      "appearance": "外貌特征",
      "background": "背景故事",
      "personality": "性格特点",
      "abilities": "能力/技能",
      "relationsText": "人物关系描述"
    }
  ]
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 2000 });
  return parseLlmJson(result) || {};
}

async function decomposeWorldview(ctx: PhaseContext, inspiration: string): Promise<any> {
  const system = `你是一位资深网文世界观架构师。你的任务是将用户创作素材中的世界观设定提取为结构化数据。
核心原则：最大程度保留原文描述，只做结构化整理，不改写独特设定。`;

  const prompt = `请从以下创作素材中提取世界观设定。

【创作素材】
${inspiration}

要求：
1. 直接从素材中提取世界观相关内容
2. 保留原文描述，不要改写
3. 如果某个字段在素材中没有提到，用空字符串""

请输出JSON：
{
  "name": "世界观名称",
  "summary": "世界概述",
  "rules": "世界规则",
  "geography": "地理环境",
  "factions": "势力分布",
  "history": "历史背景",
  "powerSystem": { "name": "", "levels": "", "rules": "" },
  "specialElements": "特殊元素"
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 1500 });
  return parseLlmJson(result) || {};
}

async function decomposeStyle(ctx: PhaseContext, inspiration: string, config: PipelineConfig): Promise<any> {
  const system = `你是一位资深网文风格顾问。你的任务是将用户创作素材中的风格描述提取为结构化数据。
核心原则：最大程度保留原文描述，特别是关于基调、氛围、反差、幽默、紧张感等具体风格要求。`;

  const prompt = `请从以下创作素材中提取写作风格设定。

【创作素材】
${inspiration}

要求：
1. 直接从素材中提取风格相关内容，保留原文描述
2. 特别注意提取：基调氛围、情绪节奏、反差设计、幽默方式、紧张感技巧、悬念技巧
3. 如果某个字段在素材中没有提到，用空字符串""

请输出JSON：
{
  "name": "风格名称",
  "description": "风格描述",
  "toneAndAtmosphere": "整体基调与氛围",
  "emotionalRhythm": "情绪节奏设计",
  "contrastPatterns": "反差设计",
  "humorStyle": "幽默方式",
  "tensionTechniques": "紧张感制造技巧",
  "suspenseTechniques": "悬念技巧",
  "narrativePov": "叙事视角",
  "tense": "时态",
  "pacing": "节奏",
  "sentenceRhythm": "句式节奏",
  "vocabularyLevel": "用词层级",
  "dialogueStyle": "对话风格",
  "chapterOpeningStyle": "开篇方式",
  "chapterEndingStyle": "收尾方式",
  "writingRules": ["写作规则1", "写作规则2"],
  "avoidList": ["避免的写法1", "避免的写法2"]
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 1500 });
  return parseLlmJson(result) || {};
}

async function decomposeVolumes(ctx: PhaseContext, inspiration: string): Promise<any> {
  const system = `你是一位资深网文结构师。你的任务是将用户创作素材中的卷结构和章节规划提取为结构化数据。
核心原则：最大程度保留原文描述。`;

  const prompt = `请从以下创作素材中提取卷结构和章节规划。

【创作素材】
${inspiration}

要求：
1. 直接从素材中提取卷和章节的安排
2. 保留原文描述
3. 如果素材中有明确的卷/章划分，完整提取

请输出JSON：
{
  "volumes": [
    {
      "title": "卷标题",
      "goal": "本卷目标",
      "conflict": "主要冲突",
      "emotion": "情绪基调",
      "newChars": ["新角色"],
      "mapName": "主要场景",
      "endHook": "结尾钩子"
    }
  ],
  "chapterOutlines": [
    {
      "volumeIndex": 0,
      "chapters": [
        {
          "title": "章节标题",
          "goal": "章节目标",
          "conflict": "冲突",
          "emotion": "情绪",
          "hook": "钩子"
        }
      ]
    }
  ]
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 3000 });
  return parseLlmJson(result) || {};
}

async function generateOutlineFromChapters(
  ctx: PhaseContext,
  novelId: string,
  chapterContent: string,
  knowledgeContext: string,
  config: PipelineConfig,
): Promise<any> {
  const system = `你是一位资深网文策划师。你的任务是从已有的章节内容中推断完整的故事弧线，并规划后续卷结构。
核心原则：基于已有内容推断故事走向，保留已有设定，补充缺失的宏观结构。

语言要求：使用通俗白话，禁止 AI 味词汇（不禁、不由得、宛如、仿佛、缓缓、淡淡地）。从已有章节中提取描述时保持原文风格，不要替换成书面腔。
质量要求：大纲必须足够详细支撑百万字长篇创作，plotStructure 每个阶段至少包含 3 个具体情节事件。`;

  const prompt = `以下是一部小说的已有章节内容。请从中推断完整的故事大纲，并规划后续卷结构。

${chapterContent}

${knowledgeContext ? `【参考资料】\n${knowledgeContext}\n` : ""}
【类型】${config.genre || "自动判断"}

要求：
1. 从已有内容中提取核心设定、人物关系、冲突线索
2. 推断故事的宏观走向（开篇→发展→高潮→结局）
3. 规划分卷结构（已有内容属于哪一卷，后续应有几卷）
4. 保留已有内容中的独特设定和伏笔

请输出JSON：
{
  "title": "作品标题",
  "genre": "类型",
  "theme": "核心主题",
  "hook": "开篇钩子",
  "coreSetting": "核心设定",
  "mainConflict": "主要冲突",
  "protagonist": { "name": "", "identity": "", "goal": "", "growth": "" },
  "antagonist": { "name": "", "identity": "", "motivation": "" },
  "plotStructure": { "beginning": "", "development": "", "climax": "", "resolution": "" },
  "highlights": "亮点",
  "targetAudience": "目标读者",
  "existingChaptersSummary": "已有章节内容摘要",
  "volumePlan": "分卷规划建议"
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 2000 });
  return parseLlmJson(result) || {};
}
