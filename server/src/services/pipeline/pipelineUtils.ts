import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { getRagIngestService } from "../RagIngestService";
import { PipelineConfig } from "../PipelineService";

// ===== PhaseContext: 依赖注入容器 =====

export interface PhaseContext {
  llmService: {
    completeText: (opts: { system?: string; prompt: string; temperature?: number; maxTokens?: number }) => Promise<string | null>;
  };
  selfReview?: (content: any, type: string) => Promise<{ score: number; comment: string; issues: string[] }>;
  savePhaseResult: (jobId: string, phase: string, step: string, input: any, output: any) => Promise<void>;
  getPhaseOutput: (jobId: string, phase: string, step: string) => Promise<any>;
  confirmPhaseResults: (jobId: string, phase: string) => Promise<void>;
  updateJobProgress: (jobId: string, phase: string, step: string) => Promise<void>;
  saveToKnowledgeBase: (novelId: string, category: string, title: string, content: any) => Promise<void>;
  persistGeneratedAssets: (novelId: string, category: string, content: any) => Promise<void>;
  buildWorkspaceAssetContext: (novelId: string, jobId?: string) => Promise<string>;
  buildBookAnalysisContext: (novelId: string, config: PipelineConfig, jobId?: string) => Promise<string>;
  buildImitationPlanContext: (novelId: string, config: PipelineConfig, jobId?: string) => Promise<string>;
  safeJson: (value: string | null | undefined, fallback: any) => any;
  countWords: (content: string) => number;
  formatNovelOutline: (outline: any) => string;
  buildFallbackWorldview: (outline: any) => any;
  buildFallbackStyle: (outline: any, config: PipelineConfig) => any;
  buildFallbackChapterDraft: (input: {
    novel: { title: string; genre?: string | null };
    order: number;
    title: string;
    summary: string;
    previousChapters: Array<{ order: number; title: string; content?: string; summary?: string; ending?: string }>;
  }) => string;
}

// ===== 通用工具函数 =====

export function safeJson(value: string | null | undefined, fallback: any) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function countWords(content: string) {
  return content.replace(/\s/g, "").length;
}

