import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { getRagIngestService } from "./RagIngestService";
import { getRagRetrieveService } from "./RagRetrieveService";

export interface PipelineConfig {
  volumeCount?: number;
  chaptersPerVolume?: number;
  targetWordCount?: number;
  genre?: string;
  style?: string;
  autoFix?: boolean;
  bookAnalysisId?: string;
  imitationPlanId?: string;
  autoContinue?: boolean;
  autoDraftChapters?: number;
  sourcePolicy?: "verified_only";
  overwriteExistingChapters?: boolean;
  mode?: "standalone" | "imitation";
  pipelineVersion?: number;
}

export interface PhaseResultData {
  phase: string;
  step: string;
  input: any;
  output: any;
  selfScore?: number;
  selfComment?: string;
  issues?: string[];
}

export class PipelineService {
  private llmService: LlmInvokeService;

  constructor() {
    this.llmService = new LlmInvokeService();
  }

  // 启动流程
  async startPipeline(novelId: string, config: PipelineConfig = {}) {
    // 检查是否已有流程
    const existing = await prisma.pipelineJob.findUnique({ where: { novelId } });
    if (existing && existing.status === "running") {
      throw new Error("该作品已有流程在运行中");
    }

    // 计算 totalSteps（standalone 模式使用新流程）
    const volumeCount = config.volumeCount || 5;
    const isStandalone = config.mode === "standalone" || !config.mode;
    const totalSteps = isStandalone
      ? 3 + 3 + (1 + volumeCount + 1) + 1 + 1  // outline(3) + assets(3) + planning(1+V+1) + consistency(1) + writing(1)
      : 20;

    // 添加 pipelineVersion 标记新流程
    const configWithVersion = { ...config, pipelineVersion: 2 };

    // 创建或更新流程任务
    const job = await prisma.pipelineJob.upsert({
      where: { novelId },
      create: {
        novelId,
        status: "running",
        currentPhase: "planning",
        currentStep: "outline",
        config: JSON.stringify(configWithVersion),
        totalSteps,
      },
      update: {
        status: "running",
        currentPhase: "planning",
        currentStep: "outline",
        config: JSON.stringify(configWithVersion),
        progress: 0,
        completedSteps: 0,
        lastError: null,
      },
    });

    // 异步执行流程
    this.executePipeline(job.id).catch(err => {
      console.error("Pipeline execution error:", err);
    });

    return job;
  }

