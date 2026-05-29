import { prisma } from "../db/prisma";
import { parseLlmJson } from "../utils/parseJson";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { getRagRetrieveService } from "./RagRetrieveService";
import { PhaseContext, createPhaseContext, savePhaseResult as _savePhaseResult, confirmPhaseResults as _confirmPhaseResults, updateJobProgress as _updateJobProgress, saveToKnowledgeBase as _saveToKnowledgeBase, persistGeneratedAssets as _persistGeneratedAssets } from "./pipeline/pipelineUtils";
import { buildWorkspaceAssetContext, buildBookAnalysisContext, buildImitationPlanContext } from "./pipeline/contextBuilders";
import { executeAnalyzePhase, executeAnalyzePhase_continue } from "./pipeline/analyzePhase";
import { executePlanningPhase, executePlanningPhase_standalone } from "./pipeline/planningPhase";
import { executeAssetsPhase } from "./pipeline/assetsPhase";
import { executeChapterOutlinesPhase, buildPreviousVolumeSummary, persistVolumeChapterData, persistStoryArcs } from "./pipeline/chapterOutlinesPhase";
import { executeConsistencyCheckPhase, buildPlanSummaryForConsistency } from "./pipeline/consistencyPhase";
import { executeWritingPhase } from "./pipeline/writingPhase";
import { executeVolumesPhase, executeChapterOutlinePhase } from "./pipeline/legacyPhase";
import { generateOutline, generateWorldview, generateCharacters, generateStyle, generateVolumeOutline, generateChapterOutlines, generateMainlinesAndHooks, generateEnrichedChapterOutlines, generateStoryArcs, generateConsistencyCheck } from "./pipeline/generators";

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
  mode?: "standalone" | "imitation" | "continue";
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

  private get ctx(): PhaseContext {
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
    const existing = await prisma.pipelineJob.findUnique({ where: { novelId } });
    if (existing && existing.status === "running") {
      throw new Error("该作品已有流程在运行中");
    }

    const volumeCount = config.volumeCount || 5;
    const isStandaloneOrContinue = config.mode === "standalone" || config.mode === "continue" || !config.mode;
    const totalSteps = isStandaloneOrContinue
      ? 3 + 3 + (1 + volumeCount + 1) + 1 + 1
      : 20;

    const configWithVersion = { ...config, pipelineVersion: 2 };

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
    const result = await prisma.phaseResult.update({
      where: { jobId_phase_step: { jobId, phase, step } },
      data: {
        status: "confirmed",
        confirmedByUser: true,
        userFeedback: feedback,
      },
    });

    const allResults = await prisma.phaseResult.findMany({
      where: { jobId, phase },
    });

    const allConfirmed = allResults.every(r => r.status === "confirmed");

    const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
    const config = job?.config ? JSON.parse(job.config) : {};
    const pipelineVersion = config.pipelineVersion || 1;
    const ctx = this.ctx;

    if (pipelineVersion >= 2) {
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
          data: { status: "running", currentPhase: "planning", currentStep: "volume_outline" },
        });
        executePlanningPhase_standalone(ctx, jobId);
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
      }
      if (allConfirmed && phase === "planning") {
        const hasChapterOutlines = allResults.some(r => r.step.startsWith("chapter_outline_vol_"));
        const hasStoryArcs = allResults.some(r => r.step === "story_arcs");
        if (hasChapterOutlines && hasStoryArcs) {
          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { status: "running", currentPhase: "consistency_check", currentStep: "consistency" },
          });
          executeConsistencyCheckPhase(ctx, jobId);
        }
      }
      if (allConfirmed && phase === "consistency_check") {
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
        });
        executeWritingPhase(ctx, jobId);
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
        executeWritingPhase(ctx, jobId);
      }
    }

    if (allConfirmed && phase === "planning" && config.mode === "imitation") {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "structuring", currentStep: "volume" },
      });
      this.executeStructuringPhase(ctx, jobId);
    }
    if (allConfirmed && phase === "structuring") {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
      });
      executeWritingPhase(ctx, jobId);
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

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "running" },
    });

    if (pipelineVersion >= 2) {
      if (job.currentPhase === "outline" && job.currentStep === "waiting_confirm") {
        executeAssetsPhase(ctx, jobId);
      } else if (job.currentPhase === "assets" && job.currentStep === "waiting_confirm") {
        executePlanningPhase_standalone(ctx, jobId);
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
          executePlanningPhase_standalone(ctx, jobId);
        }
      } else if (job.currentPhase === "consistency_check" && job.currentStep === "waiting_confirm") {
        executeWritingPhase(ctx, jobId);
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
        executeWritingPhase(ctx, jobId);
      }
      else if (job.currentPhase === "planning" && job.currentStep === "waiting_confirm") {
        this.executeStructuringPhase(ctx, jobId);
      } else if (job.currentPhase === "structuring" && job.currentStep === "waiting_confirm") {
        executeWritingPhase(ctx, jobId);
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
    const ctx = this.ctx;

    const outlinePhase = phase === "outline" ? "outline" : "planning";
    const outlineResult = await prisma.phaseResult.findUnique({
      where: { jobId_phase_step: { jobId, phase: outlinePhase, step: "outline" } },
    });
    const outline = outlineResult ? JSON.parse(outlineResult.output) : {};

    let output: any;
    const input = { outline, userHint };

    const assetPhase = phase === "assets" ? "assets" : phase === "generation" ? "generation" : "planning";
    const volPhase = phase === "volumes" ? "volumes" : phase === "generation" ? "generation" : "structuring";
    const chPhase = phase === "chapter_outline" ? "chapter_outline" : phase === "generation" ? "generation" : "structuring";

    switch (step) {
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
        const worldview = worldviewResult ? JSON.parse(worldviewResult.output) : {};
        const charKnowledge = await getRagRetrieveService()?.retrieve(
          job.novel.inspiration || "", { novelId: job.novelId, topK: 10 }
        ) ?? "";
        output = await generateCharacters(ctx, job.novelId, outline, worldview, charKnowledge, userHint);
        break;
      }
      case "style":
        output = await generateStyle(ctx, job.novelId, outline, config, userHint);
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
        output = await generateVolumeOutline(ctx, job.novelId, outline, volWv, volChar, volStyle, config);
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
        output = await generateChapterOutlines(ctx, job.novelId, volumes, outline, chWv, chChar, chStyle, config);
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
        output = await generateMainlinesAndHooks(ctx, job.novelId, outline, mhVolumes, mhWv, mhChar, mhStyle, mhKnowledge, userHint);
        break;
      }

      case "volume_outline": {
        const [v2WvRes, v2CharRes, v2StyleRes] = await Promise.all([
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "worldview" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "characters" } } }),
          prisma.phaseResult.findUnique({ where: { jobId_phase_step: { jobId, phase: "assets", step: "style" } } }),
        ]);
        const v2Wv = v2WvRes ? JSON.parse(v2WvRes.output) : {};
        const v2Char = v2CharRes ? JSON.parse(v2CharRes.output) : {};
        const v2Style = v2StyleRes ? JSON.parse(v2StyleRes.output) : {};
        output = await generateVolumeOutline(ctx, job.novelId, outline, v2Wv, v2Char, v2Style, config);
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
        output = await generateConsistencyCheck(ctx, job.novelId, cchPlanSummary);
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

    if (config.mode === "standalone") {
      try {
        await executeAnalyzePhase(ctx, jobId, job.novelId, config);
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

    if (config.mode === "continue") {
      try {
        await executeAnalyzePhase_continue(ctx, jobId, job.novelId, config);
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

    try {
      await executePlanningPhase(ctx, jobId, job.novelId, config);

      if (config.autoContinue) {
        await _confirmPhaseResults(jobId, "planning");
        this.executeStructuringPhase(ctx, jobId);
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

  // imitation 模式的结构化阶段
  private async executeStructuringPhase(ctx: PhaseContext, jobId: string) {
    const job = await prisma.pipelineJob.findUnique({
      where: { id: jobId },
      include: { novel: true },
    });
    if (!job) return;

    const config = JSON.parse(job.config) as PipelineConfig;

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

    await _updateJobProgress(jobId, "structuring", "volume");
    const volumeResult = await generateVolumeOutline(ctx, job.novelId, outline, worldview, characters, style, config);
    await _savePhaseResult(jobId, "structuring", "volume", { outline }, volumeResult, this.selfReview.bind(this));
    await _saveToKnowledgeBase(job.novelId, 'volume', '卷纲规划', volumeResult);

    await _updateJobProgress(jobId, "structuring", "chapter_outline");
    const chapterOutlineResult = await generateChapterOutlines(ctx, job.novelId, volumeResult, outline, worldview, characters, style, config);
    await _savePhaseResult(jobId, "structuring", "chapter_outline", { volumes: volumeResult }, chapterOutlineResult, this.selfReview.bind(this));
    await _saveToKnowledgeBase(job.novelId, 'chapter_outline', '章纲规划', chapterOutlineResult);

    await _updateJobProgress(jobId, "structuring", "mainline_hook");
    const mainlineHookResult = await generateMainlinesAndHooks(ctx, job.novelId, outline, volumeResult, worldview, characters, style);
    await _savePhaseResult(jobId, "structuring", "mainline_hook", { outline, volumes: volumeResult }, mainlineHookResult, this.selfReview.bind(this));
    await _saveToKnowledgeBase(job.novelId, 'mainline_hook', '主线钩子', mainlineHookResult);

    if (config.autoContinue) {
      await _confirmPhaseResults(jobId, "structuring");
      executeWritingPhase(ctx, jobId);
      return;
    }

    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused", currentPhase: "structuring", currentStep: "waiting_confirm" },
    });
  }
}

export const pipelineService = new PipelineService();
