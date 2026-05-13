import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { knowledgeSearchService } from "./KnowledgeSearchService";

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

    // 创建或更新流程任务
    const job = await prisma.pipelineJob.upsert({
      where: { novelId },
      create: {
        novelId,
        status: "running",
        currentPhase: "planning",
        currentStep: "outline",
        config: JSON.stringify(config),
        totalSteps: 20,
      },
      update: {
        status: "running",
        currentPhase: "planning",
        currentStep: "outline",
        config: JSON.stringify(config),
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

    // 提取关键词用于知识库检索
    const keywords = knowledgeSearchService.extractKeywords(
      `${novel.title} ${novel.inspiration || ""} ${config.genre || ""}`
    );
    const knowledgeContext = [
      await knowledgeSearchService.buildContext(novelId, keywords),
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
    const charactersResult = await this.generateCharacters(novelId, outlineResult, worldviewResult);
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

  // 生成大纲
  private async generateOutline(novelId: string, inspiration: string, knowledge: string, config: PipelineConfig): Promise<any> {
    const prompt = `你是一位资深网文策划师。请根据以下创意，生成一份详细的小说大纲。

【创意】
${inspiration}

【类型】
${config.genre || "自动判断"}

【参考知识】
${knowledge || "无"}

请生成JSON格式的大纲：
{
  "title": "建议的完整标题",
  "genre": "具体类型",
  "theme": "核心主题",
  "hook": "开篇钩子",
  "coreSetting": "核心设定（金手指/特殊能力等）",
  "mainConflict": "主要冲突",
  "protagonist": {
    "name": "主角名",
    "identity": "身份",
    "goal": "目标",
    "growth": "成长线"
  },
  "antagonist": {
    "name": "反派名",
    "identity": "身份",
    "motivation": "动机"
  },
  "plotStructure": {
    "beginning": "开篇（前10%）",
    "development": "发展（10%-40%）",
    "climax": "高潮（40%-80%）",
    "resolution": "结局（80%-100%）"
  },
  "highlights": ["亮点1", "亮点2", "亮点3"],
  "targetAudience": "目标读者"
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.8, maxTokens: 2000 });
    return this.parseJson(result);
  }

  // 生成世界观
  private async generateWorldview(novelId: string, outline: any, knowledge: string): Promise<any> {
    const prompt = `你是一位资深网文世界观架构师。请根据以下大纲，构建完整的世界观。

【大纲】
${JSON.stringify(outline, null, 2)}

【参考知识】
${knowledge || "无"}

请生成JSON格式的世界观：
{
  "name": "世界名称",
  "summary": "世界概述",
  "rules": "世界规则（力量体系、魔法系统等）",
  "geography": "地理环境",
  "factions": "势力分布",
  "history": "历史背景",
  "powerSystem": {
    "name": "力量体系名称",
    "levels": ["等级1", "等级2", "等级3"],
    "rules": "力量规则"
  },
  "specialElements": ["特殊元素1", "特殊元素2"]
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.7, maxTokens: 1500 });
    const parsed = this.parseJson(result);
    return Object.keys(parsed).length ? parsed : this.buildFallbackWorldview(outline);
  }

  // 生成人物
  private async generateCharacters(novelId: string, outline: any, worldview: any): Promise<any> {
    const prompt = `你是一位资深网文人物设计师。请根据以下大纲和世界观，设计主要人物。

【大纲】
主角：${outline.protagonist?.name || "未知"}
反派：${outline.antagonist?.name || "未知"}

【世界观】
${worldview.name}: ${worldview.summary || ""}

请生成JSON格式的人物列表：
{
  "characters": [
    {
      "name": "人物名",
      "role": "主角/配角/反派/导师等",
      "identity": "身份",
      "motivation": "动机",
      "appearance": "外貌特征",
      "background": "背景故事",
      "personality": "性格特点",
      "abilities": "能力/技能",
      "relationsText": "与其他人物的关系"
    }
  ]
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.7, maxTokens: 2000 });
    return this.parseJson(result);
  }

  // 生成风格
  private async generateStyle(novelId: string, outline: any, config: PipelineConfig): Promise<any> {
    const prompt = `你是一位资深网文风格顾问。请根据以下信息，推荐写作风格。

【类型】
${outline.genre || config.genre || "自动判断"}

【主题】
${outline.theme || ""}

请生成JSON格式的风格配置：
{
  "name": "风格名称",
  "description": "风格描述",
  "narrativePov": "third_person",
  "tense": "past",
  "pacing": "balanced",
  "sentenceLength": "mixed",
  "vocabulary": "modern",
  "dialogueRatio": "balanced",
  "emotionIntensity": "medium",
  "humorLevel": "low",
  "specialRules": ["规则1", "规则2"]
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.6, maxTokens: 1000 });
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
    if (allConfirmed && phase === "planning") {
      // 进入下一阶段
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "structuring", currentStep: "volume" },
      });
      // 继续执行下一阶段
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

    // 2.1 生成卷纲
    await this.updateJobProgress(jobId, "structuring", "volume");
    const volumeResult = await this.generateVolumeOutline(job.novelId, outline, config);
    await this.savePhaseResult(jobId, "structuring", "volume", { outline }, volumeResult);
    await this.saveToKnowledgeBase(job.novelId, 'volume', '卷纲规划', volumeResult);

    // 2.2 生成章纲
    await this.updateJobProgress(jobId, "structuring", "chapter_outline");
    const chapterOutlineResult = await this.generateChapterOutlines(job.novelId, volumeResult, config);
    await this.savePhaseResult(jobId, "structuring", "chapter_outline", { volumes: volumeResult }, chapterOutlineResult);
    await this.saveToKnowledgeBase(job.novelId, 'chapter_outline', '章纲规划', chapterOutlineResult);

    // 2.3 生成主线/钩子
    await this.updateJobProgress(jobId, "structuring", "mainline_hook");
    const mainlineHookResult = await this.generateMainlinesAndHooks(job.novelId, outline, volumeResult);
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
  private async generateVolumeOutline(novelId: string, outline: any, config: PipelineConfig): Promise<any> {
    const volumeCount = config.volumeCount || 3;
    const prompt = `你是一位资深网文结构师。请根据以下大纲，规划${volumeCount}卷的内容。

【大纲】
${JSON.stringify(outline, null, 2)}

请生成JSON格式的卷纲：
{
  "volumes": [
    {
      "title": "卷标题",
      "goal": "本卷目标",
      "conflict": "主要冲突",
      "emotion": "情绪基调",
      "newChars": ["新角色1", "新Chars2"],
      "mapName": "主要场景",
      "endHook": "结尾钩子"
    }
  ]
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.7, maxTokens: 2000 });
    return this.parseJson(result);
  }

  // 生成章纲
  private async generateChapterOutlines(novelId: string, volumes: any, config: PipelineConfig): Promise<any> {
    const chaptersPerVolume = config.chaptersPerVolume || 10;
    const prompt = `你是一位资深网文章纲设计师。请为每卷设计${chaptersPerVolume}章的章纲。

【卷纲】
${JSON.stringify(volumes, null, 2)}

请生成JSON格式的章纲：
{
  "chapterOutlines": [
    {
      "volumeIndex": 0,
      "chapters": [
        {
          "title": "章节标题",
          "goal": "章节目标",
          "conflict": "冲突",
          "emotion": "情绪",
          "hook": "章末钩子"
        }
      ]
    }
  ]
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.7, maxTokens: 3000 });
    return this.parseJson(result);
  }

  // 生成主线和钩子
  private async generateMainlinesAndHooks(novelId: string, outline: any, volumes: any): Promise<any> {
    const prompt = `请根据以下大纲和卷纲，规划主线和钩子。

【大纲核心冲突】
${outline.mainConflict || ""}

【卷纲】
${JSON.stringify(volumes, null, 2)}

请生成JSON格式：
{
  "mainlines": [
    { "title": "主线名称", "description": "主线描述" }
  ],
  "hooks": [
    { "title": "钩子标题", "description": "钩子描述", "type": "suspense/foreshadow/cliffhanger", "intensity": 1-10 }
  ]
}`;

    const result = await this.llmService.completeText({ prompt, temperature: 0.7, maxTokens: 1500 });
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

    const [plan, outlineResult, chapterOutlineResult, workspaceContext] = await Promise.all([
      config.imitationPlanId
        ? prisma.imitationPlan.findFirst({ where: { id: config.imitationPlanId, novelId } })
        : Promise.resolve(null),
      prisma.phaseResult.findUnique({
        where: { jobId_phase_step: { jobId, phase: "planning", step: "outline" } },
      }),
      prisma.phaseResult.findUnique({
        where: { jobId_phase_step: { jobId, phase: "structuring", step: "chapter_outline" } },
      }),
      this.buildWorkspaceAssetContext(novelId, jobId),
    ]);

    const blueprint = this.safeJson(plan?.blueprint, {});
    const chapterTemplate = this.safeJson(plan?.chapterTemplate, {});
    const sampleDrafts = this.safeJson(plan?.sampleDrafts, []);
    const outline = outlineResult ? this.parseJson(outlineResult.output) : {};
    const chapterOutline = chapterOutlineResult ? this.parseJson(chapterOutlineResult.output) : {};
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
        order,
        title,
        summary,
        previousChapters,
        workspaceContext,
        targetWordCount: config.targetWordCount || 1800,
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
    order: number;
    title: string;
    summary: string;
    previousChapters: Array<{ order: number; title: string; content: string }>;
    workspaceContext: string;
    targetWordCount: number;
  }) {
    const prompt = [
      "你是 Dream Writer 的自动仿写正文引擎。请为当前作品写原创章节草稿。",
      "只能迁移拆书得到的结构、节奏、章节功能和写法原则，严禁复刻参考书具体人物、桥段、专有设定、连续表达。",
      "输出纯正文，不要 Markdown，不要提纲，不要解释。",
      "",
      `作品：${input.novel.title}`,
      `类型：${input.novel.genre || input.outline.genre || input.blueprint.genre || "未指定"}`,
      `目标字数：约 ${input.targetWordCount} 中文字`,
      "",
      "【创作蓝图】",
      JSON.stringify(input.blueprint || input.outline || {}, null, 2),
      "",
      "【章节模板】",
      JSON.stringify(input.chapterTemplate || {}, null, 2),
      "",
      "【本章功能卡】",
      JSON.stringify(input.card || {}, null, 2),
      "",
      "【已入库并被本次 Pipeline 采用的作品资产】",
      input.workspaceContext || "暂无。",
      "",
      "【样章风味参考，只学习节奏与技法，不复制表达】",
      JSON.stringify(input.sampleDrafts?.slice(0, 2) || [], null, 2),
      "",
      "【前文摘要】",
      input.previousChapters.length
        ? input.previousChapters.map((chapter) => `第${chapter.order}章 ${chapter.title}：${chapter.content}`).join("\n\n")
        : "这是开篇第一章。",
      "",
      `请写：第${input.order}章 ${input.title}`,
      input.summary,
    ].join("\n");

    const result = await this.llmService.completeText({
      system: "你是克制、细腻、重视原创性和章节推进的中文小说写作助手。",
      prompt,
      temperature: 0.76,
      maxTokens: Math.max(1800, Math.min(4200, Math.round(input.targetWordCount * 1.8))),
    });

    return result?.trim() || this.buildFallbackChapterDraft(input);
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
      name: "古言悬疑爽文风格",
      description: `服务于${outline.genre || config.genre || "当前类型"}的节奏型写法：快进入冲突，证据推进，情绪有压迫感。`,
      narrativePov: "third_person",
      tense: "past",
      pacing: "fast",
      sentenceLength: "mixed",
      vocabulary: "modern",
      dialogueRatio: "balanced",
      emotionIntensity: "medium",
      humorLevel: "low",
      specialRules: [
        "少解释设定，多用行动、证据、对话推进。",
        "每章保留一个未解决问题或反转点。",
        "专业判断必须给出可见证据，避免无根据开挂。",
        "古代语境下减少过度现代口吻。",
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

    if (existing) {
      // 覆盖更新
      await prisma.knowledgeAsset.update({
        where: { id: existing.id },
        data: {
          content: contentStr,
          updatedAt: new Date(),
        },
      });
    } else {
      // 新增
      await prisma.knowledgeAsset.create({
        data: {
          novelId,
          title,
          category,
          content: contentStr,
          tags: `auto-generated,${category}`,
        },
      });
    }

    await prisma.memory.create({
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
        const data = {
          name: style.name || "默认写作风格",
          description: style.description || "由自动创作流程生成的默认风格。",
          narrativePov: style.narrativePov || "third_person",
          tense: style.tense || "past",
          pacing: style.pacing || "balanced",
          sentenceLength: style.sentenceLength || "mixed",
          vocabulary: style.vocabulary || "modern",
          dialogueRatio: style.dialogueRatio || "balanced",
          emotionIntensity: style.emotionIntensity || "medium",
          humorLevel: style.humorLevel || "low",
          customRules: JSON.stringify(style.specialRules || style.customRules || []),
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

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "running" },
    });

    if (job.currentPhase === "planning" && job.currentStep === "waiting_confirm") {
      this.executeStructuringPhase(jobId);
    } else if (job.currentPhase === "structuring" && job.currentStep === "waiting_confirm") {
      this.executeWritingPhase(jobId);
    } else {
      this.executePipeline(jobId);
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
    
    // 获取相关输入
    const outlineResult = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: "planning", step: "outline" } },
    });
    const outline = outlineResult ? JSON.parse(outlineResult.output) : {};

    let output: any;
    const input = { outline, userHint };

    // 根据步骤调用相应的生成器
    switch (step) {
      case "outline":
        const keywords = knowledgeSearchService.extractKeywords(job.novel.inspiration || "");
        const knowledge = await knowledgeSearchService.buildContext(job.novelId, keywords);
        output = await this.generateOutline(job.novelId, job.novel.inspiration || "", knowledge, config);
        break;
      case "worldview":
        output = await this.generateWorldview(job.novelId, outline, "");
        break;
      case "characters":
        const worldviewResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "planning", step: "worldview" } },
        });
        const worldview = worldviewResult ? JSON.parse(worldviewResult.output) : {};
        output = await this.generateCharacters(job.novelId, outline, worldview);
        break;
      case "style":
        output = await this.generateStyle(job.novelId, outline, config);
        break;
      default:
        throw new Error(`不支持重新生成步骤: ${step}`);
    }

    // 保存结果
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