  // 执行流程（异步）
  private async executePipeline(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;

    // standalone 模式：智能分析 → 拆解 → 生成
    if (config.mode === "standalone") {
      try {
        await this.executeAnalyzePhase(jobId, job.novelId, config);
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "paused", currentPhase: "outline", currentStep: "waiting_confirm" },
        });
      } catch (error: any) {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "error", lastError: error.message },
        });
      }
      return;
    }

    // imitation 模式：原有流程
    try {
      await this.executePlanningPhase(jobId, job.novelId, config);

      if (config.autoContinue) {
        await this.confirmPhaseResults(jobId, "planning");
        await this.executeStructuringPhase(jobId);
        return;
      }

      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "paused", currentPhase: "planning", currentStep: "waiting_confirm" },
      });

    } catch (error: any) {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "error", lastError: error.message },
      });
    }
  }

  // 执行规划阶段
  private async executePlanningPhase(jobId: string, novelId: string, config: PipelineConfig) {
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) throw new Error("作品不存在");

    // RAG 检索知识库
    const knowledgeContext = [
      await getRagRetrieveService()?.retrieve(
        `${novel.title} ${novel.inspiration || ""} ${config.genre || ""}`,
        { novelId, topK: 10 }
      ) ?? "",
      await this.buildWorkspaceAssetContext(novelId, jobId),
      await this.buildBookAnalysisContext(novelId, config, jobId),
      await this.buildImitationPlanContext(novelId, config, jobId),
    ].filter(Boolean).join("\n\n");

    // 1.1 生成大纲
    await this.updateJobProgress(jobId, "planning", "outline");
    const outlineResult = await this.generateOutline(novelId, novel.inspiration || "", knowledgeContext, config);
    await this.savePhaseResult(jobId, "planning", "outline", 
      { inspiration: novel.inspiration }, outlineResult);
    await this.saveToKnowledgeBase(novelId, 'outline', '故事大纲', outlineResult);

    // 1.2 生成世界观
    await this.updateJobProgress(jobId, "planning", "worldview");
    const worldviewResult = await this.generateWorldview(novelId, outlineResult, knowledgeContext);
    await this.savePhaseResult(jobId, "planning", "worldview",
      { outline: outlineResult }, worldviewResult);
    await this.saveToKnowledgeBase(novelId, 'worldview', '世界观设定', worldviewResult);

    // 1.3 生成人物
    await this.updateJobProgress(jobId, "planning", "characters");
    const charactersResult = await this.generateCharacters(novelId, outlineResult, worldviewResult, knowledgeContext);
    await this.savePhaseResult(jobId, "planning", "characters",
      { outline: outlineResult, worldview: worldviewResult }, charactersResult);
    await this.saveToKnowledgeBase(novelId, 'character', '人物设定', charactersResult);

    // 1.4 生成风格
    await this.updateJobProgress(jobId, "planning", "style");
    const styleResult = await this.generateStyle(novelId, outlineResult, config);
    await this.savePhaseResult(jobId, "planning", "style",
      { outline: outlineResult }, styleResult);
    await this.saveToKnowledgeBase(novelId, 'style', '写作风格', styleResult);
  }

  // === Standalone 模式：智能分析 → 拆解 → 生成 ===

  // Phase 1: 分析用户输入 → 拆解入库 → 生成缺失大纲
  private async executeAnalyzePhase(jobId: string, novelId: string, config: PipelineConfig) {
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) throw new Error("作品不存在");

    const inspiration = novel.inspiration || "";

    // 1. 分析用户输入包含哪些内容
    await this.updateJobProgress(jobId, "outline", "analyze");
    const analysis = await this.analyzeInput(inspiration);
    await this.savePhaseResult(jobId, "outline", "analyze", { inspiration }, analysis);

    // 2. 拆解已有内容入库
    await this.updateJobProgress(jobId, "outline", "decompose");
    const decomposed = await this.decomposeIntoAssets(novelId, inspiration, analysis, config);
    await this.savePhaseResult(jobId, "outline", "decompose", { inspiration, analysis }, decomposed);

    // 3. 生成大纲（增量补充模式）
    await this.updateJobProgress(jobId, "outline", "outline");
    const knowledgeContext = await getRagRetrieveService()?.retrieve(
      `${novel.title} ${inspiration} ${config.genre || ""}`,
      { novelId, topK: 10 }
    ) ?? "";
    const outlineResult = await this.generateOutline(novelId, inspiration, knowledgeContext, config);
    await this.savePhaseResult(jobId, "outline", "outline", { inspiration }, outlineResult);
    await this.saveToKnowledgeBase(novelId, 'outline', '故事大纲', outlineResult);
  }

  // 分析用户输入包含哪些内容类型
  private async analyzeInput(inspiration: string): Promise<{
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

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 1000 });
    const parsed = this.parseJson(result);
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

  // 将用户输入拆解为结构化资产并入库
  private async decomposeIntoAssets(
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
        const outlineResult = await this.decomposeOutline(inspiration, config);
        if (outlineResult && Object.keys(outlineResult).length > 1) {
          await this.persistGeneratedAssets(novelId, "outline", outlineResult);
          await this.saveToKnowledgeBase(novelId, 'outline', '故事大纲', outlineResult);
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
        const charactersResult = await this.decomposeCharacters(inspiration);
        if (charactersResult?.characters?.length > 0) {
          await this.persistGeneratedAssets(novelId, "character", charactersResult);
          await this.saveToKnowledgeBase(novelId, 'character', '人物设定', charactersResult);
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
        const worldviewResult = await this.decomposeWorldview(inspiration);
        if (worldviewResult && Object.keys(worldviewResult).length > 1) {
          await this.persistGeneratedAssets(novelId, "worldview", worldviewResult);
          await this.saveToKnowledgeBase(novelId, 'worldview', '世界观设定', worldviewResult);
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
        const styleResult = await this.decomposeStyle(inspiration, config);
        if (styleResult && Object.keys(styleResult).length > 1) {
          await this.persistGeneratedAssets(novelId, "style", styleResult);
          await this.saveToKnowledgeBase(novelId, 'style', '写作风格', styleResult);
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
        const volumesResult = await this.decomposeVolumes(inspiration);
        if (volumesResult?.volumes?.length > 0) {
          await this.persistGeneratedAssets(novelId, "volume", volumesResult);
          // 同时拆解章纲
          if (volumesResult.chapterOutlines) {
            await this.persistGeneratedAssets(novelId, "chapter_outline", volumesResult);
          }
          await this.saveToKnowledgeBase(novelId, 'volume', '卷纲规划', volumesResult);
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

  // 拆解大纲
  private async decomposeOutline(inspiration: string, config: PipelineConfig): Promise<any> {
    const system = `你是一位资深网文策划师。你的任务是将用户提供的创作素材整理为结构化大纲。
核心原则：最大程度保留原文内容和表达，只做结构化整理，不改写、不压缩、不丢失任何细节。`;

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

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 2000 });
    return this.parseJson(result);
  }

  // 拆解人物
  private async decomposeCharacters(inspiration: string): Promise<any> {
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

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 2000 });
    return this.parseJson(result);
  }

  // 拆解世界观
  private async decomposeWorldview(inspiration: string): Promise<any> {
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

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 1500 });
    return this.parseJson(result);
  }

  // 拆解风格
  private async decomposeStyle(inspiration: string, config: PipelineConfig): Promise<any> {
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

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 1500 });
    return this.parseJson(result);
  }

  // 拆解卷结构
  private async decomposeVolumes(inspiration: string): Promise<any> {
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

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 3000 });
    return this.parseJson(result);
  }

  // Phase 2: 生成资产（世界观/人物/风格）→ 暂停审核
  private async executeAssetsPhase(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;
    const novelId = job.novelId;
    const outlineResult = await this.getPhaseOutput(jobId, "outline", "outline");

    const knowledgeContext = await getRagRetrieveService()?.retrieve(
      `${job.novel.title} ${job.novel.inspiration || ""} ${config.genre || ""}`,
      { novelId, topK: 10 }
    ) ?? "";

    const [existingWorldview, existingCharacters, existingStyle] = await Promise.all([
      prisma.worldview.findFirst({ where: { novelId } }),
      prisma.character.findMany({ where: { novelId }, take: 1 }),
      prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } }),
    ]);

    // 世界观
    if (existingWorldview) {
      await this.updateJobProgress(jobId, "assets", "worldview");
      await this.savePhaseResult(jobId, "assets", "worldview",
        { outline: outlineResult, source: "decomposed" }, {
          name: existingWorldview.name, summary: existingWorldview.summary,
          rules: existingWorldview.rules, geography: existingWorldview.geography,
          factions: existingWorldview.factions, history: existingWorldview.history,
          powerSystem: existingWorldview.powerSystem,
        });
    } else {
      await this.updateJobProgress(jobId, "assets", "worldview");
      const worldviewResult = await this.generateWorldview(novelId, outlineResult, knowledgeContext);
      await this.savePhaseResult(jobId, "assets", "worldview", { outline: outlineResult }, worldviewResult);
      await this.saveToKnowledgeBase(novelId, 'worldview', '世界观设定', worldviewResult);
    }

    // 人物
    if (existingCharacters.length > 0) {
      await this.updateJobProgress(jobId, "assets", "characters");
      const allChars = await prisma.character.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" } });
      await this.savePhaseResult(jobId, "assets", "characters",
        { outline: outlineResult, source: "decomposed" }, {
          characters: allChars.map(c => ({
            name: c.name, role: c.role, identity: c.identity, motivation: c.motivation,
            appearance: c.appearance, background: c.background, personality: c.arcSummary,
            abilities: "", relationsText: c.relationsText,
          })),
        });
    } else {
      await this.updateJobProgress(jobId, "assets", "characters");
      const charactersResult = await this.generateCharacters(novelId, outlineResult,
        await this.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})), knowledgeContext);
      await this.savePhaseResult(jobId, "assets", "characters",
        { outline: outlineResult }, charactersResult);
      await this.saveToKnowledgeBase(novelId, 'character', '人物设定', charactersResult);
    }

    // 风格
    if (existingStyle) {
      await this.updateJobProgress(jobId, "assets", "style");
      const enhancedStyle = this.safeJson(existingStyle.customRules, {});
      await this.savePhaseResult(jobId, "assets", "style",
        { outline: outlineResult, source: "decomposed" }, {
          name: existingStyle.name, description: existingStyle.description,
          narrativePov: existingStyle.narrativePov, tense: existingStyle.tense,
          pacing: existingStyle.pacing, ...enhancedStyle,
        });
    } else {
      await this.updateJobProgress(jobId, "assets", "style");
      const styleResult = await this.generateStyle(novelId, outlineResult, config);
      await this.savePhaseResult(jobId, "assets", "style", { outline: outlineResult }, styleResult);
      await this.saveToKnowledgeBase(novelId, 'style', '写作风格', styleResult);
    }

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused", currentPhase: "assets", currentStep: "waiting_confirm" },
    });
  }

  // ========== 新增：全量规划先行架构 ==========

  /**
   * 完整规划阶段（standalone 模式）：卷纲 → 逐卷章纲 → 跨卷弧线 → 暂停
   */
  private async executePlanningPhase_standalone(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;
    const novelId = job.novelId;

    try {
      // 加载前置阶段结果
      const outlineResult = await this.getPhaseOutput(jobId, "outline", "outline");
      const [worldviewResult, charactersResult, styleResult] = await Promise.all([
        this.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
        this.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
        this.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
      ]);

      // Step 1: 生成卷纲
      await this.updateJobProgress(jobId, "planning", "volume_outline");
      let volumeResult: any;
      const existingVolumes = await prisma.volume.findMany({ where: { novelId }, take: 1 });
      if (existingVolumes.length > 0) {
        // 数据库中已有卷纲，直接读取
        const allVolumes = await prisma.volume.findMany({
          where: { novelId }, orderBy: { sortOrder: "asc" },
        });
        volumeResult = {
          volumes: allVolumes.map(v => ({
            title: v.title, goal: v.goal, conflict: v.conflict,
            emotion: v.emotion, newChars: this.safeJson(v.newChars, []),
            mapName: v.mapName, endHook: v.endHook,
            keyEvents: this.safeJson(v.keyEvents, []),
            turningPoint: v.turningPoint || "",
            climax: v.climax || "",
          })),
        };
      } else {
        // 调用 LLM 生成卷纲，传入创意信息
        const inspiration = job.novel?.inspiration || "";
        volumeResult = await this.generateVolumeOutline(
          novelId, outlineResult, worldviewResult, charactersResult, styleResult, config, inspiration,
        );
        await this.persistGeneratedAssets(novelId, "volume", volumeResult);
      }
      await this.savePhaseResult(jobId, "planning", "volume_outline",
        { outline: outlineResult, inspiration: job.novel?.inspiration }, volumeResult);

      // 暂停等用户确认卷纲（不自动继续生成章纲）
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "paused", currentPhase: "planning", currentStep: "waiting_confirm" },
      });
    } catch (error: any) {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "error", lastError: error.message },
      });
    }
  }

  /**
   * 生成所有卷的章纲（用户确认卷纲后调用）
   */
  private async executeChapterOutlinesPhase(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;
    const novelId = job.novelId;
    const volumeCount = config.volumeCount || 5;
    const chaptersPerVolume = config.chaptersPerVolume || 30;

    try {
      // 加载前置阶段结果
      const outlineResult = await this.getPhaseOutput(jobId, "outline", "outline");
      const volumeResult = await this.getPhaseOutput(jobId, "planning", "volume_outline");
      const [worldviewResult, charactersResult, styleResult] = await Promise.all([
        this.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
        this.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
        this.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
      ]);

      // 逐卷生成富化章纲
      const allChapterOutlines: any = { chapterOutlines: [] };
      for (let volIdx = 0; volIdx < volumeCount; volIdx++) {
        const stepName = `chapter_outline_vol_${volIdx + 1}`;
        await this.updateJobProgress(jobId, "planning", stepName);

        // 构建前序卷摘要
        const previousSummary = this.buildPreviousVolumeSummary(allChapterOutlines, volIdx);

        const enrichedChapters = await this.generateEnrichedChapterOutlines(
          novelId, volumeResult, volIdx, outlineResult, worldviewResult,
          charactersResult, styleResult, previousSummary, config,
        );

        const chapters = enrichedChapters?.chapters || [];
        await this.persistVolumeChapterData(novelId, volIdx, chapters, volumeResult);

        allChapterOutlines.chapterOutlines.push({
          volumeIndex: volIdx,
          chapters,
        });

        await this.savePhaseResult(jobId, "planning", stepName,
          { volume: volumeResult.volumes?.[volIdx], previousSummary, chaptersPerVolume },
          enrichedChapters);
      }

      // 生成跨卷故事弧线
      await this.updateJobProgress(jobId, "planning", "story_arcs");
      const storyArcs = await this.generateStoryArcs(
        novelId, outlineResult, allChapterOutlines, volumeResult,
        worldviewResult, charactersResult, styleResult, config,
      );
      await this.persistStoryArcs(novelId, storyArcs);
      await this.savePhaseResult(jobId, "planning", "story_arcs",
        { outline: outlineResult, totalChapters: volumeCount * chaptersPerVolume },
        storyArcs);

      // 暂停等用户确认
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "paused", currentPhase: "planning", currentStep: "waiting_confirm" },
      });
    } catch (error: any) {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "error", lastError: error.message },
      });
    }
  }

  /**
   * 构建前序卷章纲摘要（仅 title+goal+hook，控制 token 量）
   */
  private buildPreviousVolumeSummary(allChapterOutlines: any, currentVolIdx: number): string {
    if (currentVolIdx === 0) return "";
    const summaryParts: string[] = [];
    for (let i = 0; i < currentVolIdx; i++) {
      const group = allChapterOutlines.chapterOutlines[i];
      if (!group) continue;
      const volTitle = `第${i + 1}卷`;
      const chapterLines = (group.chapters || []).map((ch: any, idx: number) =>
        `  第${idx + 1}章 ${ch.title}：${ch.goal || ""} | 钩子：${ch.hook || "无"}`
      ).join("\n");
      summaryParts.push(`【${volTitle}】\n${chapterLines}`);
    }
    return summaryParts.join("\n\n");
  }

  /**
   * 一致性校验阶段：检查完整规划的一致性 → 暂停
   */
  private async executeConsistencyCheckPhase(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    try {
      const novelId = job.novelId;

      // 加载所有规划数据
      const [chapterOutlines, hooks, foreshadows, mainlines, pleasurePoints, emotionCurves] = await Promise.all([
        prisma.chapterOutline.findMany({ where: { novelId }, orderBy: { sortOrder: "asc" } }),
        prisma.hook.findMany({ where: { novelId }, orderBy: { plannedChapter: "asc" } }),
        prisma.foreshadow.findMany({ where: { novelId }, orderBy: { plantChapter: "asc" } }),
        prisma.mainline.findMany({ where: { novelId }, orderBy: { sortOrder: "asc" } }),
        prisma.pleasurePoint.findMany({ where: { novelId }, orderBy: { chapterOrder: "asc" } }),
        prisma.emotionCurve.findMany({ where: { novelId }, orderBy: { chapterOrder: "asc" } }),
      ]);

      // 构建规划摘要
      const planSummary = this.buildPlanSummaryForConsistency(
        chapterOutlines, hooks, foreshadows, mainlines, pleasurePoints, emotionCurves,
      );

      await this.updateJobProgress(jobId, "consistency_check", "consistency");
      const result = await this.generateConsistencyCheck(novelId, planSummary);
      await this.savePhaseResult(jobId, "consistency_check", "consistency",
        { planSummaryLength: planSummary.length }, result);

      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "paused", currentPhase: "consistency_check", currentStep: "waiting_confirm" },
      });
    } catch (error: any) {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "error", lastError: error.message },
      });
    }
  }

  /**
   * 构建一致性校验所需的规划摘要
   */
  private buildPlanSummaryForConsistency(
    chapterOutlines: any[], hooks: any[], foreshadows: any[],
    mainlines: any[], pleasurePoints: any[], emotionCurves: any[],
  ): string {
    const parts: string[] = [];

    // 章纲摘要
    parts.push("## 章纲规划");
    for (const ch of chapterOutlines) {
      parts.push(`第${ch.sortOrder}章 [${ch.title}]：目标=${ch.goal || "无"} | 冲突=${ch.conflict || "无"} | 情绪=${ch.emotion || "无"} | 钩子=${ch.hook || "无"}`);
    }

    // 钩子状态
    parts.push("\n## 钩子状态");
    for (const h of hooks) {
      parts.push(`[${h.status}] ${h.title}（类型:${h.type}，强度:${h.intensity}）：埋设于第${h.plannedChapter || "?"}章，计划回收于第${h.resolvedChapter || "?"}章`);
    }

    // 伏笔状态
    parts.push("\n## 伏笔状态");
    for (const f of foreshadows) {
      parts.push(`[${f.status}] ${f.title}：埋设于第${f.plantChapter}章，计划回收于第${f.payoffChapter || "?"}章`);
    }

    // 主线
    parts.push("\n## 主线规划");
    for (const m of mainlines) {
      const milestones = this.safeJson(m.milestones, []);
      const milestoneStr = milestones.map((ms: any) => `第${ms.chapter}章:${ms.event}`).join("、");
      parts.push(`[${m.type}] ${m.title}：第${m.startChapter || "?"}章→第${m.endChapter || "?"}章 | 里程碑：${milestoneStr || "无"} | 结局：${m.resolution || "未定"}`);
    }

    // 爽点分布
    parts.push("\n## 爽点分布");
    for (const pp of pleasurePoints) {
      parts.push(`第${pp.chapterOrder}章 [${pp.type}] 强度${pp.intensity}：${pp.description || ""}`);
    }

    // 情绪曲线
    parts.push("\n## 情绪曲线");
    const climaxChapters = emotionCurves.filter(e => e.isClimax).map(e => e.chapterOrder);
    const turningPoints = emotionCurves.filter(e => e.isTurningPoint).map(e => e.chapterOrder);
    const breathingChapters = emotionCurves.filter(e => e.isBreathing).map(e => e.chapterOrder);
    parts.push(`高潮章节：${climaxChapters.join(",") || "无"}`);
    parts.push(`转折点：${turningPoints.join(",") || "无"}`);
    parts.push(`呼吸章节：${breathingChapters.join(",") || "无"}`);
    for (const ec of emotionCurves) {
      parts.push(`第${ec.chapterOrder}章：${ec.emotionType}（强度${ec.intensity}）`);
    }

    return parts.join("\n");
  }

  // ========== Legacy 方法（保留用于向后兼容） ==========

  // Phase 3: 生成卷纲 → 暂停审核 (legacy, pipelineVersion < 2)
  private async executeVolumesPhase(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;
    const novelId = job.novelId;
    const outlineResult = await this.getPhaseOutput(jobId, "outline", "outline");
    const [worldviewResult, charactersResult, styleResult] = await Promise.all([
      this.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
      this.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
      this.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
    ]);

    const existingVolumes = await prisma.volume.findMany({ where: { novelId }, take: 1 });

    if (existingVolumes.length > 0) {
      await this.updateJobProgress(jobId, "volumes", "volume");
      const allVolumes = await prisma.volume.findMany({
        where: { novelId }, orderBy: { sortOrder: "asc" },
        include: { chapterOutlines: { orderBy: { sortOrder: "asc" } } },
      });
      await this.savePhaseResult(jobId, "volumes", "volume",
        { outline: outlineResult, source: "decomposed" }, {
          volumes: allVolumes.map(v => ({
            title: v.title, goal: v.goal, conflict: v.conflict,
            emotion: v.emotion, newChars: v.newChars, mapName: v.mapName, endHook: v.endHook,
          })),
        });
    } else {
      await this.updateJobProgress(jobId, "volumes", "volume");
      const volumeResult = await this.generateVolumeOutline(novelId, outlineResult, worldviewResult, charactersResult, styleResult, config);
      await this.savePhaseResult(jobId, "volumes", "volume", { outline: outlineResult }, volumeResult);
      await this.saveToKnowledgeBase(novelId, 'volume', '卷纲规划', volumeResult);
    }

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused", currentPhase: "volumes", currentStep: "waiting_confirm" },
    });
  }

  // Phase 4: 生成章纲 + 主线钩子 → 暂停审核
  private async executeChapterOutlinePhase(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;
    const novelId = job.novelId;
    const outlineResult = await this.getPhaseOutput(jobId, "outline", "outline");
    const [worldviewResult, charactersResult, styleResult, volumeResult] = await Promise.all([
      this.getPhaseOutput(jobId, "assets", "worldview").catch(() => ({})),
      this.getPhaseOutput(jobId, "assets", "characters").catch(() => ({})),
      this.getPhaseOutput(jobId, "assets", "style").catch(() => ({})),
      this.getPhaseOutput(jobId, "volumes", "volume").catch(() => ({})),
    ]);

    const knowledgeContext = await getRagRetrieveService()?.retrieve(
      `${job.novel.title} ${job.novel.inspiration || ""} ${config.genre || ""}`,
      { novelId, topK: 10 }
    ) ?? "";

    // 章纲
    await this.updateJobProgress(jobId, "chapter_outline", "chapter_outline");
    const chapterOutlineResult = await this.generateChapterOutlines(novelId, volumeResult, outlineResult, worldviewResult, charactersResult, styleResult, config);
    await this.savePhaseResult(jobId, "chapter_outline", "chapter_outline", { volumes: volumeResult }, chapterOutlineResult);
    await this.saveToKnowledgeBase(novelId, 'chapter_outline', '章纲规划', chapterOutlineResult);

    // 主线/钩子
    await this.updateJobProgress(jobId, "chapter_outline", "mainline_hook");
    const mainlineHookResult = await this.generateMainlinesAndHooks(novelId, outlineResult, volumeResult, worldviewResult, charactersResult, styleResult, knowledgeContext);
    await this.savePhaseResult(jobId, "chapter_outline", "mainline_hook", { outline: outlineResult, volumes: volumeResult }, mainlineHookResult);
    await this.saveToKnowledgeBase(novelId, 'mainline_hook', '主线钩子', mainlineHookResult);

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused", currentPhase: "chapter_outline", currentStep: "waiting_confirm" },
    });
  }

  // 读取某个 phase/step 的 output
  private async getPhaseOutput(jobId: string, phase: string, step: string): Promise<any> {
    const result = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase, step } },
    });
    if (!result) throw new Error(`未找到 ${phase}/${step} 的生成结果，请先完成该步骤。`);
    return JSON.parse(result.output);
  }

  // 生成大纲
  private async generateOutline(novelId: string, inspiration: string, knowledge: string, config: PipelineConfig, userHint?: string): Promise<any> {
    const system = `你是一位资深网文策划师。你的核心任务是：基于用户提供的创意素材，进行增量补充和结构化整理，而不是重新创作。

工作原则：
- 用户的创意是核心素材，必须最大程度保留原文内容和表达
- 只补充用户未涉及的部分，不改写已有内容
- 如果用户的创意已经非常完整，你只需要做结构化整理和少量补充
- 补充的内容要与用户的风格和调性保持一致
- 绝不能丢失用户创意中的任何重要细节、人物设定、情节设计`;

    const prompt = `请分析以下创意素材，将其整理为结构化的大纲。

【创意素材】
${inspiration}

【类型】
${config.genre || "自动判断"}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

你的任务：
1. 先分析创意素材中已包含哪些内容（标题、世界观、人物、故事线、风格等）
2. 将已有内容直接保留到对应字段，不要改写或压缩
3. 只对缺失的部分进行补充（如：素材中没有写到的具体情节细节、冲突升级节奏等）
4. 如果素材已经非常完整，补充量应尽可能少

请生成JSON格式的大纲：
{
  "title": "从素材中提取，如无则建议",
  "genre": "从素材中提取",
  "theme": "从素材中提取核心主题",
  "hook": "从素材中提取开篇钩子，如无则补充一个具体的开篇场景",
  "coreSetting": "从素材中提取核心设定，保留原文描述",
  "mainConflict": "从素材中提取主要冲突，保留原文描述",
  "protagonist": {
    "name": "从素材中提取",
    "identity": "从素材中提取，保留原文描述",
    "goal": "从素材中提取，如无则补充短期和长期目标",
    "growth": "从素材中提取成长线，如无则补充"
  },
  "antagonist": {
    "name": "从素材中提取",
    "identity": "从素材中提取",
    "motivation": "从素材中提取"
  },
  "plotStructure": {
    "beginning": "从素材中提取开篇情节，如无则补充具体的前10%情节",
    "development": "从素材中提取发展阶段，如无则补充10%-40%的具体情节",
    "climax": "从素材中提取高潮情节，如无则补充40%-80%的具体冲突升级",
    "resolution": "从素材中提取结局，如无则补充80%-100%的收尾"
  },
  "highlights": "从素材中提取亮点，如无则提炼3个核心卖点",
  "targetAudience": "从素材中提取目标读者，如无则补充"
}

注意：输出的每个字段都应该尽量详细，保留原文的生动表达，不要压缩成干巴巴的概括。`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
    return this.parseJson(result);
  }

  // 生成世界观
  private async generateWorldview(novelId: string, outline: any, knowledge: string, userHint?: string): Promise<any> {
    const system = `你是一位资深网文世界观架构师。你的核心任务是：基于大纲中已有的世界观设定，进行增量补充和结构化整理，而不是重新创作。

工作原则：
- 大纲中的世界观设定是核心素材，必须最大程度保留原文内容
- 只补充大纲中未涉及的部分（如：力量体系的具体等级、势力的详细分布等）
- 如果大纲中的世界观已经非常完整，你只需要做结构化整理和少量补充
- 保留原文的生动表达和独特设定`;

    const prompt = `请分析以下大纲中的世界观设定，进行增量补充和结构化整理。

【大纲】
${JSON.stringify(outline, null, 2)}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

你的任务：
1. 先分析大纲中已包含哪些世界观设定
2. 将已有内容直接保留到对应字段，不要改写或压缩
3. 只对缺失的部分进行补充（如：力量体系的具体等级、势力的详细分布等）

请生成JSON格式的世界观：
{
  "name": "从大纲中提取，如无则建议",
  "summary": "从大纲中提取世界概述，保留原文描述",
  "rules": "从大纲中提取世界规则，保留原文描述",
  "geography": "从大纲中提取地理环境，如无则补充关键地点",
  "factions": "从大纲中提取势力分布，如无则补充主要势力关系",
  "history": "从大纲中提取历史背景，如无则补充与故事相关的重大事件",
  "powerSystem": {
    "name": "从大纲中提取力量体系名称",
    "levels": "从大纲中提取等级，如无则补充合理的等级划分",
    "rules": "从大纲中提取力量规则，如无则补充获取方式和限制条件"
  },
  "specialElements": "从大纲中提取特殊元素，如无则补充"
}`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 1500 });
    const parsed = this.parseJson(result);
    return Object.keys(parsed).length ? parsed : this.buildFallbackWorldview(outline);
  }

  // 生成人物
  private async generateCharacters(novelId: string, outline: any, worldview: any, knowledge: string, userHint?: string): Promise<any> {
    const system = `你是一位资深网文人物设计师。你的核心任务是：基于大纲中已有的人物设定，进行增量补充和结构化整理，而不是重新设计人物。

工作原则：
- 大纲中的人物设定是核心素材，必须最大程度保留原文内容
- 只补充大纲中未涉及的部分（如：外貌细节、背景故事补充等）
- 如果大纲中的人物已经非常完整，你只需要做结构化整理和少量补充
- 保留原文的人物特色和关系描述`;

    const prompt = `请分析以下大纲中的人物设定，进行增量补充和结构化整理。

【大纲】
${JSON.stringify(outline, null, 2)}

【世界观】
${JSON.stringify(worldview, null, 2)}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

你的任务：
1. 先分析大纲中已包含哪些人物设定
2. 将已有内容直接保留到对应字段，不要改写或压缩
3. 只对缺失的部分进行补充（如：外貌特征、能力细节等）

请生成JSON格式的人物列表：
{
  "characters": [
    {
      "name": "从大纲中提取人物名",
      "role": "从大纲中提取角色定位",
      "identity": "从大纲中提取身份描述，保留原文",
      "motivation": "从大纲中提取动机，保留原文",
      "appearance": "从大纲中提取外貌特征，如无则补充有记忆点的描述",
      "background": "从大纲中提取背景故事，如无则补充与主线关联的背景",
      "personality": "从大纲中提取性格特点，保留原文描述",
      "abilities": "从大纲中提取能力/技能，如无则补充与世界观匹配的能力",
      "relationsText": "从大纲中提取人物关系，保留原文描述"
    }
  ]
}`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 2000 });
    return this.parseJson(result);
  }

  // 生成风格
  private async generateStyle(novelId: string, outline: any, config: PipelineConfig, userHint?: string): Promise<any> {
    const system = `你是一位资深网文风格顾问，擅长设计能有效约束写作的风格体系。
你的核心任务是：基于大纲中的风格描述，设计一套具体、可执行的风格约束，让每一段文字都能体现出统一的风格调性。

工作原则：
- 大纲中的风格描述是核心素材，必须最大程度保留原文内容
- 风格约束必须具体到可执行层面，不能只是抽象标签
- 要考虑反差、幽默、紧张感等情绪节奏的控制方式`;

    const prompt = `请分析以下大纲中的风格描述，设计一套完整的风格约束体系。

【大纲】
${JSON.stringify(outline, null, 2)}

【配置】
类型：${config.genre || outline.genre || "自动判断"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式的风格配置：
{
  "name": "风格名称，如「轻松幽默的都市修仙」「压抑暗黑的权谋复仇」",
  "description": "一句话概括整体风格调性",

  "toneAndAtmosphere": "整体基调与氛围。例如：「表面轻松搞笑，底层有暗流涌动的紧张感」「压抑沉重中穿插温情时刻」",
  "emotionalRhythm": "情绪节奏设计。例如：「每章前半段轻松日常，后半段反转制造紧张」「三章一个小高潮，十章一个大高潮」",
  "contrastPatterns": "反差设计。例如：「主角外表废物vs内在天才的反差」「搞笑日常vs生死危机的反差」「温馨日常vs阴谋暗涌的反差」",

  "humorStyle": "幽默方式。例如：「毒舌吐槽型：主角内心OS犀利搞笑」「冷幽默：用一本正经的方式说荒诞的事」「自嘲式：主角自嘲化解尴尬」「无」",
  "tensionTechniques": "紧张感制造技巧。例如：「信息不对称：读者知道危险但角色不知道」「倒计时：限时压力」「信任危机：盟友突然可疑」",
  "suspenseTechniques": "悬念技巧。例如：「每章末尾留一个未解问题」「关键信息分段揭露」「真假线索混杂」",

  "narrativePov": "叙事视角：first_person / third_person_limited / third_person_omniscient",
  "tense": "时态：past / present",
  "pacing": "整体节奏：fast / balanced / slow",
  "sentenceRhythm": "句式节奏。例如：「短句为主制造紧张，长句铺垫制造氛围」「长短交错，像呼吸一样有节奏」",
  "vocabularyLevel": "用词层级。例如：「口语化为主，偶尔用文言点缀」「现代白话，避免生僻字」「古风用语，但不晦涩」",
  "dialogueStyle": "对话风格。例如：「简洁有力，潜台词丰富」「日常口语化，关键时刻突然严肃」「话少但每句都有信息量」",

  "chapterOpeningStyle": "开篇方式。例如：「直接进入冲突，不要铺垫」「先展示日常，再打破平静」「以悬念或疑问开篇」",
  "chapterEndingStyle": "收尾方式。例如：「必须留钩子，让读者想看下一章」「以角色的内心独白收尾」「以新信息或反转收尾」",

  "writingRules": [
    "具体的写作规则1，例如：每章必须有一个情绪高点（爽点/泪点/笑点）",
    "具体的写作规则2，例如：避免大段心理描写，用行动和对话推进",
    "具体的写作规则3，例如：专业判断必须给出可见证据，避免无根据开挂"
  ],

  "avoidList": [
    "需要避免的写法1，例如：不要用「他心想」开头的大段内心独白",
    "需要避免的写法2，例如：不要在紧张场景中插入搞笑",
    "需要避免的写法3，例如：不要用「突然」作为转折词"
  ]
}`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.6, maxTokens: 2000 });
    const parsed = this.parseJson(result);
    return Object.keys(parsed).length ? parsed : this.buildFallbackStyle(outline, config);
  }

  // AI自评
  async selfReview(content: any, type: string): Promise<{ score: number; comment: string; issues: string[] }> {
    const prompt = `你是一位严格的网文编辑。请对以下${type}进行评审。

【内容】
${JSON.stringify(content, null, 2)}

请以JSON格式返回评审结果：
{
  "score": 1-10的分数,
  "comment": "总体评价",
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.3, maxTokens: 1000 });
    const review = this.parseJson(result);
    return {
      score: review.score || 7,
      comment: review.comment || "",
      issues: review.issues || [],
    };
  }

  // 自动修复
  async autoFix(content: any, issues: string[], type: string): Promise<any> {
    const prompt = `你是一位资深网文修改专家。请根据以下问题修复${type}。

【原始内容】
${JSON.stringify(content, null, 2)}

【需要修复的问题】
${issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

请返回修复后的完整JSON格式内容（结构与原内容相同）：`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.5, maxTokens: 2000 });
    return this.parseJson(result);
  }

  // 确认阶段结果
  async confirmPhase(jobId: string, phase: string, step: string, feedback?: string) {
    const result = await prisma.phaseResult.update({
      where: { jobId_phase_step: { jobId, phase, step } },
      data: {
        status: "confirmed",
        confirmedByUser: true,
        userFeedback: feedback,
      },
    });

    // 检查是否所有步骤都已确认
    const allResults = await prisma.phaseResult.findMany({
      where: { jobId, phase },
    });

    const allConfirmed = allResults.every(r => r.status === "confirmed");

    // 获取 pipelineVersion 判断使用哪个流程
    const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
    const config = job?.config ? JSON.parse(job.config) : {};
    const pipelineVersion = config.pipelineVersion || 1;

    if (pipelineVersion >= 2) {
      // 新流程：outline → assets → planning(卷纲 → 章纲 → 弧线) → consistency_check → writing
      if (allConfirmed && phase === "outline") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "assets", currentStep: "worldview" },
        });
        this.executeAssetsPhase(jobId);
      }
      if (allConfirmed && phase === "assets") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "planning", currentStep: "volume_outline" },
        });
        this.executePlanningPhase_standalone(jobId);
      }
      // planning 阶段：卷纲确认后触发章纲生成
      if (phase === "planning" && step === "volume_outline") {
        // 检查卷纲是否已确认
        const volumeOutlineConfirmed = allResults.find(r => r.step === "volume_outline")?.status === "confirmed";
        if (volumeOutlineConfirmed) {
          // 检查章纲是否已生成
          const chapterResults = allResults.filter(r => r.step.startsWith("chapter_outline_vol_"));
          if (chapterResults.length === 0) {
            // 章纲尚未生成，触发章纲生成
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { status: "running", currentPhase: "planning", currentStep: "chapter_outline_vol_1" },
            });
            this.executeChapterOutlinesPhase(jobId);
          }
        }
      }
      // planning 阶段：所有步骤都确认后进入一致性校验
      if (allConfirmed && phase === "planning") {
        const hasChapterOutlines = allResults.some(r => r.step.startsWith("chapter_outline_vol_"));
        const hasStoryArcs = allResults.some(r => r.step === "story_arcs");
        if (hasChapterOutlines && hasStoryArcs) {
          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { status: "running", currentPhase: "consistency_check", currentStep: "consistency" },
          });
          this.executeConsistencyCheckPhase(jobId);
        }
      }
      if (allConfirmed && phase === "consistency_check") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
        });
        this.executeWritingPhase(jobId);
      }
    } else {
      // 旧流程（legacy）：outline → assets → volumes → chapter_outline → writing
      if (allConfirmed && phase === "outline") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "assets", currentStep: "worldview" },
        });
        this.executeAssetsPhase(jobId);
      }
      if (allConfirmed && phase === "assets") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "volumes", currentStep: "volume" },
        });
        this.executeVolumesPhase(jobId);
      }
      if (allConfirmed && phase === "volumes") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "chapter_outline", currentStep: "chapter_outline" },
        });
        this.executeChapterOutlinePhase(jobId);
      }
      if (allConfirmed && phase === "chapter_outline") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
        });
        this.executeWritingPhase(jobId);
      }
    }

    // imitation 模式阶段流转（不受 pipelineVersion 影响）
    if (allConfirmed && phase === "planning" && config.mode === "imitation") {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "structuring", currentStep: "volume" },
      });
      this.executeStructuringPhase(jobId);
    }
    if (allConfirmed && phase === "structuring") {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
      });
      this.executeWritingPhase(jobId);
    }

    return result;
  }

  private async confirmPhaseResults(jobId: string, phase: string) {
    await prisma.phaseResult.updateMany({
      where: { jobId, phase, status: "completed" },
      data: {
        status: "confirmed",
        confirmedByUser: false,
      },
    });
  }

  // 执行结构化阶段
  private async executeStructuringPhase(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;

    // 获取规划阶段结果
    const outlineResult = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: "planning", step: "outline" } },
    });
    const outline = outlineResult ? JSON.parse(outlineResult.output) : {};

    const [worldviewRes, charactersRes, styleRes] = await Promise.all([
      prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "planning", step: "worldview" } } }),
      prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "planning", step: "characters" } } }),
      prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "planning", step: "style" } } }),
    ]);
    const worldview = worldviewRes ? JSON.parse(worldviewRes.output) : {};
    const characters = charactersRes ? JSON.parse(charactersRes.output) : {};
    const style = styleRes ? JSON.parse(styleRes.output) : {};

    // 2.1 生成卷纲
    await this.updateJobProgress(jobId, "structuring", "volume");
    const volumeResult = await this.generateVolumeOutline(job.novelId, outline, worldview, characters, style, config);
    await this.savePhaseResult(jobId, "structuring", "volume", { outline }, volumeResult);
    await this.saveToKnowledgeBase(job.novelId, 'volume', '卷纲规划', volumeResult);

    // 2.2 生成章纲
    await this.updateJobProgress(jobId, "structuring", "chapter_outline");
    const chapterOutlineResult = await this.generateChapterOutlines(job.novelId, volumeResult, outline, worldview, characters, style, config);
    await this.savePhaseResult(jobId, "structuring", "chapter_outline", { volumes: volumeResult }, chapterOutlineResult);
    await this.saveToKnowledgeBase(job.novelId, 'chapter_outline', '章纲规划', chapterOutlineResult);

    // 2.3 生成主线/钩子
    await this.updateJobProgress(jobId, "structuring", "mainline_hook");
    const mainlineHookResult = await this.generateMainlinesAndHooks(job.novelId, outline, volumeResult, worldview, characters, style);
    await this.savePhaseResult(jobId, "structuring", "mainline_hook", { outline, volumes: volumeResult }, mainlineHookResult);
    await this.saveToKnowledgeBase(job.novelId, 'mainline_hook', '主线钩子', mainlineHookResult);

    if (config.autoContinue) {
      await this.confirmPhaseResults(jobId, "structuring");
      await this.executeWritingPhase(jobId);
      return;
    }

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused", currentPhase: "structuring", currentStep: "waiting_confirm" },
    });
  }

  // 生成卷纲
  private async generateVolumeOutline(novelId: string, outline: any, worldview: any, characters: any, style: any, config: PipelineConfig, inspiration?: string, userHint?: string): Promise<any> {
    const volumeCount = config.volumeCount || 5;
    const chaptersPerVolume = config.chaptersPerVolume || 30;
    const totalChapters = volumeCount * chaptersPerVolume;

    const system = `你是一位资深网文结构师，擅长规划长篇小说的卷结构。

设计原则：
- 卷与卷之间要有递进关系：冲突升级、世界观扩展、人物成长
- 每卷要有核心爽点和标志性事件
- 每卷结尾要留钩子，吸引读者继续阅读
- 新角色引入要有节奏，不要一卷塞太多
- 情绪基调要有变化，不能每卷都一样
- 要考虑整体字数分配的合理性
- 每卷的目标、冲突、情绪必须明确且可执行
- 卷与卷之间的衔接要自然，不能突兀跳转`;

    // 构建人物摘要
    const characterSummary = Array.isArray(characters?.characters)
      ? characters.characters.map((c: any) => `${c.name}（${c.role || "未知"}）：${c.motivation || ""}`).join("\n")
      : typeof characters === "string" ? characters : JSON.stringify(characters, null, 2);

    const prompt = `请根据以下信息，规划${volumeCount}卷的内容（共${totalChapters}章，每卷${chaptersPerVolume}章）。

【用户创意/灵感】
${inspiration || outline?.title ? `作品：${outline?.title || "未命名"}` : "无"}
${typeof outline === "string" ? outline : ""}

【故事大纲】
${typeof outline === "object" ? JSON.stringify(outline, null, 2) : "见上方创意"}

【世界观】
${worldview?.name ? `${worldview.name}：${worldview.summary || ""}\n规则：${worldview.rules || "无"}\n力量体系：${typeof worldview.powerSystem === "string" ? worldview.powerSystem : JSON.stringify(worldview.powerSystem || {})}` : JSON.stringify(worldview, null, 2)}

【主要人物】
${characterSummary}

【写作风格】
${style?.name ? `${style.name}：${style.description || ""}` : JSON.stringify(style, null, 2)}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式的卷纲，每卷必须包含明确的目标、冲突和情绪设计：
{
  "volumes": [
    {
      "title": "卷标题（要有概括性，体现本卷核心主题）",
      "goal": "本卷目标（主角在本卷要达成什么，必须具体可衡量）",
      "conflict": "主要冲突（本卷的核心矛盾，要说明冲突双方和冲突焦点）",
      "emotion": "情绪基调（如：热血、悬疑、温情、压抑、轻松、悲壮）",
      "newChars": ["新角色1", "新角色2"],
      "mapName": "主要场景（与世界观关联的具体地点）",
      "endHook": "结尾钩子（用什么悬念吸引读者看下一卷，要具体）",
      "keyEvents": ["关键事件1", "关键事件2"],
      "turningPoint": "本卷转折点（剧情发生重大变化的事件）",
      "climax": "本卷高潮（最精彩的部分）"
    }
  ]
}

注意：
- 每卷的 title 要有吸引力，能概括本卷主题
- goal 必须是具体的目标，不能是模糊的描述
- conflict 要说明具体的冲突双方和焦点
- endHook 要有具体的悬念，不能只是"留个钩子"
- keyEvents 列出本卷 2-3 个最重要的事件
- turningPoint 和 climax 必须是具体的事件描述`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
    return this.parseJson(result);
  }

  // 生成章纲
  private async generateChapterOutlines(novelId: string, volumes: any, outline: any, worldview: any, characters: any, style: any, config: PipelineConfig): Promise<any> {
    const chaptersPerVolume = config.chaptersPerVolume || 10;
    const system = `你是一位资深网文章纲设计师，擅长将宏观故事拆解为引人入胜的章节。

设计原则：
- 每章要有明确的目标和冲突，不能流水账
- 章节之间要有节奏变化：紧张→舒缓→紧张
- 每章结尾要有钩子（悬念、反转、新信息），让读者想看下一章
- 关键章节（开篇、转折、高潮）要有更高的信息密度和情感强度
- 要考虑每章的字数目标和阅读时长
- 人物成长和关系变化要有自然的过渡`;

    const prompt = `请为每卷设计${chaptersPerVolume}章的章纲。

【大纲】
${JSON.stringify(outline, null, 2)}

【卷纲】
${JSON.stringify(volumes, null, 2)}

【世界观】
${JSON.stringify(worldview, null, 2)}

【人物】
${JSON.stringify(characters, null, 2)}

【风格】
${JSON.stringify(style, null, 2)}

请生成JSON格式的章纲：
{
  "chapterOutlines": [
    {
      "volumeIndex": 0,
      "chapters": [
        {
          "title": "章节标题（要有吸引力）",
          "goal": "章节目标（本章要推进什么）",
          "conflict": "冲突（本章的核心矛盾）",
          "emotion": "情绪（如：紧张、温馨、热血、压抑）",
          "hook": "章末钩子（如何吸引读者看下一章）"
        }
      ]
    }
  ]
}`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
    return this.parseJson(result);
  }

  // 生成主线和钩子
  private async generateMainlinesAndHooks(novelId: string, outline: any, volumes: any, worldview: any, characters: any, style?: any, knowledge?: string, userHint?: string): Promise<any> {
    const system = `你是一位资深网文剧情架构师，擅长设计贯穿全文的主线和层层递进的钩子。

设计原则：
- 主线要清晰，贯穿全文，有明确的起点和终点
- 支线要服务于主线，不能喧宾夺主
- 钩子要有层次：小钩子（每章）→ 中钩子（每卷）→ 大钩子（全文）
- 钩子类型要多样：悬念、反转、新信息、情感冲突、实力展示
- 钩子强度要递进，越到后面越强
- 主线和钩子要与人物成长弧线紧密结合
- 要考虑风格调性：如果风格偏轻松幽默，钩子也可以有趣味性；如果风格偏压抑紧张，钩子要更有压迫感`;

    const prompt = `请根据以下信息，规划主线和钩子。

【大纲】
${JSON.stringify(outline, null, 2)}

【卷纲】
${JSON.stringify(volumes, null, 2)}

【世界观】
${JSON.stringify(worldview, null, 2)}

【人物】
${JSON.stringify(characters, null, 2)}

【风格】
${JSON.stringify(style || {}, null, 2)}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式（必须包含 mainlines 和 hooks 两个数组）：
{
  "mainlines": [
    { "title": "主线名称", "description": "主线描述（要具体，包含起承转合，说明起点、发展、高潮、结局）" }
  ],
  "hooks": [
    { "title": "钩子标题", "description": "钩子描述（要具体，说明在哪个节点、如何吸引读者）", "type": "suspense/foreshadow/cliffhanger/reversal/power_display", "intensity": 1-10 }
  ]
}

注意：
1. mainlines 至少要有 2-3 条主线（主线、情感线、成长线等）
2. hooks 至少要有 5-8 个钩子，分布在不同卷和章节
3. 每个描述都要具体，不要泛泛而谈`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 2000 });
    const parsed = this.parseJson(result);
    // 兜底：如果解析失败，返回基本结构
    if (!parsed.mainlines && !parsed.hooks) {
      console.warn("主线钩子解析失败，LLM返回:", result?.substring(0, 200));
      return {
        mainlines: [{ title: "主线剧情", description: "待补充" }],
        hooks: [],
      };
    }
    return parsed;
  }

  // ========== 新增：富化章纲生成（全量规划先行架构） ==========

  /**
   * 为指定卷生成富化章纲（含出场角色、钩子埋/收、伏笔埋/收、爽点、情绪曲线）
   */
  private async generateEnrichedChapterOutlines(
    novelId: string,
    volumes: any,
    volumeIndex: number,
    outline: any,
    worldview: any,
    characters: any,
    style: any,
    previousSummary: string,
    config: PipelineConfig,
    userHint?: string,
  ): Promise<any> {
    const chaptersPerVolume = config.chaptersPerVolume || 30;
    const volume = volumes?.volumes?.[volumeIndex] || {};
    const volumeNumber = volumeIndex + 1;

    const system = `你是一位资深网文章纲设计师，擅长为长篇小说设计详细的章节规划。

设计原则：
- 每章必须有明确的目标和冲突，不能流水账
- 章节之间要有节奏变化：紧张→舒缓→紧张
- 每章结尾要有钩子（悬念、反转、新信息），让读者想看下一章
- 关键章节（开篇、转折、高潮）要有更高的信息密度和情感强度
- 人物成长和关系变化要有自然的过渡
- 钩子和伏笔必须在后续章节有明确回收计划，不能悬空
- 爽点分布要有节奏，不能连续出现也不能长期缺失
- 角色出场要有逻辑，不能凭空出现
- 情绪曲线要有起伏，不能全是高潮或全是低谷`;

    const characterNames = Array.isArray(characters?.characters)
      ? characters.characters.map((c: any) => c.name).join("、")
      : "未知";

    const prompt = `请为第${volumeNumber}卷设计${chaptersPerVolume}章的详细章纲。

【故事大纲】
${typeof outline === "string" ? outline : JSON.stringify(outline, null, 2)}

【第${volumeNumber}卷卷纲】
${JSON.stringify(volume, null, 2)}

【世界观摘要】
${worldview?.name ? `${worldview.name}：${worldview.summary || ""}` : JSON.stringify(worldview, null, 2)}

【可用角色】
${characterNames}

【风格约束】
${style?.name ? `${style.name}：${style.description || ""}` : JSON.stringify(style, null, 2)}
${previousSummary ? `\n【前序卷章纲摘要】\n${previousSummary}` : ""}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式的富化章纲，每章必须包含以下字段：
{
  "chapters": [
    {
      "title": "章节标题（要有吸引力）",
      "goal": "本章目标（推进什么剧情）",
      "conflict": "本章核心冲突",
      "emotion": "情绪基调（紧张/温馨/热血/压抑/轻松/悲伤等）",
      "hook": "章末钩子（如何吸引读者看下一章）",
      "characters": [
        {"name": "角色名", "goal": "本章该角色的目标", "action": "关键行动"}
      ],
      "hooksPlanted": [
        {"title": "钩子标题", "description": "具体内容", "type": "suspense/foreshadow/cliffhanger/reversal/comedy/mystery/power_up/romance", "intensity": 7, "plannedResolveChapter": 15}
      ],
      "hooksResolved": [
        {"title": "之前埋的钩子标题", "resolvedDescription": "如何揭示/回收"}
      ],
      "foreshadowPlanted": [
        {"title": "伏笔标题", "description": "具体内容", "plannedPayoffChapter": 20}
      ],
      "foreshadowPayoff": [
        {"title": "之前埋的伏笔标题", "payoffDescription": "如何回收"}
      ],
      "pleasurePoint": {
        "type": "power_up/revenge/shock/romance/resource/status/golden_finger",
        "intensity": 8,
        "description": "爽点描述"
      },
      "emotionData": {
        "emotionType": "tension/release/depression/climax/neutral",
        "intensity": 7,
        "isClimax": false,
        "isTurningPoint": false,
        "isBreathing": false
      }
    }
  ]
}

注意：
- 如果本章没有埋设钩子，hooksPlanted 设为空数组 []
- 如果本章没有回收钩子，hooksResolved 设为空数组 []
- 伏笔同理
- 每5-8章至少有一个爽点
- 情绪曲线要有起伏，连续高潮不超过3章，连续低谷不超过5章
- 开篇章节必须有强钩子
- 所有钩子和伏笔的 plannedResolveChapter/plannedPayoffChapter 必须是有效的章节编号`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 6000 });
    return this.parseJson(result);
  }

  /**
   * 生成跨卷故事弧线（主线、跨卷钩子、情绪曲线总览）
   */
  private async generateStoryArcs(
    novelId: string,
    outline: any,
    allChapterOutlines: any,
    volumes: any,
    worldview: any,
    characters: any,
    style: any,
    config: PipelineConfig,
  ): Promise<any> {
    // 构建全局章纲摘要（仅 title+goal+hook，控制 token 量）
    const chapterSummary = (allChapterOutlines?.chapterOutlines || []).flatMap((group: any, volIdx: number) =>
      (group.chapters || []).map((ch: any, chIdx: number) => ({
        volume: volIdx + 1,
        chapter: chIdx + 1,
        title: ch.title,
        goal: ch.goal,
        hook: ch.hook,
      }))
    );
    const totalChapters = chapterSummary.length;
    const volumeCount = volumes?.volumes?.length || 0;

    const system = `你是一位资深网文故事弧线设计师，擅长规划长篇小说的主线脉络和跨卷钩子。

设计原则：
- 主线必须贯穿全文，有明确的起点和终点
- 支线必须服务于主线，不能喧宾夺主
- 跨卷钩子要有递进关系，强度逐步升级
- 情绪曲线要有整体节奏感：三章一小高潮，十章大高潮
- 伏笔的埋设和回收要形成完整闭环
- 主线的里程碑事件必须被章节的 goal 覆盖`;

    const prompt = `请根据以下完整的章纲规划，设计跨卷故事弧线。

【故事大纲】
${typeof outline === "string" ? outline : JSON.stringify(outline, null, 2)}

【卷纲】
${JSON.stringify(volumes, null, 2)}

【全局章纲摘要（共${totalChapters}章，${volumeCount}卷）】
${JSON.stringify(chapterSummary, null, 2)}

【世界观】
${worldview?.name ? `${worldview.name}：${worldview.summary || ""}` : JSON.stringify(worldview, null, 2)}

【人物】
${Array.isArray(characters?.characters) ? characters.characters.map((c: any) => `${c.name}（${c.role}）`).join("、") : JSON.stringify(characters, null, 2)}

请生成JSON格式的故事弧线：
{
  "mainlines": [
    {
      "title": "主线名称",
      "description": "详细描述（包含起因、发展、高潮、结局）",
      "type": "main/sub/emotional/mystery",
      "startChapter": 1,
      "endChapter": ${totalChapters},
      "milestones": [
        {"chapter": 15, "event": "里程碑事件描述"},
        {"chapter": 50, "event": "里程碑事件描述"}
      ],
      "resolution": "结局方向"
    }
  ],
  "crossVolumeHooks": [
    {
      "title": "跨卷钩子标题",
      "description": "具体内容",
      "type": "suspense/foreshadow/cliffhanger/mystery/reversal",
      "intensity": 9,
      "plantedChapter": 5,
      "resolvedChapter": 120
    }
  ],
  "emotionCurveSummary": {
    "rhythmPattern": "节奏模式描述（如：三章一小高潮，十章大高潮）",
    "climaxChapters": [10, 25, 50, 75, 100, 125, ${totalChapters}],
    "breathingChapters": [5, 15, 30, 45, 60, 80, 110, 140],
    "turningPoints": [50, 100]
  }
}

注意：
- 主线至少2-3条（主剧情线、感情线、成长线）
- 跨卷钩子至少5-8个，分布 across 不同卷
- 每个里程碑事件必须对应到具体的章节编号
- 情绪曲线的章节编号必须在 1-${totalChapters} 范围内`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
    return this.parseJson(result);
  }

  /**
   * 持久化单卷的富化章纲到数据库
   */
  private async persistVolumeChapterData(novelId: string, volumeIndex: number, chapters: any[], volumeResult: any) {
    const volumeNumber = volumeIndex + 1;
    const volume = await prisma.volume.findFirst({
      where: { novelId, sortOrder: volumeNumber },
    });
    if (!volume) return;

    const globalStart = volumeIndex * (chapters?.length || 0) + 1;

    for (const [chIdx, chapter] of (chapters || []).entries()) {
      const globalOrder = globalStart + chIdx;

      // 1. 创建/更新 ChapterOutline
      await prisma.chapterOutline.upsert({
        where: { novelId_sortOrder: { novelId, sortOrder: globalOrder } },
        create: {
          novelId,
          volumeId: volume.id,
          sortOrder: globalOrder,
          title: chapter.title || `第${globalOrder}章`,
          goal: chapter.goal || "",
          conflict: chapter.conflict || "",
          emotion: chapter.emotion || "",
          hook: chapter.hook || "",
          foreshadowing: JSON.stringify(chapter.foreshadowPlanted || []),
          payoff: JSON.stringify(chapter.foreshadowPayoff || []),
          pleasurePoint: chapter.pleasurePoint?.description || (typeof chapter.pleasurePoint === "string" ? chapter.pleasurePoint : ""),
        },
        update: {
          volumeId: volume.id,
          title: chapter.title || `第${globalOrder}章`,
          goal: chapter.goal || "",
          conflict: chapter.conflict || "",
          emotion: chapter.emotion || "",
          hook: chapter.hook || "",
          foreshadowing: JSON.stringify(chapter.foreshadowPlanted || []),
          payoff: JSON.stringify(chapter.foreshadowPayoff || []),
          pleasurePoint: chapter.pleasurePoint?.description || (typeof chapter.pleasurePoint === "string" ? chapter.pleasurePoint : ""),
        },
      });

      // 2. 创建 Hook 记录（每章埋设的钩子）
      for (const hook of (chapter.hooksPlanted || [])) {
        if (!hook?.title) continue;
        await prisma.hook.create({
          data: {
            novelId,
            title: hook.title,
            description: hook.description || "",
            type: hook.type || "suspense",
            intensity: Math.max(1, Math.min(10, Number(hook.intensity || 5))),
            plannedChapter: globalOrder,
            resolvedChapter: hook.plannedResolveChapter || null,
            status: "planted",
          },
        });
      }

      // 3. 创建 Foreshadow 记录（每章埋设的伏笔）
      for (const fs of (chapter.foreshadowPlanted || [])) {
        if (!fs?.title) continue;
        await prisma.foreshadow.create({
          data: {
            novelId,
            title: fs.title,
            description: fs.description || "",
            plantChapter: globalOrder,
            payoffChapter: fs.plannedPayoffChapter || null,
            status: "planted",
          },
        });
      }

      // 4. 创建 PleasurePoint 记录
      if (chapter.pleasurePoint && typeof chapter.pleasurePoint === "object" && chapter.pleasurePoint.description) {
        await prisma.pleasurePoint.create({
          data: {
            novelId,
            chapterOrder: globalOrder,
            type: chapter.pleasurePoint.type || "power_up",
            intensity: Math.max(1, Math.min(10, Number(chapter.pleasurePoint.intensity || 5))),
            description: chapter.pleasurePoint.description,
            characters: JSON.stringify((chapter.characters || []).map((c: any) => c.name)),
          },
        });
      }

      // 5. 创建 EmotionCurve 记录
      if (chapter.emotionData) {
        const ed = chapter.emotionData;
        await prisma.emotionCurve.create({
          data: {
            novelId,
            chapterOrder: globalOrder,
            emotionType: ed.emotionType || "neutral",
            intensity: Math.max(1, Math.min(10, Number(ed.intensity || 5))),
            isClimax: Boolean(ed.isClimax),
            isTurningPoint: Boolean(ed.isTurningPoint),
            isBreathing: Boolean(ed.isBreathing),
            description: chapter.emotion || "",
          },
        });
      }

      // 6. 更新 Character.firstAppear
      for (const char of (chapter.characters || [])) {
        if (!char?.name) continue;
        const existing = await prisma.character.findFirst({
          where: { novelId, name: char.name },
        });
        if (existing && !existing.firstAppear) {
          await prisma.character.update({
            where: { id: existing.id },
            data: { firstAppear: globalOrder },
          });
        }
      }
    }

    // 7. 存储完整富化数据到 KnowledgeAsset（供写作阶段读取）
    await this.saveToKnowledgeBase(novelId, `enriched_chapters_vol_${volumeNumber}`,
      `第${volumeNumber}卷富化章纲`, { chapters });
  }

  /**
   * 持久化跨卷故事弧线
   */
  private async persistStoryArcs(novelId: string, storyArcs: any) {
    // 1. 创建 Mainline 记录
    for (const [index, mainline] of (storyArcs?.mainlines || []).entries()) {
      await prisma.mainline.create({
        data: {
          novelId,
          title: mainline.title || `主线${index + 1}`,
          description: mainline.description || "",
          type: mainline.type || "main",
          startChapter: mainline.startChapter || 1,
          endChapter: mainline.endChapter || 999,
          milestones: JSON.stringify(mainline.milestones || []),
          resolution: mainline.resolution || "",
          sortOrder: index + 1,
          priority: mainline.type === "main" ? 10 : 7,
        },
      });
    }

    // 2. 创建跨卷 Hook 记录
    for (const hook of (storyArcs?.crossVolumeHooks || [])) {
      if (!hook?.title) continue;
      await prisma.hook.create({
        data: {
          novelId,
          title: hook.title,
          description: hook.description || "",
          type: hook.type || "suspense",
          intensity: Math.max(1, Math.min(10, Number(hook.intensity || 5))),
          plannedChapter: hook.plantedChapter || null,
          resolvedChapter: hook.resolvedChapter || null,
          status: "planted",
        },
      });
    }

    // 3. 创建 EmotionCurve 总览记录
    if (storyArcs?.emotionCurveSummary) {
      await this.saveToKnowledgeBase(novelId, "emotion_curve_summary", "情绪曲线总览", storyArcs.emotionCurveSummary);
    }
  }

  /**
   * 生成一致性校验报告
   */
  private async generateConsistencyCheck(novelId: string, planSummary: string): Promise<any> {
    const system = `你是一位资深网文故事编辑，擅长检查长篇小说规划的一致性和逻辑性。

你的任务是对完整的故事规划进行全面的一致性校验，找出所有潜在问题。

校验项目：
1. 钩子一致性：所有埋设的钩子是否都有对应的回收章节？是否有钩子计划在不存在的章节回收？
2. 伏笔一致性：所有埋设的伏笔是否都有对应的回收章节？埋设/回收配对是否完整？
3. 角色出场逻辑：是否有角色在死亡/离场后又出现？新角色首次出场是否合理？
4. 主线覆盖：主线的里程碑事件是否都被章节目标覆盖？主线的结局方向是否在最后几卷有铺垫？
5. 情绪节奏：是否有连续3章以上都是高潮？是否有连续5章以上都是低谷？开篇和结尾章节的情绪是否合适？
6. 爽点分布：爽点间隔是否合理（不能太密也不能太稀）？爽点类型是否多样？
7. 冲突递进：卷与卷之间的冲突是否有升级？是否有冲突重复？`;

    const prompt = `请检查以下完整的故事规划，找出所有一致性问题。

${planSummary}

请以JSON格式返回校验结果：
{
  "overallScore": 8,
  "passed": true,
  "summary": "整体规划质量评估",
  "issues": [
    {
      "type": "hook/foreshadow/character/mainline/emotion/pleasure/conflict",
      "severity": "critical/high/medium/low",
      "description": "问题描述",
      "chapters": [3, 45],
      "suggestion": "修复建议"
    }
  ],
  "hookStatus": {
    "total": 45,
    "resolved": 42,
    "unresolved": ["未回收钩子1", "未回收钩子2"]
  },
  "emotionRhythm": {
    "climaxDensity": "合理/过密/过疏",
    "breathingSpacing": "合理/过密/过疏",
    "issues": ["连续高潮：第10-13章"]
  }
}

评分标准：
- 9-10分：完美规划，无任何问题
- 7-8分：良好规划，有少量小问题
- 5-6分：一般规划，有中等问题需要修复
- 3-4分：较差规划，有严重问题
- 1-2分：不可用，需要重新规划

passed = overallScore >= 6`;

    const result = await this.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 2000 });
    return this.parseJson(result);
  }

  private async executeWritingPhase(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;
    const draftCount = Math.max(1, Math.min(config.autoDraftChapters || 3, 3));

    try {
      await this.updateJobProgress(jobId, "writing", "chapter_drafts");
      const chapters = await this.generateInitialChapterDrafts(jobId, job.novelId, config, draftCount);
      await this.savePhaseResult(jobId, "writing", "chapter_drafts", {
        imitationPlanId: config.imitationPlanId,
        bookAnalysisId: config.bookAnalysisId,
        draftCount,
      }, { chapters });
      await this.saveToKnowledgeBase(job.novelId, "chapter_draft", "自动仿写样章", { chapters });

      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          currentPhase: "writing",
          currentStep: "completed",
          progress: 100,
        },
      });
    } catch (error: any) {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: {
          status: "error",
          currentPhase: "writing",
          currentStep: "chapter_drafts",
          lastError: error.message || "自动仿写正文失败。",
        },
      });
    }
  }

  private async generateInitialChapterDrafts(jobId: string, novelId: string, config: PipelineConfig, count: number) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { chapters: { orderBy: { order: "asc" } } },
    });
    if (!novel) throw new Error("作品不存在");

    const pipelineVersion = config.pipelineVersion || 1;

    const [plan, outlineResult, chapterOutlineResult, workspaceContext, styleProfile] = await Promise.all([
      config.imitationPlanId
        ? prisma.imitationPlan.findFirst({ where: { id: config.imitationPlanId, novelId } })
        : Promise.resolve(null),
      prisma.phaseResult.findUnique({
        where: { jobId_phase_step: { jobId, phase: pipelineVersion >= 2 ? "outline" : "planning", step: "outline" } },
      }),
      // 新流程从 planning 阶段读取章纲，旧流程从 structuring 阶段读取
      pipelineVersion >= 2
        ? prisma.phaseResult.findUnique({
            where: { jobId_phase_step: { jobId, phase: "planning", step: "chapter_outline_vol_1" } },
          })
        : prisma.phaseResult.findUnique({
            where: { jobId_phase_step: { jobId, phase: "structuring", step: "chapter_outline" } },
          }),
      this.buildWorkspaceAssetContext(novelId, jobId),
      prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } }),
    ]);

    const blueprint = this.safeJson(plan?.blueprint, {});
    const chapterTemplate = this.safeJson(plan?.chapterTemplate, {});
    const sampleDrafts = this.safeJson(plan?.sampleDrafts, []);
    const outline = outlineResult ? this.parseJson(outlineResult.output) : {};
    const chapterOutline = chapterOutlineResult ? this.parseJson(chapterOutlineResult.output) : {};
    const enhancedFields = styleProfile ? this.safeJson(styleProfile.customRules, {}) : {};
    const style = styleProfile ? {
      name: styleProfile.name,
      description: styleProfile.description,
      ...enhancedFields,
    } : {};

    // 新流程：从 planning 阶段加载所有卷的富化章纲
    let enrichedChaptersMap: Map<number, any> = new Map();
    if (pipelineVersion >= 2) {
      const volumeCount = config.volumeCount || 5;
      let globalOrder = 1;
      for (let v = 1; v <= volumeCount; v++) {
        const volRes = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "planning", step: `chapter_outline_vol_${v}` } },
        });
        if (volRes) {
          const parsed = this.parseJson(volRes.output);
          for (const ch of (parsed?.chapters || [])) {
            enrichedChaptersMap.set(globalOrder, ch);
            globalOrder++;
          }
        }
      }
    }

    const chapterCards = this.resolveChapterCards(chapterTemplate, chapterOutline, count);
    const previousChapters: Array<{ order: number; title: string; content: string }> = [];
    const generated = [];

    for (let index = 0; index < count; index += 1) {
      const order = index + 1;
      const card = chapterCards[index] ?? {};
      const baseTitle = card.title || card.chapterTitle || `第${order}章`;
      const title = await this.resolveGeneratedChapterTitle({
        novel,
        outline,
        blueprint,
        card,
        order,
        baseTitle,
      });
      const summary = [
        card.goal ? `目标：${card.goal}` : "",
        card.function ? `功能：${card.function}` : "",
        card.conflict ? `冲突：${card.conflict}` : "",
        card.hook ? `钩子：${card.hook}` : "",
      ].filter(Boolean).join("\n") || `基于仿写方案生成第 ${order} 章。`;

      const existing = await prisma.chapter.findUnique({
        where: { novelId_order: { novelId, order } },
      });
      if (existing?.content?.trim() && !config.overwriteExistingChapters) {
        previousChapters.push({ order, title: existing.title, content: existing.content.slice(0, 1200) });
        generated.push({
          ...existing,
          skipped: true,
          skipReason: "existing_content",
        });
        continue;
      }

      const chapter = existing ?? await prisma.chapter.create({
        data: {
          novelId,
          order,
          title,
          summary,
          status: "planned",
          source: "imitation_pipeline",
        },
      });
      if (existing) {
        await prisma.chapter.update({
          where: { id: existing.id },
          data: { title, summary, source: "imitation_pipeline" },
        });
      }

      const draft = await this.generateChapterDraft({
        novel,
        outline,
        blueprint,
        chapterTemplate,
        sampleDrafts,
        card,
        style,
        order,
        title,
        summary,
        previousChapters,
        workspaceContext,
        targetWordCount: config.targetWordCount || 1800,
        enrichedChapter: enrichedChaptersMap.get(order),
      });

      const updated = await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          title,
          summary,
          content: draft,
          wordCount: this.countWords(draft),
          status: "drafted",
          source: config.imitationPlanId ? "imitation_pipeline" : "pipeline",
        },
      });
      previousChapters.push({ order, title, content: draft.slice(0, 1200) });
      generated.push(updated);
    }

    return generated;
  }

  private async generateChapterDraft(input: {
    novel: { title: string; inspiration?: string | null; outline?: string | null; genre?: string | null };
    outline: any;
    blueprint: any;
    chapterTemplate: any;
    sampleDrafts: any[];
    card: any;
    style: any;
    order: number;
    title: string;
    summary: string;
    previousChapters: Array<{ order: number; title: string; content: string }>;
    workspaceContext: string;
    targetWordCount: number;
    enrichedChapter?: any; // 富化章纲数据（新流程）
  }) {
    // 构建风格约束文本
    const styleLines: string[] = [];
    if (input.style && Object.keys(input.style).length > 0) {
      const s = input.style;
      if (s.toneAndAtmosphere) styleLines.push(`基调氛围：${s.toneAndAtmosphere}`);
      if (s.emotionalRhythm) styleLines.push(`情绪节奏：${s.emotionalRhythm}`);
      if (s.contrastPatterns) styleLines.push(`反差设计：${s.contrastPatterns}`);
      if (s.humorStyle && s.humorStyle !== "无") styleLines.push(`幽默方式：${s.humorStyle}`);
      if (s.tensionTechniques) styleLines.push(`紧张感技巧：${s.tensionTechniques}`);
      if (s.suspenseTechniques) styleLines.push(`悬念技巧：${s.suspenseTechniques}`);
      if (s.sentenceRhythm) styleLines.push(`句式节奏：${s.sentenceRhythm}`);
      if (s.dialogueStyle) styleLines.push(`对话风格：${s.dialogueStyle}`);
      if (s.chapterOpeningStyle) styleLines.push(`开篇方式：${s.chapterOpeningStyle}`);
      if (s.chapterEndingStyle) styleLines.push(`收尾方式：${s.chapterEndingStyle}`);
      if (Array.isArray(s.writingRules) && s.writingRules.length) {
        styleLines.push(`写作规则：${s.writingRules.join("；")}`);
      }
      if (Array.isArray(s.avoidList) && s.avoidList.length) {
        styleLines.push(`必须避免：${s.avoidList.join("；")}`);
      }
    }
    const styleBlock = styleLines.length > 0
      ? `\n${styleLines.join("\n")}\n`
      : "";

    // 提取人物卡信息
    const characters = this.extractCharacterCards(input.workspaceContext);
    const characterBlock = characters || "";

    // 提取大纲核心信息
    const outlineCore = this.extractOutlineCore(input.outline);

    const system = `你是一位顶级中文网络小说作家，擅长写出让读者欲罢不能的故事。

你的写作铁律：
1. 禁止使用任何 AI 味词汇：不禁、不由得、宛如、仿佛、似乎在诉说、一缕、一抹、一丝、缓缓、淡淡地、静静地、默默地、轻轻地
2. 禁止用「他心想」「她暗想」开头的大段内心独白，用行动和对话展现人物内心
3. 禁止用「突然」作为转折词，用具体的感官描写制造意外感
4. 禁止大段旁白式设定解释，设定融入对话和行动中自然展现
5. 对话必须像真人说话：有口头禅、有停顿、有未说完的话、有答非所问
6. 每个角色说话方式必须不同：粗人说粗话、文人引经据贵、小孩用短句
7. 情节推进靠人物动机驱动，不是靠作者安排，每个人做事都要有理由
8. 描写具体化：不说「他很生气」，说「他攥紧拳头，指节发白，咬肌鼓起」
9. 场景描写要有功能性：推动情节、揭示人物、制造氛围，三选一，否则删掉
10. 章末必须留钩子，让读者想看下一章`;

    const prompt = `请为「${input.novel.title}」写第${input.order}章的完整正文。

【故事核心 — 你的所有描写必须围绕这个核心展开】
${outlineCore}

${characterBlock}

【本章任务】
章节标题：${input.title}
章节目标：${input.summary}

${styleBlock}

${this.buildEnrichedChapterBlock(input.enrichedChapter)}

【前文衔接】
${input.previousChapters.length
  ? input.previousChapters.map((chapter) => `第${chapter.order}章 ${chapter.title}（摘要）：${chapter.content.slice(0, 600)}`).join("\n\n")
  : "这是开篇第一章，需要快速建立人物、冲突和世界观。"}

【写作要求】
1. 输出纯正文，不要 Markdown 标记，不要提纲，不要解释
2. 目标字数：约 ${input.targetWordCount} 中文字
3. 场景转换用空行分隔，不要用「场景一」「场景二」这样的标记
4. 对话用引号「」标注，不要用 ""
5. 第一章必须在前 300 字内建立冲突或悬念，不要用风景描写开头
6. 每段不超过 4 行，保持阅读节奏

请开始写作：`;

    const result = await this.llmService.completeText({
      system,
      prompt,
      temperature: 0.78,
      maxTokens: Math.max(2000, Math.min(4500, Math.round(input.targetWordCount * 2))),
    });

    return result?.trim() || this.buildFallbackChapterDraft(input);
  }

  /**
   * 构建富化章纲的 prompt 区块
   */
  private buildEnrichedChapterBlock(enriched: any): string {
    if (!enriched) return "";

    const parts: string[] = [];
    parts.push("【本章详细规划 — 必须严格遵守】");

    // 出场角色
    if (Array.isArray(enriched.characters) && enriched.characters.length > 0) {
      const charDesc = enriched.characters.map((c: any) =>
        `${c.name}（目标：${c.goal || "无"}，行动：${c.action || "无"}）`
      ).join("、");
      parts.push(`出场角色：${charDesc}`);
    }

    // 本章埋设的钩子
    if (Array.isArray(enriched.hooksPlanted) && enriched.hooksPlanted.length > 0) {
      const hooksDesc = enriched.hooksPlanted.map((h: any) =>
        `「${h.title}」（类型：${h.type}，强度：${h.intensity}，计划第${h.plannedResolveChapter || "?"}章揭示）：${h.description || ""}`
      ).join("\n  ");
      parts.push(`本章埋设钩子：\n  ${hooksDesc}`);
    }

    // 本章回收的钩子
    if (Array.isArray(enriched.hooksResolved) && enriched.hooksResolved.length > 0) {
      const resolvedDesc = enriched.hooksResolved.map((h: any) =>
        `「${h.title}」：${h.resolvedDescription || ""}`
      ).join("、");
      parts.push(`本章回收钩子：${resolvedDesc}`);
    }

    // 本章埋设的伏笔
    if (Array.isArray(enriched.foreshadowPlanted) && enriched.foreshadowPlanted.length > 0) {
      const fsDesc = enriched.foreshadowPlanted.map((f: any) =>
        `「${f.title}」（计划第${f.plannedPayoffChapter || "?"}章回收）：${f.description || ""}`
      ).join("\n  ");
      parts.push(`本章埋设伏笔：\n  ${fsDesc}`);
    }

    // 本章回收的伏笔
    if (Array.isArray(enriched.foreshadowPayoff) && enriched.foreshadowPayoff.length > 0) {
      const payoffDesc = enriched.foreshadowPayoff.map((f: any) =>
        `「${f.title}」：${f.payoffDescription || ""}`
      ).join("、");
      parts.push(`本章回收伏笔：${payoffDesc}`);
    }

    // 爽点设计
    if (enriched.pleasurePoint && typeof enriched.pleasurePoint === "object") {
      const pp = enriched.pleasurePoint;
      parts.push(`爽点设计：${pp.description || "无"}（类型：${pp.type || "无"}，强度：${pp.intensity || 5}）`);
    }

    // 情绪曲线
    if (enriched.emotionData && typeof enriched.emotionData === "object") {
      const ed = enriched.emotionData;
      const tags: string[] = [];
      if (ed.isClimax) tags.push("高潮章");
      if (ed.isTurningPoint) tags.push("转折章");
      if (ed.isBreathing) tags.push("呼吸章");
      parts.push(`情绪曲线：${ed.emotionType || "neutral"}（强度：${ed.intensity || 5}）${tags.length ? " [" + tags.join(",") + "]" : ""}`);
    }

    return parts.length > 1 ? parts.join("\n") + "\n" : "";
  }

  // 从 workspaceContext 中提取人物卡信息
  private extractCharacterCards(workspaceContext: string): string {
    if (!workspaceContext) return "";
    const lines = workspaceContext.split("\n");
    const charLines: string[] = [];
    let inCharSection = false;
    for (const line of lines) {
      if (line.includes("人物卡") || line.includes("## 人物")) {
        inCharSection = true;
        continue;
      }
      if (inCharSection && line.startsWith("## ")) {
        break;
      }
      if (inCharSection && line.startsWith("- ")) {
        charLines.push(line.slice(2));
      }
    }
    if (charLines.length === 0) return "";
    return `【人物卡 — 写作时必须保持人物性格一致】\n${charLines.map(c => `· ${c}`).join("\n")}`;
  }

  // 从大纲中提取核心信息
  private extractOutlineCore(outline: any): string {
    if (!outline || typeof outline !== "object") return "暂无大纲信息。";
    const parts: string[] = [];
    if (outline.theme) parts.push(`主题：${outline.theme}`);
    if (outline.coreSetting) parts.push(`核心设定：${outline.coreSetting}`);
    if (outline.mainConflict) parts.push(`主要冲突：${outline.mainConflict}`);
    if (outline.protagonist) {
      const p = outline.protagonist;
      parts.push(`主角：${p.name || "未命名"}，${p.identity || ""}，目标：${p.goal || ""}，成长线：${p.growth || ""}`);
    }
    if (outline.antagonist) {
      const a = outline.antagonist;
      parts.push(`对手：${a.name || "未命名"}，${a.identity || ""}，动机：${a.motivation || ""}`);
    }
    if (outline.plotStructure) {
      const ps = outline.plotStructure;
      if (ps.beginning) parts.push(`开篇：${ps.beginning}`);
      if (ps.development) parts.push(`发展：${ps.development}`);
      if (ps.climax) parts.push(`高潮：${ps.climax}`);
      if (ps.resolution) parts.push(`结局：${ps.resolution}`);
    }
    return parts.join("\n") || "暂无大纲信息。";
  }

  private async resolveGeneratedChapterTitle(input: {
    novel: { title: string; genre?: string | null };
    outline: any;
    blueprint: any;
    card: any;
    order: number;
    baseTitle: string;
  }) {
    const genericTitlePattern = /^第[一二三四五六七八九十百千万\d]+章$/;
    if (input.baseTitle && !genericTitlePattern.test(input.baseTitle.trim())) {
      return input.baseTitle.trim();
    }

    const prompt = [
      "请为当前小说章节生成一个有吸引力的中文章节标题。",
      "要求：5-15个字，不要包含“第X章”，不要使用书名号，不要解释。",
      "",
      `作品：${input.novel.title}`,
      `类型：${input.novel.genre || input.outline.genre || input.blueprint.genre || "未指定"}`,
      `章节序号：第${input.order}章`,
      "【本章功能卡】",
      JSON.stringify(input.card || {}, null, 2),
      "【创作蓝图】",
      JSON.stringify(input.blueprint || input.outline || {}, null, 2).slice(0, 1600),
    ].join("\n");

    try {
      const result = await this.llmService.completeText({
        prompt,
        temperature: 0.72,
        maxTokens: 80,
      });
      const title = result?.trim().replace(/^["'《“”]+|["'》“”]+$/g, "").replace(/^第[一二三四五六七八九十百千万\d]+章[:：\s-]*/, "");
      return title || input.baseTitle || `第${input.order}章`;
    } catch {
      return input.baseTitle || `第${input.order}章`;
    }
  }

  private resolveChapterCards(chapterTemplate: any, chapterOutline: any, count: number) {
    const templateChapters = Array.isArray(chapterTemplate?.volumes)
      ? chapterTemplate.volumes.flatMap((volume: any) => Array.isArray(volume.chapters) ? volume.chapters : [])
      : [];
    const outlineChapters = Array.isArray(chapterOutline?.chapterOutlines)
      ? chapterOutline.chapterOutlines.flatMap((volume: any) => Array.isArray(volume.chapters) ? volume.chapters : [])
      : [];
    return [...templateChapters, ...outlineChapters].slice(0, count);
  }

  private buildFallbackChapterDraft(input: {
    novel: { title: string; genre?: string | null };
    order: number;
    title: string;
    summary: string;
    previousChapters: Array<{ order: number; title: string; content: string }>;
  }) {
    const lead = input.previousChapters.length
      ? "前一章留下的线索还没有冷却，新的压力已经压到门前。"
      : "天色还未亮，旧局已经先一步醒来。";
    return [
      `第${input.order}章 ${input.title}`,
      "",
      lead,
      "",
      `这一章围绕「${input.summary}」展开。主角没有直接冲撞命运，而是先确认手里还剩下什么筹码：能问的人、能查的物、能利用的规则，以及必须付出的代价。`,
      "",
      "她把所有情绪都压在沉默下面，只留下最具体的问题。谁在说谎，谁怕被牵连，哪一条规矩看似铁板一块，其实留下了可以落脚的缝隙。",
      "",
      "到章末，她得到的不是彻底胜利，而是一口来之不易的喘息。也正因为这口喘息，下一场更大的试探有了入口。",
    ].join("\n");
  }

  private safeJson(value: string | null | undefined, fallback: any) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  private countWords(content: string) {
    return content.replace(/\s/g, "").length;
  }

  private formatNovelOutline(outline: any) {
    return [
      `# ${outline.title || "故事大纲"}`,
      "",
      outline.genre ? `类型：${outline.genre}` : "",
      outline.theme ? `主题：${outline.theme}` : "",
      outline.hook ? `开篇钩子：${outline.hook}` : "",
      outline.coreSetting ? `核心设定：${outline.coreSetting}` : "",
      outline.mainConflict ? `主要冲突：${outline.mainConflict}` : "",
      "",
      "## 主角",
      outline.protagonist ? JSON.stringify(outline.protagonist, null, 2) : "",
      "",
      "## 反派",
      outline.antagonist ? JSON.stringify(outline.antagonist, null, 2) : "",
      "",
      "## 剧情结构",
      outline.plotStructure ? JSON.stringify(outline.plotStructure, null, 2) : "",
      "",
      "## 亮点",
      ...(Array.isArray(outline.highlights) ? outline.highlights.map((item: string) => `- ${item}`) : []),
    ].filter(Boolean).join("\n");
  }

  private buildFallbackWorldview(outline: any) {
    return {
      name: `${outline.genre || "当前作品"}世界观`,
      summary: outline.coreSetting || outline.theme || "围绕当前作品主线建立的基础世界观。",
      rules: outline.mainConflict || "世界规则必须为人物选择、案件推进、资源争夺和情感冲突服务。",
      geography: "以主角当前活动区域为核心，逐步扩展王府、京城、朝堂、边境等关键场景。",
      factions: "主角阵营、男主势力、反派家族、朝堂官僚、民间线索网络。",
      history: "前史围绕旧案、家族利益和权力更替展开，作为后续伏笔来源。",
      powerSystem: "现实制度、身份等级、医学/验尸知识、权谋资源共同构成冲突系统。",
      specialElements: ["身份压迫", "专业知识降维", "案件证据链", "权谋反转"],
    };
  }

  private buildFallbackStyle(outline: any, config: PipelineConfig) {
    return {
      name: `${outline.genre || config.genre || "默认"}风格`,
      description: `服务于${outline.genre || config.genre || "当前类型"}的节奏型写法。`,
      toneAndAtmosphere: "快节奏推进，情绪有压迫感，关键时刻有释放。",
      emotionalRhythm: "三章一个小高潮，十章一个大高潮，紧张与舒缓交替。",
      contrastPatterns: "强弱反差：主角表面弱势实际有底牌；明暗对比：表面平静暗藏危机。",
      humorStyle: "无",
      tensionTechniques: "信息不对称：读者知道危险但角色不知道；限时压力制造紧迫感。",
      suspenseTechniques: "每章末尾留一个未解问题；关键信息分段揭露。",
      narrativePov: "third_person",
      tense: "past",
      pacing: "fast",
      sentenceRhythm: "短句为主制造紧张，长句铺垫制造氛围。",
      vocabularyLevel: "现代白话，避免生僻字。",
      dialogueStyle: "简洁有力，潜台词丰富。",
      chapterOpeningStyle: "直接进入冲突或悬念，不要大段铺垫。",
      chapterEndingStyle: "必须留钩子，让读者想看下一章。",
      writingRules: [
        "每章必须有一个情绪高点（爽点/泪点/笑点）。",
        "少解释设定，多用行动、证据、对话推进。",
        "专业判断必须给出可见证据，避免无根据开挂。",
      ],
      avoidList: [
        "不要用「他心想」开头的大段内心独白。",
        "不要用「突然」作为转折词。",
        "避免大段旁白式设定解释。",
      ],
    };
  }

  // 更新任务进度
  private async updateJobProgress(jobId: string, phase: string, step: string) {
    const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: {
        currentPhase: phase,
        currentStep: step,
        completedSteps: job.completedSteps + 1,
        progress: Math.round(((job.completedSteps + 1) / job.totalSteps) * 100),
      },
    });
  }

  // 保存阶段结果
  private async savePhaseResult(jobId: string, phase: string, step: string, input: any, output: any) {
    // AI自评
    const review = await this.selfReview(output, step);

    await prisma.phaseResult.upsert({
      where: { jobId_phase_step: { jobId, phase, step } },
      create: {
        jobId,
        phase,
        step,
        input: JSON.stringify(input),
        output: JSON.stringify(output),
        selfScore: review.score,
        selfComment: review.comment,
        issues: JSON.stringify(review.issues),
        status: "completed",
      },
      update: {
        input: JSON.stringify(input),
        output: JSON.stringify(output),
        selfScore: review.score,
        selfComment: review.comment,
        issues: JSON.stringify(review.issues),
        status: "completed",
      },
    });
  }

  // 保存生成结果到作品知识库
  private async saveToKnowledgeBase(novelId: string, category: string, title: string, content: any) {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await this.persistGeneratedAssets(novelId, category, content);

    // 查找是否已存在相同类型的知识
    const existing = await prisma.knowledgeAsset.findFirst({
      where: {
        novelId,
        category,
        title,
      },
    });

    let assetId: string;
    if (existing) {
      // 覆盖更新
      await prisma.knowledgeAsset.update({
        where: { id: existing.id },
        data: {
          content: contentStr,
          updatedAt: new Date(),
        },
      });
      assetId = existing.id;
    } else {
      // 新增
      const created = await prisma.knowledgeAsset.create({
        data: {
          novelId,
          title,
          category,
          content: contentStr,
          tags: `auto-generated,${category}`,
        },
      });
      assetId = created.id;
    }

    const memory = await prisma.memory.create({
      data: {
        novelId,
        type: category.includes("character") ? "character" : category.includes("world") ? "world" : category.includes("style") ? "style" : "plot",
        category: `pipeline:${category}`,
        title,
        content: contentStr,
        importance: category === "outline" || category === "chapter_draft" ? 8 : 7,
        metadata: JSON.stringify({ source: "pipeline", category }),
      },
    });

    // fire-and-forget RAG ingest for both knowledge asset and memory
    const ragService = getRagIngestService();
    if (ragService) {
      ragService.ingestText({
        ownerType: "knowledge_asset",
        ownerId: assetId,
        novelId,
        text: contentStr,
      }).catch(console.error);
      ragService.ingestText({
        ownerType: "memory",
        ownerId: memory.id,
        novelId,
        text: contentStr,
      }).catch(console.error);
    }
  }

  async materializePipelineResults(novelId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { novelId },
      include: { phaseResults: true },
    });
    if (!job) {
      throw new Error("该作品还没有自动创作流程。");
    }

    const categoryByStep: Record<string, { category: string; title: string }> = {
      outline: { category: "outline", title: "故事大纲" },
      worldview: { category: "worldview", title: "世界观设定" },
      characters: { category: "character", title: "人物设定" },
      style: { category: "style", title: "写作风格" },
      volume: { category: "volume", title: "卷纲规划" },
      chapter_outline: { category: "chapter_outline", title: "章纲规划" },
      mainline_hook: { category: "mainline_hook", title: "主线钩子" },
      chapter_drafts: { category: "chapter_draft", title: "自动仿写样章" },
    };

    for (const result of job.phaseResults) {
      const target = categoryByStep[result.step];
      if (!target) continue;
      const output = this.parseJson(result.output);
      await this.persistGeneratedAssets(novelId, target.category, output);
    }

    return { novelId, materializedAt: new Date().toISOString() };
  }

  private async persistGeneratedAssets(novelId: string, category: string, content: any) {
    try {
      if (category === "outline" && content && Object.keys(content).length) {
        await prisma.novel.update({
          where: { id: novelId },
          data: {
            genre: content.genre || undefined,
            outline: this.formatNovelOutline(content),
          },
        });
      }

      if (category === "worldview" && content?.name) {
        await prisma.worldview.upsert({
          where: { novelId_name: { novelId, name: content.name } },
          create: {
            novelId,
            name: content.name,
            summary: content.summary || "",
            rules: content.rules || "",
            geography: content.geography || "",
            factions: content.factions || "",
            history: content.history || "",
            powerSystem: typeof content.powerSystem === "string" ? content.powerSystem : JSON.stringify(content.powerSystem || {}),
          },
          update: {
            summary: content.summary || "",
            rules: content.rules || "",
            geography: content.geography || "",
            factions: content.factions || "",
            history: content.history || "",
            powerSystem: typeof content.powerSystem === "string" ? content.powerSystem : JSON.stringify(content.powerSystem || {}),
          },
        });
      }

      if (category === "worldview" && !content?.name) {
        const novel = await prisma.novel.findUnique({ where: { id: novelId } });
        const fallback = this.buildFallbackWorldview({
          genre: novel?.genre,
          coreSetting: novel?.outline,
          mainConflict: novel?.outline,
        });
        await this.persistGeneratedAssets(novelId, "worldview", fallback);
      }

      if (category === "style") {
        const style = content && Object.keys(content).length
          ? content
          : this.buildFallbackStyle({}, {});
        const existing = await prisma.styleProfile.findFirst({
          where: { novelId, isDefault: true },
        });
        // 将增强风格字段存入 customRules
        const enhancedStyle = {
          toneAndAtmosphere: style.toneAndAtmosphere || "",
          emotionalRhythm: style.emotionalRhythm || "",
          contrastPatterns: style.contrastPatterns || "",
          humorStyle: style.humorStyle || "",
          tensionTechniques: style.tensionTechniques || "",
          suspenseTechniques: style.suspenseTechniques || "",
          sentenceRhythm: style.sentenceRhythm || "",
          dialogueStyle: style.dialogueStyle || "",
          chapterOpeningStyle: style.chapterOpeningStyle || "",
          chapterEndingStyle: style.chapterEndingStyle || "",
          writingRules: Array.isArray(style.writingRules) ? style.writingRules : [],
          avoidList: Array.isArray(style.avoidList) ? style.avoidList : [],
        };
        const data = {
          name: style.name || "默认写作风格",
          description: style.description || "由自动创作流程生成的默认风格。",
          narrativePov: style.narrativePov || "third_person",
          tense: style.tense || "past",
          pacing: style.pacing || "balanced",
          sentenceLength: style.sentenceRhythm || style.sentenceLength || "mixed",
          vocabulary: style.vocabularyLevel || style.vocabulary || "modern",
          dialogueRatio: style.dialogueStyle ? "balanced" : (style.dialogueRatio || "balanced"),
          emotionIntensity: style.emotionIntensity || "medium",
          humorLevel: style.humorStyle ? "medium" : (style.humorLevel || "low"),
          customRules: JSON.stringify(enhancedStyle),
          isDefault: true,
        };
        if (existing) {
          await prisma.styleProfile.update({ where: { id: existing.id }, data });
        } else {
          await prisma.styleProfile.create({ data: { novelId, ...data } });
        }
      }

      if (category === "character" && Array.isArray(content?.characters)) {
        for (const character of content.characters.slice(0, 12)) {
          if (!character?.name) continue;
          await prisma.character.upsert({
            where: { novelId_name: { novelId, name: character.name } },
            create: {
              novelId,
              name: character.name,
              role: character.role || "",
              identity: character.identity || "",
              motivation: character.motivation || "",
              appearance: character.appearance || "",
              background: character.background || "",
              relationsText: character.relationsText || "",
              arcSummary: character.arc || character.personality || "",
            },
            update: {
              role: character.role || "",
              identity: character.identity || "",
              motivation: character.motivation || "",
              appearance: character.appearance || "",
              background: character.background || "",
              relationsText: character.relationsText || "",
              arcSummary: character.arc || character.personality || "",
            },
          });
        }
      }

      if (category === "volume" && Array.isArray(content?.volumes)) {
        for (const [index, volume] of content.volumes.entries()) {
          await prisma.volume.upsert({
            where: { novelId_sortOrder: { novelId, sortOrder: index + 1 } },
            create: {
              novelId,
              sortOrder: index + 1,
              title: volume.title || `第${index + 1}卷`,
              goal: volume.goal || "",
              conflict: volume.conflict || "",
              emotion: volume.emotion || "",
              newChars: JSON.stringify(volume.newChars || []),
              mapName: volume.mapName || "",
              endHook: volume.endHook || "",
            },
            update: {
              title: volume.title || `第${index + 1}卷`,
              goal: volume.goal || "",
              conflict: volume.conflict || "",
              emotion: volume.emotion || "",
              newChars: JSON.stringify(volume.newChars || []),
              mapName: volume.mapName || "",
              endHook: volume.endHook || "",
            },
          });
        }
      }

      if (category === "chapter_outline" && Array.isArray(content?.chapterOutlines)) {
        let globalOrder = 1;
        for (const [volumeIndex, group] of content.chapterOutlines.entries()) {
          const volume = await prisma.volume.findFirst({
            where: { novelId, sortOrder: volumeIndex + 1 },
          }) ?? await prisma.volume.create({
            data: { novelId, sortOrder: volumeIndex + 1, title: `第${volumeIndex + 1}卷` },
          });
          for (const chapter of (group.chapters || []).slice(0, 30)) {
            await prisma.chapterOutline.upsert({
              where: { novelId_sortOrder: { novelId, sortOrder: globalOrder } },
              create: {
                novelId,
                volumeId: volume.id,
                sortOrder: globalOrder,
                title: chapter.title || `第${globalOrder}章`,
                goal: chapter.goal || "",
                conflict: chapter.conflict || "",
                emotion: chapter.emotion || "",
                hook: chapter.hook || "",
                pleasurePoint: chapter.pleasurePoint || "",
              },
              update: {
                volumeId: volume.id,
                title: chapter.title || `第${globalOrder}章`,
                goal: chapter.goal || "",
                conflict: chapter.conflict || "",
                emotion: chapter.emotion || "",
                hook: chapter.hook || "",
                pleasurePoint: chapter.pleasurePoint || "",
              },
            });
            globalOrder += 1;
          }
        }
      }

      if (category === "mainline_hook") {
        for (const [index, mainline] of (content?.mainlines || []).entries()) {
          await prisma.mainline.create({
            data: {
              novelId,
              title: mainline.title || `主线${index + 1}`,
              description: mainline.description || "",
              sortOrder: index + 1,
              priority: 8,
            },
          });
        }
        for (const hook of (content?.hooks || []).slice(0, 20)) {
          await prisma.hook.create({
            data: {
              novelId,
              title: hook.title || "未命名钩子",
              description: hook.description || "",
              type: hook.type || "suspense",
              intensity: Math.max(1, Math.min(10, Number(hook.intensity || 5))),
              status: "active",
            },
          });
        }
      }
    } catch (error) {
      console.warn("持久化 Pipeline 结构化资产失败:", error);
    }
  }

  private async buildWorkspaceAssetContext(novelId: string, jobId?: string): Promise<string> {
    const [
      novel,
      characters,
      worldviews,
      volumes,
      mainlines,
      hooks,
      memories,
      assets,
    ] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId } }),
      prisma.character.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 12 }),
      prisma.worldview.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 4 }),
      prisma.volume.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
        include: { chapterOutlines: { orderBy: { sortOrder: "asc" }, take: 6 } },
        take: 3,
      }),
      prisma.mainline.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 6 }),
      prisma.hook.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 8 }),
      prisma.memory.findMany({ where: { novelId }, orderBy: [{ importance: "desc" }, { updatedAt: "desc" }], take: 12 }),
      prisma.knowledgeAsset.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 10 }),
    ]);

    const usageItems: Array<{ assetType: string; assetId: string; title: string }> = [];
    const lines: string[] = ["【当前作品已入库资产】"];
    if (novel?.outline?.trim()) {
      lines.push("## 当前作品大纲", novel.outline.trim());
      usageItems.push({ assetType: "novel_outline", assetId: novel.id, title: `${novel.title}/作品大纲` });
    }
    if (characters.length) {
      lines.push("## 人物卡");
      for (const character of characters) {
        lines.push(`- ${character.name}：${[character.role, character.identity, character.motivation, character.arcSummary].filter(Boolean).join(" / ")}`);
        usageItems.push({ assetType: "character", assetId: character.id, title: character.name });
      }
    }
    if (worldviews.length) {
      lines.push("## 世界观");
      for (const worldview of worldviews) {
        lines.push(`- ${worldview.name}：${[worldview.summary, worldview.rules, worldview.powerSystem].filter(Boolean).join(" / ")}`);
        usageItems.push({ assetType: "worldview", assetId: worldview.id, title: worldview.name });
      }
    }
    if (volumes.length) {
      lines.push("## 卷纲与章纲");
      for (const volume of volumes) {
        lines.push(`- ${volume.title}：${[volume.goal, volume.conflict, volume.endHook].filter(Boolean).join(" / ")}`);
        usageItems.push({ assetType: "volume", assetId: volume.id, title: volume.title });
        for (const chapter of volume.chapterOutlines) {
          lines.push(`  - 第${chapter.sortOrder}章 ${chapter.title}：${[chapter.goal, chapter.conflict, chapter.hook].filter(Boolean).join(" / ")}`);
          usageItems.push({ assetType: "chapter_outline", assetId: chapter.id, title: chapter.title });
        }
      }
    }
    if (mainlines.length) {
      lines.push("## 主线");
      for (const mainline of mainlines) {
        lines.push(`- ${mainline.title}：${mainline.description || ""}`);
        usageItems.push({ assetType: "mainline", assetId: mainline.id, title: mainline.title });
      }
    }
    if (hooks.length) {
      lines.push("## 钩子");
      for (const hook of hooks) {
        lines.push(`- ${hook.title}：${hook.description || ""}（状态：${hook.status}，计划：${hook.plannedChapter ?? "未定"}，回收：${hook.resolvedChapter ?? "未定"}）`);
        usageItems.push({ assetType: "hook", assetId: hook.id, title: hook.title });
      }
    }
    if (memories.length) {
      lines.push("## 高优先级记忆");
      for (const memory of memories) {
        lines.push(`- ${memory.title}：${memory.content.slice(0, 260)}`);
        usageItems.push({ assetType: "memory", assetId: memory.id, title: memory.title });
      }
    }
    if (assets.length) {
      lines.push("## 知识库资产");
      for (const asset of assets) {
        lines.push(`- ${asset.title} [${asset.category}]：${asset.content.slice(0, 260)}`);
        usageItems.push({ assetType: "knowledge_asset", assetId: asset.id, title: asset.title });
      }
    }

    await this.recordAssetUsage(novelId, jobId, usageItems);
    return lines.length > 1 ? lines.join("\n") : "";
  }

  private async recordAssetUsage(
    novelId: string,
    jobId: string | undefined,
    items: Array<{ assetType: string; assetId: string; title: string }>,
    usageStage = "pipeline_context"
  ) {
    if (!jobId || !items.length) return;
    try {
      await prisma.assetUsageRecord.createMany({
        data: items.map((item) => ({
          novelId,
          pipelineJobId: jobId,
          assetType: item.assetType,
          assetId: item.assetId,
          title: item.title,
          usageStage,
        })),
      });
    } catch (error) {
      console.warn("记录资产使用失败:", error);
    }
  }

  private async buildBookAnalysisContext(novelId: string, config: PipelineConfig, jobId?: string): Promise<string> {
    if (!config.bookAnalysisId) return "";
    const analysis = await prisma.bookAnalysis.findFirst({
      where: {
        id: config.bookAnalysisId,
        bindings: { some: { novelId } },
      },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!analysis) return "";
    await this.recordAssetUsage(novelId, jobId, [{
      assetType: "book_analysis",
      assetId: analysis.id,
      title: analysis.title,
    }], "book_analysis_context");
    return [
      "【绑定拆书参考】",
      `标题：${analysis.title}`,
      `来源：${analysis.sourceTitle || analysis.title}`,
      ...analysis.sections.filter((section) => section.usedForImitation !== false).map((section) => [
        `### ${section.title}`,
        section.editedContent?.trim() || section.aiContent?.trim() || "暂无内容。",
      ].join("\n")),
    ].join("\n");
  }

  private async buildImitationPlanContext(novelId: string, config: PipelineConfig, jobId?: string): Promise<string> {
    if (!config.imitationPlanId) return "";
    const plan = await prisma.imitationPlan.findFirst({
      where: {
        id: config.imitationPlanId,
        novelId,
      },
    });
    if (!plan) return "";
    await this.recordAssetUsage(novelId, jobId, [{
      assetType: "imitation_plan",
      assetId: plan.id,
      title: plan.title,
    }], "imitation_plan_context");
    return [
      "【仿写方案】",
      `标题：${plan.title}`,
      "## 创作蓝图",
      plan.blueprint,
      "## 章节模板",
      plan.chapterTemplate,
      "## 8 分区仿写落点",
      plan.sectionPlans,
      "## 样章草稿",
      plan.sampleDrafts,
    ].join("\n");
  }

  // 解析JSON（带容错）
  private parseJson(text: string | null): any {
    if (!text) return {};
    try {
      // 尝试直接解析
      return JSON.parse(text);
    } catch {
      // 尝试提取JSON块
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch {}
      }
      
      // 尝试找到第一个{和最后一个}
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        try {
          return JSON.parse(text.substring(start, end + 1));
        } catch {}
      }

      console.error("JSON parse failed:", text.substring(0, 200));
      return {};
    }
  }

  // 获取流程状态
  async getStatus(jobId: string) {
    return prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { phaseResults: true },
    });
  }

  // 获取小说的流程状态
  async getNovelPipelineStatus(novelId: string) {
    return prisma.pipelineJob.findUnique({
      where: { novelId },
      include: { phaseResults: true },
    });
  }

  // 暂停流程
  async pausePipeline(jobId: string) {
    return prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused" },
    });
  }

  // 恢复流程
  async resumePipeline(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error("流程不存在");

    const config = job.config ? JSON.parse(job.config) : {};
    const pipelineVersion = config.pipelineVersion || 1;

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "running" },
    });

    if (pipelineVersion >= 2) {
      // 新流程：outline → assets → planning(卷纲 → 章纲 → 弧线) → consistency_check → writing
      if (job.currentPhase === "outline" && job.currentStep === "waiting_confirm") {
        this.executeAssetsPhase(jobId);
      } else if (job.currentPhase === "assets" && job.currentStep === "waiting_confirm") {
        this.executePlanningPhase_standalone(jobId);
      } else if (job.currentPhase === "planning" && job.currentStep === "waiting_confirm") {
        // 检查 planning 阶段的进度
        const phaseResults = await prisma.phaseResult.findMany({ where: { jobId, phase: "planning" } });
        const hasVolumeOutline = phaseResults.some(r => r.step === "volume_outline" && r.status === "confirmed");
        const hasChapterOutlines = phaseResults.some(r => r.step.startsWith("chapter_outline_vol_"));
        const hasStoryArcs = phaseResults.some(r => r.step === "story_arcs");

        if (!hasChapterOutlines && hasVolumeOutline) {
          // 卷纲已确认，但章纲未生成 → 生成章纲
          this.executeChapterOutlinesPhase(jobId);
        } else if (hasChapterOutlines && hasStoryArcs) {
          // 所有规划完成 → 进入一致性校验
          this.executeConsistencyCheckPhase(jobId);
        } else {
          // 卷纲未确认 → 重新生成卷纲
          this.executePlanningPhase_standalone(jobId);
        }
      } else if (job.currentPhase === "consistency_check" && job.currentStep === "waiting_confirm") {
        this.executeWritingPhase(jobId);
      } else {
        this.executePipeline(jobId);
      }
    } else {
      // 旧流程（legacy）
      if (job.currentPhase === "outline" && job.currentStep === "waiting_confirm") {
        this.executeAssetsPhase(jobId);
      } else if (job.currentPhase === "assets" && job.currentStep === "waiting_confirm") {
        this.executeVolumesPhase(jobId);
      } else if (job.currentPhase === "volumes" && job.currentStep === "waiting_confirm") {
        this.executeChapterOutlinePhase(jobId);
      } else if (job.currentPhase === "chapter_outline" && job.currentStep === "waiting_confirm") {
        this.executeWritingPhase(jobId);
      }
      // imitation 模式
      else if (job.currentPhase === "planning" && job.currentStep === "waiting_confirm") {
        this.executeStructuringPhase(jobId);
      } else if (job.currentPhase === "structuring" && job.currentStep === "waiting_confirm") {
        this.executeWritingPhase(jobId);
      } else {
        this.executePipeline(jobId);
      }
    }
    return job;
  }

  // 重新生成某步骤
  async regenerateStep(jobId: string, phase: string, step: string, userHint?: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) throw new Error("流程不存在");

    const config = JSON.parse(job.config) as PipelineConfig;

    // outline 可能来自不同阶段（standalone: "outline", imitation: "planning"）
    const outlinePhase = phase === "outline" ? "outline" : "planning";
    const outlineResult = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: outlinePhase, step: "outline" } },
    });
    const outline = outlineResult ? JSON.parse(outlineResult.output) : {};

    let output: any;
    const input = { outline, userHint };

    // 资产阶段（worldview/characters/style）可能在 "assets" 或 "planning" 或 "generation"
    const assetPhase = phase === "assets" ? "assets" : phase === "generation" ? "generation" : "planning";
    // 卷纲阶段可能在 "volumes" 或 "generation" 或 "structuring"
    const volPhase = phase === "volumes" ? "volumes" : phase === "generation" ? "generation" : "structuring";
    // 章纲阶段可能在 "chapter_outline" 或 "generation" 或 "structuring"
    const chPhase = phase === "chapter_outline" ? "chapter_outline" : phase === "generation" ? "generation" : "structuring";

    switch (step) {
      case "outline": {
        const knowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await this.generateOutline(job.novelId, job.novel.inspiration || "", knowledge, config, userHint);
        break;
      }
      case "worldview": {
        const wvKnowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await this.generateWorldview(job.novelId, outline, wvKnowledge, userHint);
        break;
      }
      case "characters": {
        const worldviewResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } },
        });
        const worldview = worldviewResult ? JSON.parse(worldviewResult.output) : {};
        const charKnowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await this.generateCharacters(job.novelId, outline, worldview, charKnowledge, userHint);
        break;
      }
      case "style":
        output = await this.generateStyle(job.novelId, outline, config, userHint);
        break;
      case "volume": {
        const [volWvRes, volCharRes, volStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "style" } } }),
        ]);
        const volWv = volWvRes ? JSON.parse(volWvRes.output) : {};
        const volChar = volCharRes ? JSON.parse(volCharRes.output) : {};
        const volStyle = volStyleRes ? JSON.parse(volStyleRes.output) : {};
        output = await this.generateVolumeOutline(job.novelId, outline, volWv, volChar, volStyle, config);
        break;
      }
      case "chapter_outline": {
        const volResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: volPhase, step: "volume" } },
        });
        const volumes = volResult ? JSON.parse(volResult.output) : {};
        const [chWvRes, chCharRes, chStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "style" } } }),
        ]);
        const chWv = chWvRes ? JSON.parse(chWvRes.output) : {};
        const chChar = chCharRes ? JSON.parse(chCharRes.output) : {};
        const chStyle = chStyleRes ? JSON.parse(chStyleRes.output) : {};
        output = await this.generateChapterOutlines(job.novelId, volumes, outline, chWv, chChar, chStyle, config);
        break;
      }
      case "mainline_hook": {
        const mhVolResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: volPhase, step: "volume" } },
        });
        const mhVolumes = mhVolResult ? JSON.parse(mhVolResult.output) : {};
        const [mhWvRes, mhCharRes, mhStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "style" } } }),
        ]);
        const mhWv = mhWvRes ? JSON.parse(mhWvRes.output) : {};
        const mhChar = mhCharRes ? JSON.parse(mhCharRes.output) : {};
        const mhStyle = mhStyleRes ? JSON.parse(mhStyleRes.output) : {};
        const mhKnowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await this.generateMainlinesAndHooks(job.novelId, outline, mhVolumes, mhWv, mhChar, mhStyle, mhKnowledge, userHint);
        break;
      }

      // ========== 新增步骤（全量规划先行架构） ==========
      case "volume_outline": {
        const [v2WvRes, v2CharRes, v2StyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "style" } } }),
        ]);
        const v2Wv = v2WvRes ? JSON.parse(v2WvRes.output) : {};
        const v2Char = v2CharRes ? JSON.parse(v2CharRes.output) : {};
        const v2Style = v2StyleRes ? JSON.parse(v2StyleRes.output) : {};
        output = await this.generateVolumeOutline(job.novelId, outline, v2Wv, v2Char, v2Style, config);
        // 重新持久化卷纲
        await this.persistGeneratedAssets(job.novelId, "volume", output);
        break;
      }

      case "story_arcs": {
        // 加载所有卷的章纲摘要
        const allChapterOutlines: any = { chapterOutlines: [] };
        const volumeCount = config.volumeCount || 5;
        for (let v = 1; v <= volumeCount; v++) {
          const volStep = `chapter_outline_vol_${v}`;
          const volRes = await prisma.phaseResult.findUnique({
            where: { jobId_phase_step: { jobId, phase: "planning", step: volStep } },
          });
          if (volRes) {
            const parsed = JSON.parse(volRes.output);
            allChapterOutlines.chapterOutlines.push({
              volumeIndex: v - 1,
              chapters: parsed?.chapters || [],
            });
          }
        }
        const saVolResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "planning", step: "volume_outline" } },
        });
        const saVolumes = saVolResult ? JSON.parse(saVolResult.output) : {};
        const [saWvRes, saCharRes, saStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "style" } } }),
        ]);
        const saWv = saWvRes ? JSON.parse(saWvRes.output) : {};
        const saChar = saCharRes ? JSON.parse(saCharRes.output) : {};
        const saStyle = saStyleRes ? JSON.parse(saStyleRes.output) : {};
        output = await this.generateStoryArcs(job.novelId, outline, allChapterOutlines, saVolumes, saWv, saChar, saStyle, config);
        await this.persistStoryArcs(job.novelId, output);
        break;
      }

      case "consistency": {
        // 重新加载所有规划数据做一致性校验
        const [cchOutlines, cchHooks, cchForeshadows, cchMainlines, cchPleasurePoints, cchEmotionCurves] = await Promise.all([
          prisma.chapterOutline.findMany({ where: { novelId: job.novelId }, orderBy: { sortOrder: "asc" } }),
          prisma.hook.findMany({ where: { novelId: job.novelId }, orderBy: { plannedChapter: "asc" } }),
          prisma.foreshadow.findMany({ where: { novelId: job.novelId }, orderBy: { plantChapter: "asc" } }),
          prisma.mainline.findMany({ where: { novelId: job.novelId }, orderBy: { sortOrder: "asc" } }),
          prisma.pleasurePoint.findMany({ where: { novelId: job.novelId }, orderBy: { chapterOrder: "asc" } }),
          prisma.emotionCurve.findMany({ where: { novelId: job.novelId }, orderBy: { chapterOrder: "asc" } }),
        ]);
        const cchPlanSummary = this.buildPlanSummaryForConsistency(
          cchOutlines, cchHooks, cchForeshadows, cchMainlines, cchPleasurePoints, cchEmotionCurves,
        );
        output = await this.generateConsistencyCheck(job.novelId, cchPlanSummary);
        break;
      }

      default:
        // 动态步骤名：chapter_outline_vol_N
        const volMatch = step.match(/^chapter_outline_vol_(\d+)$/);
        if (volMatch) {
          const volIndex = parseInt(volMatch[1]) - 1;
          const [eWvRes, eCharRes, eStyleRes] = await Promise.all([
            prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "worldview" } } }),
            prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "characters" } } }),
            prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "style" } } }),
          ]);
          const eWv = eWvRes ? JSON.parse(eWvRes.output) : {};
          const eChar = eCharRes ? JSON.parse(eCharRes.output) : {};
          const eStyle = eStyleRes ? JSON.parse(eStyleRes.output) : {};
          const eVolRes = await prisma.phaseResult.findUnique({
            where: { jobId_phase_step: { jobId, phase: "planning", step: "volume_outline" } },
          });
          const eVolumes = eVolRes ? JSON.parse(eVolRes.output) : {};
          // 构建前序卷摘要
          const eAllChapterOutlines: any = { chapterOutlines: [] };
          for (let v = 1; v < parseInt(volMatch[1]); v++) {
            const prevRes = await prisma.phaseResult.findUnique({
              where: { jobId_phase_step: { jobId, phase: "planning", step: `chapter_outline_vol_${v}` } },
            });
            if (prevRes) {
              eAllChapterOutlines.chapterOutlines.push({
                volumeIndex: v - 1,
                chapters: JSON.parse(prevRes.output)?.chapters || [],
              });
            }
          }
          const ePrevSummary = this.buildPreviousVolumeSummary(eAllChapterOutlines, volIndex);
          output = await this.generateEnrichedChapterOutlines(
            job.novelId, eVolumes, volIndex, outline, eWv, eChar, eStyle, ePrevSummary, config, userHint,
          );
          // 重新持久化该卷章纲
          await this.persistVolumeChapterData(job.novelId, volIndex, output?.chapters || [], eVolumes);
        } else {
          throw new Error(`不支持重新生成步骤: ${step}`);
        }
    }

    await this.savePhaseResult(jobId, phase, step, input, output);
    return output;
  }

  // 使用用户内容
  async useUserContent(jobId: string, phase: string, step: string, content: any) {
    await prisma.phaseResult.upsert({
      where: { jobId_phase_step: { jobId, phase, step } },
      create: {
        jobId,
        phase,
        step,
        input: JSON.stringify({ source: "user" }),
        output: JSON.stringify(content),
        status: "completed",
        confirmedByUser: true,
      },
      update: {
        output: JSON.stringify(content),
        status: "completed",
        confirmedByUser: true,
      },
    });
  }
}

export const pipelineService = new PipelineService();
