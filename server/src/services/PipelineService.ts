import { prisma } from "../db/prisma";
import { parseLlmJson } from "../utils/parseJson";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { getRagRetrieveService } from "./RagRetrieveService";
import { PhaseContext, createPhaseContext, savePhaseResult as _savePhaseResult, confirmPhaseResults as _confirmPhaseResults, updateJobProgress as _updateJobProgress, saveToKnowledgeBase as _saveToKnowledgeBase, persistGeneratedAssets as _persistGeneratedAssets } from "./pipeline/pipelineUtils";
import { buildWorkspaceAssetContext, buildBookAnalysisContext, buildImitationPlanContext } from "./pipeline/contextBuilders";
import { executeAnalyzePhase, decomposeIntoAssets } from "./pipeline/analyzePhase";
import { executePlanningPhase_unified } from "./pipeline/planningPhase";
import { executeAssetsPhase } from "./pipeline/assetsPhase";
import { executeChapterOutlinesPhase, buildPreviousVolumeSummary, persistVolumeChapterData, persistStoryArcs } from "./pipeline/chapterOutlinesPhase";
import { executeConsistencyCheckPhase, buildPlanSummaryForConsistency } from "./pipeline/consistencyPhase";
import { executeWritingPhase } from "./pipeline/writingPhase";
import { executeStyleAnalysisPhase } from "./pipeline/styleAnalysisPhase";
import { executeVolumesPhase, executeChapterOutlinePhase } from "./pipeline/legacyPhase";
import { generateOutline, generateWorldview, generateCharacters, generateStyle, generateVolumeOutline, generateChapterOutlines, generateMainlinesAndHooks, generateEnrichedChapterOutlines, generateStoryArcs, generateConsistencyCheck } from "./pipeline/generators";
import { loadMaterialContextForNovel } from "./pipeline/materialContext";

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
  mode?: "create" | "imitation" | "standalone" | "continue";
  sourceType?: "idea" | "content";
  pipelineVersion?: number;
  /** Token 预算上限（单位：1K tokens），空值表示不限制 */
  tokenBudget?: number;
  /** 每批次最多写入章节数，0 或空值表示不限制 */
  maxChaptersPerBatch?: number;
  /** 输入模式："structured"（结构化人物卡+世界观） vs "inspiration"（传统自由文本，默认） */
  inputMode?: "structured" | "inspiration";
  /** 已有章节处理方式："continue"（保留原稿续写） vs "rewrite"（分析风格后重写） */
  continuationMode?: "continue" | "rewrite";
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

  public get ctx(): PhaseContext {
    return createPhaseContext(
      this.llmService,
      this.selfReview.bind(this),
      buildWorkspaceAssetContext,
      buildBookAnalysisContext,
      buildImitationPlanContext,
    );
  }

  // ==================== 公共 API ====================

  // 启动流程
  async startPipeline(novelId: string, config: PipelineConfig = {}) {
    // 深拷贝 config，避免修改调用者对象
    const configCopy = structuredClone(config);
    const volumeCount = configCopy.volumeCount || 5;

    // 向后兼容：迁移旧 mode 值
    if (configCopy.mode === "standalone" || configCopy.mode === "continue") {
      configCopy.sourceType = configCopy.sourceType || (configCopy.mode === "continue" ? "content" : "idea");
      configCopy.mode = "create";
    }

    // continuationMode → overwriteExistingChapters 映射
    if (configCopy.continuationMode === "continue") {
      configCopy.overwriteExistingChapters = false;
    } else if (configCopy.continuationMode === "rewrite") {
      configCopy.overwriteExistingChapters = true;
    }

    // outline(3) + assets(3) + [style_analysis(1)] + planning(1+volumeCount+1) + consistency(1) + writing(1)
    const hasStyleAnalysis = configCopy.inputMode === "structured";
    const totalSteps = 3 + 3 + (hasStyleAnalysis ? 1 : 0) + (1 + volumeCount + 1) + 1 + 1;

    const configWithVersion = { ...configCopy, pipelineVersion: 2 };

    // 将 stale 检测 + running 检查 + upsert 放入事务，消除竞态条件
    const job = await prisma.$transaction(async (tx) => {
      // stale job 检测：重置超过10分钟未更新的 running job
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
      await tx.pipelineJob.updateMany({
        where: { status: "running", updatedAt: { lt: staleThreshold } },
        data: { status: "error", lastError: "流程超时未响应，已自动标记为错误状态" },
      });

      const existing = await tx.pipelineJob.findUnique({ where: { novelId } });
      if (existing && existing.status === "running") {
        throw new Error("该作品已有流程在运行中");
      }

      return tx.pipelineJob.upsert({
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
    });

    this.executePipeline(job.id).catch(err => {
      console.error("Pipeline execution error:", err);
    });

    return job;
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
    const review = parseLlmJson(result) || {};
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
    return parseLlmJson(result) || {};
  }

  // 确认阶段结果
  async confirmPhase(jobId: string, phase: string, step: string, feedback?: string) {
    let result;
    try {
      result = await prisma.phaseResult.update({
        where: { jobId_phase_step: { jobId, phase, step } },
        data: {
          status: "confirmed",
          confirmedByUser: true,
          userFeedback: feedback,
        },
      });
    } catch (error: any) {
      if (error?.code === "P2025" || String(error?.message || "").includes("No record was found")) {
        throw new Error(`阶段结果不存在：${phase}/${step}`);
      }
      throw error;
    }

    const allResults = await prisma.phaseResult.findMany({
      where: { jobId, phase },
    });

    const allConfirmed = allResults.every(r => r.status === "confirmed");

    const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
    const config = job?.config ? JSON.parse(job.config) : {};
    const pipelineVersion = config.pipelineVersion || 1;
    const ctx = this.ctx;

    if (pipelineVersion >= 2) {
      if (!allConfirmed) return result;

      if (phase === "outline") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "assets", currentStep: "worldview" },
        });
        executeAssetsPhase(ctx, jobId);
        return result;
      }

      if (phase === "assets") {
        // 结构化输入 + 有已有章节 → 先运行风格分析
        if (config.inputMode === "structured" && job) {
          const hasChapters = await prisma.chapter.count({ where: { novelId: job.novelId, content: { not: "" } } });
          if (hasChapters > 0) {
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { status: "running", currentPhase: "style_analysis", currentStep: "analyze" },
            });
            executeStyleAnalysisPhase(ctx, jobId, job.novelId, config).then(async () => {
              await prisma.pipelineJob.update({
                where: { id: jobId },
                data: { status: "running", currentPhase: "planning", currentStep: "volume_outline" },
              });
              executePlanningPhase_unified(ctx, jobId);
            });
            return result;
          }
        }
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "planning", currentStep: "volume_outline" },
        });
        executePlanningPhase_unified(ctx, jobId);
        return result;
      }

      if (phase === "planning" && step === "volume_outline") {
        const volumeOutlineConfirmed = allResults.find(r => r.step === "volume_outline")?.status === "confirmed";
        if (volumeOutlineConfirmed) {
          const chapterResults = allResults.filter(r => r.step.startsWith("chapter_outline_vol_"));
          if (chapterResults.length === 0) {
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { status: "running", currentPhase: "planning", currentStep: "chapter_outline_vol_1" },
            });
            executeChapterOutlinesPhase(ctx, jobId);
          }
        }
        return result;
      }

      if (phase === "planning") {
        const hasChapterOutlines = allResults.some(r => r.step.startsWith("chapter_outline_vol_"));
        const hasStoryArcs = allResults.some(r => r.step === "story_arcs");
        if (hasChapterOutlines && hasStoryArcs) {
          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { status: "running", currentPhase: "consistency_check", currentStep: "consistency" },
          });
          executeConsistencyCheckPhase(ctx, jobId);
        }
        return result;
      }

      if (phase === "consistency_check") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
        });
        const novelId = job?.novelId || (await prisma.pipelineJob.findUnique({ where: { id: jobId }, select: { novelId: true } }))?.novelId;
        if (novelId) {
          const maxOrder = await prisma.chapter.findFirst({
            where: { novelId },
            orderBy: { order: "desc" },
            select: { order: true },
          });
          executeWritingPhase(ctx, jobId, (maxOrder?.order || 0) + 1);
        } else {
          executeWritingPhase(ctx, jobId);
        }
        return result;
      }
    } else {
      if (allConfirmed && phase === "outline") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "assets", currentStep: "worldview" },
        });
        executeAssetsPhase(ctx, jobId);
      }
      if (allConfirmed && phase === "assets") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "volumes", currentStep: "volume" },
        });
        executeVolumesPhase(ctx, jobId);
      }
      if (allConfirmed && phase === "volumes") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "chapter_outline", currentStep: "chapter_outline" },
        });
        executeChapterOutlinePhase(ctx, jobId);
      }
      if (allConfirmed && phase === "chapter_outline") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
        });
        const novelId = job?.novelId || (await prisma.pipelineJob.findUnique({ where: { id: jobId }, select: { novelId: true } }))?.novelId;
        if (novelId) {
          const maxOrder = await prisma.chapter.findFirst({
            where: { novelId },
            orderBy: { order: "desc" },
            select: { order: true },
          });
          executeWritingPhase(ctx, jobId, (maxOrder?.order || 0) + 1);
        } else {
          executeWritingPhase(ctx, jobId);
        }
      }
    }

    return result;
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
    const ctx = this.ctx;

    if (job.status === "error") {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", lastError: null, retryCount: { increment: 1 } },
      });

      const phase = job.currentPhase;
      if (pipelineVersion >= 2) {
        switch (phase) {
          case "outline":
            executeAnalyzePhase(ctx, jobId, job.novelId, config);
            break;
          case "assets":
            executeAssetsPhase(ctx, jobId);
            break;
          case "planning": {
            const planResults = await prisma.phaseResult.findMany({ where: { jobId, phase: "planning" } });
            const hasVolume = planResults.some(r => r.step === "volume_outline" && r.status === "confirmed");
            const hasChapters = planResults.some(r => r.step.startsWith("chapter_outline_vol_"));
            const hasArcs = planResults.some(r => r.step === "story_arcs");
            if (!hasVolume) {
              executePlanningPhase_unified(ctx, jobId);
            } else if (!hasChapters) {
              executeChapterOutlinesPhase(ctx, jobId);
            } else if (!hasArcs) {
              executePlanningPhase_unified(ctx, jobId);
            } else {
              executeConsistencyCheckPhase(ctx, jobId);
            }
            break;
          }
          case "consistency_check":
            executeConsistencyCheckPhase(ctx, jobId);
            break;
          case "writing": {
            const maxOrder = await prisma.chapter.findFirst({
              where: { novelId: job.novelId },
              orderBy: { order: "desc" },
              select: { order: true },
            });
            executeWritingPhase(ctx, jobId, (maxOrder?.order || 0) + 1);
            break;
          }
          default:
            this.executePipeline(jobId);
        }
      } else {
        this.executePipeline(jobId);
      }
      return job;
    }

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "running" },
    });

    if (pipelineVersion >= 2) {
      if (job.currentPhase === "outline" && job.currentStep === "waiting_confirm") {
        executeAssetsPhase(ctx, jobId);
      } else if (job.currentPhase === "assets" && job.currentStep === "waiting_confirm") {
        executePlanningPhase_unified(ctx, jobId);
      } else if (job.currentPhase === "planning" && job.currentStep === "waiting_confirm") {
        const phaseResults = await prisma.phaseResult.findMany({ where: { jobId, phase: "planning" } });
        const hasVolumeOutline = phaseResults.some(r => r.step === "volume_outline" && r.status === "confirmed");
        const hasChapterOutlines = phaseResults.some(r => r.step.startsWith("chapter_outline_vol_"));
        const hasStoryArcs = phaseResults.some(r => r.step === "story_arcs");

        if (!hasChapterOutlines && hasVolumeOutline) {
          executeChapterOutlinesPhase(ctx, jobId);
        } else if (hasChapterOutlines && hasStoryArcs) {
          executeConsistencyCheckPhase(ctx, jobId);
        } else {
          executePlanningPhase_unified(ctx, jobId);
        }
      } else if (job.currentPhase === "consistency_check" && job.currentStep === "waiting_confirm") {
        const maxOrder = await prisma.chapter.findFirst({
          where: { novelId: job.novelId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        executeWritingPhase(ctx, jobId, (maxOrder?.order || 0) + 1);
      } else {
        this.executePipeline(jobId);
      }
    } else {
      if (job.currentPhase === "outline" && job.currentStep === "waiting_confirm") {
        executeAssetsPhase(ctx, jobId);
      } else if (job.currentPhase === "assets" && job.currentStep === "waiting_confirm") {
        executeVolumesPhase(ctx, jobId);
      } else if (job.currentPhase === "volumes" && job.currentStep === "waiting_confirm") {
        executeChapterOutlinePhase(ctx, jobId);
      } else if (job.currentPhase === "chapter_outline" && job.currentStep === "waiting_confirm") {
        const maxOrder = await prisma.chapter.findFirst({
          where: { novelId: job.novelId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        executeWritingPhase(ctx, jobId, (maxOrder?.order || 0) + 1);
      }
      else {
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
    const ctx = this.ctx;

    const outlinePhase = phase === "outline" ? "outline" : "planning";
    const outlineResult = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: outlinePhase, step: "outline" } },
    });
    const outline = outlineResult ? parseLlmJson(outlineResult.output) || {} : {};

    let output: any;
    const input = { outline, userHint };

    const assetPhase = phase === "assets" ? "assets" : phase === "generation" ? "generation" : "planning";
    const volPhase = phase === "volumes" ? "volumes" : phase === "generation" ? "generation" : "structuring";
    const chPhase = phase === "chapter_outline" ? "chapter_outline" : phase === "generation" ? "generation" : "structuring";

    switch (step) {
      case "decompose": {
        const analyzeResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "outline", step: "analyze" } },
        });
        if (!analyzeResult) throw new Error("请先完成分析步骤");
        const analysis = parseLlmJson(analyzeResult.output) || {};
        const decomposed = await decomposeIntoAssets(ctx, job.novelId, job.novel.inspiration || "", analysis, config);
        output = decomposed;
        break;
      }
      case "outline": {
        const knowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await generateOutline(ctx, job.novelId, job.novel.inspiration || "", knowledge, config, userHint);
        break;
      }
      case "worldview": {
        const wvKnowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await generateWorldview(ctx, job.novelId, outline, wvKnowledge, userHint);
        break;
      }
      case "characters": {
        const worldviewResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } },
        });
        const worldview = worldviewResult ? parseLlmJson(worldviewResult.output) || {} : {};
        const charKnowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await generateCharacters(ctx, job.novelId, outline, worldview, charKnowledge, userHint);
        break;
      }
      case "style": {
        const [styleWvRes, styleCharRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "characters" } } }),
        ]);
        const styleWv = styleWvRes ? parseLlmJson(styleWvRes.output) || {} : {};
        const styleChar = styleCharRes ? parseLlmJson(styleCharRes.output) || {} : {};
        output = await generateStyle(ctx, job.novelId, outline, styleWv, styleChar, config, userHint);
        break;
      }
      case "volume": {
        const [volWvRes, volCharRes, volStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "style" } } }),
        ]);
        const volWv = volWvRes ? parseLlmJson(volWvRes.output) || {} : {};
        const volChar = volCharRes ? parseLlmJson(volCharRes.output) || {} : {};
        const volStyle = volStyleRes ? parseLlmJson(volStyleRes.output) || {} : {};
        const volMaterialContext = await loadMaterialContextForNovel(job.novelId, jobId);
        output = await generateVolumeOutline(ctx, job.novelId, outline, volWv, volChar, volStyle, config, undefined, userHint, volMaterialContext);
        break;
      }
      case "chapter_outline": {
        const volResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: volPhase, step: "volume" } },
        });
        const volumes = volResult ? parseLlmJson(volResult.output) || {} : {};
        const [chWvRes, chCharRes, chStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "style" } } }),
        ]);
        const chWv = chWvRes ? parseLlmJson(chWvRes.output) || {} : {};
        const chChar = chCharRes ? parseLlmJson(chCharRes.output) || {} : {};
        const chStyle = chStyleRes ? parseLlmJson(chStyleRes.output) || {} : {};
        output = await generateChapterOutlines(ctx, job.novelId, volumes, outline, chWv, chChar, chStyle, config);
        break;
      }
      case "mainline_hook": {
        const mhVolResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: volPhase, step: "volume" } },
        });
        const mhVolumes = mhVolResult ? parseLlmJson(mhVolResult.output) || {} : {};
        const [mhWvRes, mhCharRes, mhStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: assetPhase, step: "style" } } }),
        ]);
        const mhWv = mhWvRes ? parseLlmJson(mhWvRes.output) || {} : {};
        const mhChar = mhCharRes ? parseLlmJson(mhCharRes.output) || {} : {};
        const mhStyle = mhStyleRes ? parseLlmJson(mhStyleRes.output) || {} : {};
        const mhKnowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await generateMainlinesAndHooks(ctx, job.novelId, outline, mhVolumes, mhWv, mhChar, mhStyle, mhKnowledge, userHint);
        break;
      }

      case "volume_outline": {
        const [v2WvRes, v2CharRes, v2StyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "style" } } }),
        ]);
        const v2Wv = v2WvRes ? parseLlmJson(v2WvRes.output) || {} : {};
        const v2Char = v2CharRes ? parseLlmJson(v2CharRes.output) || {} : {};
        const v2Style = v2StyleRes ? parseLlmJson(v2StyleRes.output) || {} : {};
        const v2MaterialContext = await loadMaterialContextForNovel(job.novelId, jobId);
        // 素材有整体规划时，删除旧卷重新生成
        if (v2MaterialContext.includes("整体规划")) {
          await prisma.chapterOutline.deleteMany({ where: { novelId: job.novelId } });
          await prisma.volume.deleteMany({ where: { novelId: job.novelId } });
        }
        output = await generateVolumeOutline(ctx, job.novelId, outline, v2Wv, v2Char, v2Style, config, undefined, userHint, v2MaterialContext);
        await _persistGeneratedAssets(job.novelId, "volume", output);
        break;
      }

      case "story_arcs": {
        const allChapterOutlines: any = { chapterOutlines: [] };
        const volumeCount = config.volumeCount || 5;
        for (let v = 1; v <= volumeCount; v++) {
          const volStep = `chapter_outline_vol_${v}`;
          const volRes = await prisma.phaseResult.findUnique({
            where: { jobId_phase_step: { jobId, phase: "planning", step: volStep } },
          });
          if (volRes) {
            const parsed = parseLlmJson(volRes.output) || {};
            allChapterOutlines.chapterOutlines.push({
              volumeIndex: v - 1,
              chapters: parsed?.chapters || [],
            });
          }
        }
        const saVolResult = await prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "planning", step: "volume_outline" } },
        });
        const saVolumes = saVolResult ? parseLlmJson(saVolResult.output) || {} : {};
        const [saWvRes, saCharRes, saStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "style" } } }),
        ]);
        const saWv = saWvRes ? parseLlmJson(saWvRes.output) || {} : {};
        const saChar = saCharRes ? parseLlmJson(saCharRes.output) || {} : {};
        const saStyle = saStyleRes ? parseLlmJson(saStyleRes.output) || {} : {};
        output = await generateStoryArcs(ctx, job.novelId, outline, allChapterOutlines, saVolumes, saWv, saChar, saStyle, config);
        await persistStoryArcs(job.novelId, output);
        break;
      }

      case "consistency": {
        const [cchOutlines, cchHooks, cchForeshadows, cchMainlines, cchPleasurePoints, cchEmotionCurves] = await Promise.all([
          prisma.chapterOutline.findMany({ where: { novelId: job.novelId }, orderBy: { sortOrder: "asc" } }),
          prisma.hook.findMany({ where: { novelId: job.novelId }, orderBy: { plannedChapter: "asc" } }),
          prisma.foreshadow.findMany({ where: { novelId: job.novelId }, orderBy: { plantChapter: "asc" } }),
          prisma.mainline.findMany({ where: { novelId: job.novelId }, orderBy: { sortOrder: "asc" } }),
          prisma.pleasurePoint.findMany({ where: { novelId: job.novelId }, orderBy: { chapterOrder: "asc" } }),
          prisma.emotionCurve.findMany({ where: { novelId: job.novelId }, orderBy: { chapterOrder: "asc" } }),
        ]);
        const cchPlanSummary = buildPlanSummaryForConsistency(
          cchOutlines, cchHooks, cchForeshadows, cchMainlines, cchPleasurePoints, cchEmotionCurves,
        );
        // 加载核心资产
        const [cchOutlineRes, cchWvRes, cchCharRes, cchStyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "outline", step: "outline" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "style" } } }),
        ]);
        const cchOutline = cchOutlineRes ? parseLlmJson(cchOutlineRes.output) || undefined : undefined;
        const cchWv = cchWvRes ? parseLlmJson(cchWvRes.output) || undefined : undefined;
        const cchChar = cchCharRes ? parseLlmJson(cchCharRes.output) || undefined : undefined;
        const cchStyle = cchStyleRes ? parseLlmJson(cchStyleRes.output) || undefined : undefined;
        output = await generateConsistencyCheck(ctx, job.novelId, cchPlanSummary, cchOutline, cchWv, cchChar, cchStyle);
        break;
      }

      default: {
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
          const ePrevSummary = buildPreviousVolumeSummary(eAllChapterOutlines, volIndex);
          output = await generateEnrichedChapterOutlines(
            ctx, job.novelId, eVolumes, volIndex, outline, eWv, eChar, eStyle, ePrevSummary, config, userHint,
          );
          await persistVolumeChapterData(job.novelId, volIndex, output?.chapters || [], eVolumes);
        } else {
          throw new Error(`不支持重新生成步骤: ${step}`);
        }
      }
    }

    await _savePhaseResult(jobId, phase, step, input, output, this.selfReview.bind(this));
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
      const output = parseLlmJson(result.output) || {};
      await _persistGeneratedAssets(novelId, target.category, output);
    }

    return { novelId, materializedAt: new Date().toISOString() };
  }

  // ==================== 私有编排方法 ====================

  private async executePipeline(jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;
    const ctx = this.ctx;

    try {
      await executeAnalyzePhase(ctx, jobId, job.novelId, config);
      if (config.autoContinue) {
        await _confirmPhaseResults(jobId, "outline");
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "assets", currentStep: "worldview" },
        });
        executeAssetsPhase(ctx, jobId);
      } else {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "paused", currentPhase: "outline", currentStep: "waiting_confirm" },
        });
      }
    } catch (error: any) {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "error", lastError: error.message },
      });
    }
  }
}

export const pipelineService = new PipelineService();