export function formatNovelOutline(outline: any) {
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

export function buildFallbackWorldview(outline: any) {
  return {
    name: `${outline?.genre || "当前作品"}世界观`,
    summary: outline?.coreSetting || outline?.theme || "围绕当前作品主线建立的基础世界观。",
    rules: outline?.mainConflict || "",
    geography: "",
    factions: "",
    history: "",
    powerSystem: { name: "", levels: "", rules: "" },
    specialElements: "",
  };
}

export function buildFallbackStyle(outline: any, config: PipelineConfig) {
  return {
    name: `${outline?.genre || config?.genre || "默认"}风格`,
    description: `服务于${outline?.genre || config?.genre || "当前类型"}的写作风格。`,
    toneAndAtmosphere: "",
    emotionalRhythm: "",
    contrastPatterns: "",
    humorStyle: "",
    tensionTechniques: "",
    suspenseTechniques: "",
    narrativePov: "third_person",
    tense: "past",
    pacing: "balanced",
    sentenceRhythm: "",
    vocabularyLevel: "现代白话，避免生僻字。",
    dialogueStyle: "",
    chapterOpeningStyle: "",
    chapterEndingStyle: "",
    writingRules: [],
    avoidList: [],
  };
}

export function buildFallbackChapterDraft(input: {
  novel: { title: string; genre?: string | null };
  order: number;
  title: string;
  summary: string;
  previousChapters: Array<{ order: number; title: string; content?: string; summary?: string; ending?: string }>;
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

// ===== Phase 结果管理 =====

export async function getPhaseOutput(jobId: string, phase: string, step: string): Promise<any> {
  const result = await prisma.phaseResult.findUnique({
    where: { jobId_phase_step: { jobId, phase, step } },
  });
  if (!result) throw new Error(`未找到 ${phase}/${step} 的生成结果，请先完成该步骤。`);
  return JSON.parse(result.output);
}

export async function savePhaseResult(
  jobId: string,
  phase: string,
  step: string,
  input: any,
  output: any,
  selfReviewFn?: (content: any, type: string) => Promise<{ score: number; comment: string; issues: string[] }>,
) {
  // selfReview 改为可选：有则调用，无则跳过（节省 LLM 调用）
  let score = 0;
  let comment = "";
  let issues: string[] = [];
  if (selfReviewFn) {
    try {
      const review = await selfReviewFn(output, step);
      score = review.score;
      comment = review.comment;
      issues = review.issues;
    } catch {}
  }

  await prisma.phaseResult.upsert({
    where: { jobId_phase_step: { jobId, phase, step } },
    create: {
      jobId,
      phase,
      step,
      input: JSON.stringify(input),
      output: JSON.stringify(output),
      selfScore: score,
      selfComment: comment,
      issues: JSON.stringify(issues),
      status: "completed",
    },
    update: {
      input: JSON.stringify(input),
      output: JSON.stringify(output),
      selfScore: score,
      selfComment: comment,
      issues: JSON.stringify(issues),
      status: "completed",
    },
  });
}

export async function confirmPhaseResults(jobId: string, phase: string) {
  await prisma.phaseResult.updateMany({
    where: { jobId, phase, status: "completed" },
    data: {
      status: "confirmed",
      confirmedByUser: false,
    },
  });
}

export async function updateJobProgress(jobId: string, phase: string, step: string) {
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

// ===== 资产持久化 =====

export async function saveToKnowledgeBase(novelId: string, category: string, title: string, content: any) {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  await persistGeneratedAssets(novelId, category, content);

  const existing = await prisma.knowledgeAsset.findFirst({
    where: { novelId, category, title },
  });

  let assetId: string;
  if (existing) {
    await prisma.knowledgeAsset.update({
      where: { id: existing.id },
      data: { content: contentStr, updatedAt: new Date() },
    });
    assetId = existing.id;
  } else {
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

export async function persistGeneratedAssets(novelId: string, category: string, content: any) {
  try {
    if (category === "outline" && content && Object.keys(content).length) {
      await prisma.novel.update({
        where: { id: novelId },
        data: {
          genre: content.genre || undefined,
          outline: formatNovelOutline(content),
        },
      });
    }

    if (category === "worldview" && content?.name) {
      // 确保所有字段都是字符串（LLM 可能返回数组）
      const ensureString = (val: any): string => {
        if (Array.isArray(val)) return val.join("\n");
        if (typeof val === "object") return JSON.stringify(val);
        return val || "";
      };

      await prisma.worldview.upsert({
        where: { novelId_name: { novelId, name: content.name } },
        create: {
          novelId,
          name: content.name,
          summary: ensureString(content.summary),
          rules: ensureString(content.rules),
          geography: ensureString(content.geography),
          factions: ensureString(content.factions),
          history: ensureString(content.history),
          powerSystem: typeof content.powerSystem === "string" ? content.powerSystem : JSON.stringify(content.powerSystem || {}),
        },
        update: {
          summary: ensureString(content.summary),
          rules: ensureString(content.rules),
          geography: ensureString(content.geography),
          factions: ensureString(content.factions),
          history: ensureString(content.history),
          powerSystem: typeof content.powerSystem === "string" ? content.powerSystem : JSON.stringify(content.powerSystem || {}),
        },
      });
    }

    if (category === "worldview" && !content?.name) {
      const novel = await prisma.novel.findUnique({ where: { id: novelId } });
      const fallback = buildFallbackWorldview({
        genre: novel?.genre,
        coreSetting: novel?.outline,
        mainConflict: novel?.outline,
      });
      await persistGeneratedAssets(novelId, "worldview", fallback);
    }

    if (category === "style") {
      const style = content && Object.keys(content).length
        ? content
        : buildFallbackStyle({}, {});
      const existing = await prisma.styleProfile.findFirst({
        where: { novelId, isDefault: true },
      });
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
        pacing: typeof style.pacing === 'object' ? JSON.stringify(style.pacing) : (style.pacing || "balanced"),
        sentenceLength: style.sentenceRhythm || style.sentenceLength || "mixed",
        vocabulary: typeof style.vocabulary === 'object' ? JSON.stringify(style.vocabulary) : (style.vocabularyLevel || style.vocabulary || "modern"),
        dialogueRatio: style.dialogueStyle ? "balanced" : (style.dialogueRatio || "balanced"),
        emotionIntensity: style.emotionIntensity || "medium",
        humorLevel: style.humorStyle ? "medium" : (style.humorLevel || "low"),
        customRules: JSON.stringify(enhancedStyle),
        styleDna: style.styleDna ? JSON.stringify(style.styleDna) : undefined,
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
            keyEvents: JSON.stringify(volume.keyEvents || []),
            turningPoint: volume.turningPoint || "",
            climax: volume.climax || "",
            foreshadowsPlanned: JSON.stringify(volume.foreshadowsPlanned || []),
            characterArcs: JSON.stringify(volume.characterArcs || []),
            targetWordCount: volume.targetWordCount || 0,
          },
          update: {
            title: volume.title || `第${index + 1}卷`,
            goal: volume.goal || "",
            conflict: volume.conflict || "",
            emotion: volume.emotion || "",
            newChars: JSON.stringify(volume.newChars || []),
            mapName: volume.mapName || "",
            endHook: volume.endHook || "",
            keyEvents: JSON.stringify(volume.keyEvents || []),
            turningPoint: volume.turningPoint || "",
            climax: volume.climax || "",
            foreshadowsPlanned: JSON.stringify(volume.foreshadowsPlanned || []),
            characterArcs: JSON.stringify(volume.characterArcs || []),
            targetWordCount: volume.targetWordCount || 0,
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
              chapterType: chapter.chapterType || "mission",
              readerPromise: chapter.readerPromise || "",
              chapterFunction: chapter.chapterFunction || "",
              requiredReaderEmotion: JSON.stringify(chapter.requiredReaderEmotion || []),
              payoffChainRefs: JSON.stringify(chapter.payoffChainRefs || []),
              comedyMechanism: chapter.comedyMechanism || "",
              endingQuestion: chapter.endingQuestion || "",
            },
            update: {
              volumeId: volume.id,
              title: chapter.title || `第${globalOrder}章`,
              goal: chapter.goal || "",
              conflict: chapter.conflict || "",
              emotion: chapter.emotion || "",
              hook: chapter.hook || "",
              pleasurePoint: chapter.pleasurePoint || "",
              chapterType: chapter.chapterType || "mission",
              readerPromise: chapter.readerPromise || "",
              chapterFunction: chapter.chapterFunction || "",
              requiredReaderEmotion: JSON.stringify(chapter.requiredReaderEmotion || []),
              payoffChainRefs: JSON.stringify(chapter.payoffChainRefs || []),
              comedyMechanism: chapter.comedyMechanism || "",
              endingQuestion: chapter.endingQuestion || "",
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

// ===== 自动推进 =====

export async function autoAdvanceOrPause(
  jobId: string,
  phase: string,
  nextPhaseFn: () => void | Promise<void>,
) {
  const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const config = job.config ? JSON.parse(job.config) as PipelineConfig : {};

  if (config.autoContinue) {
    await confirmPhaseResults(jobId, phase);
    await nextPhaseFn();
  } else {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "paused", currentPhase: phase, currentStep: "waiting_confirm" },
    });
  }
}

// ===== 创建 PhaseContext =====

export function createPhaseContext(
  llmService: { completeText: (opts: { system?: string; prompt: string; temperature?: number; maxTokens?: number }) => Promise<string | null> },
  selfReviewFn: (content: any, type: string) => Promise<{ score: number; comment: string; issues: string[] }>,
  buildWorkspaceAssetContextFn: (novelId: string, jobId?: string) => Promise<string>,
  buildBookAnalysisContextFn: (novelId: string, config: PipelineConfig, jobId?: string) => Promise<string>,
  buildImitationPlanContextFn: (novelId: string, config: PipelineConfig, jobId?: string) => Promise<string>,
): PhaseContext {
  return {
    llmService,
    selfReview: selfReviewFn,
    // 不再传 selfReviewFn 给 savePhaseResult，跳过自评 LLM 调用
    savePhaseResult: (jobId, phase, step, input, output) =>
      savePhaseResult(jobId, phase, step, input, output),
    getPhaseOutput,
    confirmPhaseResults,
    updateJobProgress,
    saveToKnowledgeBase,
    persistGeneratedAssets,
    buildWorkspaceAssetContext: buildWorkspaceAssetContextFn,
    buildBookAnalysisContext: buildBookAnalysisContextFn,
    buildImitationPlanContext: buildImitationPlanContextFn,
    safeJson,
    countWords,
    formatNovelOutline,
    buildFallbackWorldview,
    buildFallbackStyle,
    buildFallbackChapterDraft,
  };
}
