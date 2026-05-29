import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";
import { updateStoryState, extractMemories } from "./postProcessing";

export async function executeWritingPhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  const config = JSON.parse(job.config) as PipelineConfig;
  const draftCount = Math.max(1, Math.min(config.autoDraftChapters || 3, 3));

  try {
    await ctx.updateJobProgress(jobId, "writing", "chapter_drafts");
    const chapters = await generateInitialChapterDrafts(ctx, jobId, job.novelId, config, draftCount);
    await ctx.savePhaseResult(jobId, "writing", "chapter_drafts", {
      imitationPlanId: config.imitationPlanId,
      bookAnalysisId: config.bookAnalysisId,
      draftCount,
    }, { chapters });
    await ctx.saveToKnowledgeBase(job.novelId, "chapter_draft", "自动仿写样章", { chapters });

    // 续写模式后处理：更新 StoryState + 提取记忆
    if (config.mode === "continue") {
      for (const ch of chapters) {
        if ((ch as any).skipped || !ch.content) continue;
        try {
          await updateStoryState(job.novelId, ch.order, ch.content);
          await extractMemories(job.novelId, ch.id, ch.content);
        } catch (e) {
          console.warn(`[writingPhase] 第${ch.order}章后处理失败:`, e);
        }
      }
    }

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

async function generateInitialChapterDrafts(ctx: PhaseContext, jobId: string, novelId: string, config: PipelineConfig, count: number) {
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
    pipelineVersion >= 2
      ? prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "planning", step: "chapter_outline_vol_1" } },
        })
      : prisma.phaseResult.findUnique({
          where: { jobId_phase_step: { jobId, phase: "structuring", step: "chapter_outline" } },
        }),
    ctx.buildWorkspaceAssetContext(novelId, jobId),
    prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } }),
  ]);

  const blueprint = ctx.safeJson(plan?.blueprint, {});
  const chapterTemplate = ctx.safeJson(plan?.chapterTemplate, {});
  const sampleDrafts = ctx.safeJson(plan?.sampleDrafts, []);
  const outline = outlineResult ? parseLlmJson(outlineResult.output) || {} : {};
  const chapterOutline = chapterOutlineResult ? parseLlmJson(chapterOutlineResult.output) || {} : {};
  const enhancedFields = styleProfile ? ctx.safeJson(styleProfile.customRules, {}) : {};
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
        const parsed = parseLlmJson(volRes.output) || {};
        for (const ch of (parsed?.chapters || [])) {
          enrichedChaptersMap.set(globalOrder, ch);
          globalOrder++;
        }
      }
    }
  }

  const chapterCards = resolveChapterCards(chapterTemplate, chapterOutline, count);
  const previousChapters: Array<{ order: number; title: string; content: string }> = [];
  const generated = [];

  for (let index = 0; index < count; index += 1) {
    const order = index + 1;
    const card = chapterCards[index] ?? {};
    const baseTitle = card.title || card.chapterTitle || `第${order}章`;
    const title = await resolveGeneratedChapterTitle(ctx, {
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

    const draft = await generateChapterDraft(ctx, {
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
        wordCount: ctx.countWords(draft),
        status: "drafted",
        source: config.imitationPlanId ? "imitation_pipeline" : "pipeline",
      },
    });
    previousChapters.push({ order, title, content: draft.slice(0, 1200) });
    generated.push(updated);
  }

  return generated;
}

async function generateChapterDraft(ctx: PhaseContext, input: {
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
  enrichedChapter?: any;
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
  const characters = extractCharacterCards(input.workspaceContext);
  const characterBlock = characters || "";

  // 提取大纲核心信息
  const outlineCore = extractOutlineCore(input.outline);

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

${buildEnrichedChapterBlock(input.enrichedChapter)}

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

  const result = await ctx.llmService.completeText({
    system,
    prompt,
    temperature: 0.78,
    maxTokens: Math.max(2000, Math.min(4500, Math.round(input.targetWordCount * 2))),
  });

  return result?.trim() || ctx.buildFallbackChapterDraft(input);
}

function buildEnrichedChapterBlock(enriched: any): string {
  if (!enriched) return "";

  const parts: string[] = [];
  parts.push("【本章详细规划 — 必须严格遵守】");

  if (Array.isArray(enriched.characters) && enriched.characters.length > 0) {
    const charDesc = enriched.characters.map((c: any) =>
      `${c.name}（目标：${c.goal || "无"}，行动：${c.action || "无"}）`
    ).join("、");
    parts.push(`出场角色：${charDesc}`);
  }

  if (Array.isArray(enriched.hooksPlanted) && enriched.hooksPlanted.length > 0) {
    const hooksDesc = enriched.hooksPlanted.map((h: any) =>
      `「${h.title}」（类型：${h.type}，强度：${h.intensity}，计划第${h.plannedResolveChapter || "?"}章揭示）：${h.description || ""}`
    ).join("\n  ");
    parts.push(`本章埋设钩子：\n  ${hooksDesc}`);
  }

  if (Array.isArray(enriched.hooksResolved) && enriched.hooksResolved.length > 0) {
    const resolvedDesc = enriched.hooksResolved.map((h: any) =>
      `「${h.title}」：${h.resolvedDescription || ""}`
    ).join("、");
    parts.push(`本章回收钩子：${resolvedDesc}`);
  }

  if (Array.isArray(enriched.foreshadowPlanted) && enriched.foreshadowPlanted.length > 0) {
    const fsDesc = enriched.foreshadowPlanted.map((f: any) =>
      `「${f.title}」（计划第${f.plannedPayoffChapter || "?"}章回收）：${f.description || ""}`
    ).join("\n  ");
    parts.push(`本章埋设伏笔：\n  ${fsDesc}`);
  }

  if (Array.isArray(enriched.foreshadowPayoff) && enriched.foreshadowPayoff.length > 0) {
    const payoffDesc = enriched.foreshadowPayoff.map((f: any) =>
      `「${f.title}」：${f.payoffDescription || ""}`
    ).join("、");
    parts.push(`本章回收伏笔：${payoffDesc}`);
  }

  if (enriched.pleasurePoint && typeof enriched.pleasurePoint === "object") {
    const pp = enriched.pleasurePoint;
    parts.push(`爽点设计：${pp.description || "无"}（类型：${pp.type || "无"}，强度：${pp.intensity || 5}）`);
  }

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

function extractCharacterCards(workspaceContext: string): string {
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

function extractOutlineCore(outline: any): string {
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

async function resolveGeneratedChapterTitle(ctx: PhaseContext, input: {
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
    '要求：5-15个字，不要包含”第X章”，不要使用书名号，不要解释。',
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
    const result = await ctx.llmService.completeText({
      prompt,
      temperature: 0.72,
      maxTokens: 80,
    });
    const title = result?.trim().replace(/^["'《""]+|["'》""]+$/g, "").replace(/^第[一二三四五六七八九十百千万\d]+章[:：\s-]*/, "");
    return title || input.baseTitle || `第${input.order}章`;
  } catch {
    return input.baseTitle || `第${input.order}章`;
  }
}

function resolveChapterCards(chapterTemplate: any, chapterOutline: any, count: number) {
  const templateChapters = Array.isArray(chapterTemplate?.volumes)
    ? chapterTemplate.volumes.flatMap((volume: any) => Array.isArray(volume.chapters) ? volume.chapters : [])
    : [];
  const outlineChapters = Array.isArray(chapterOutline?.chapterOutlines)
    ? chapterOutline.chapterOutlines.flatMap((volume: any) => Array.isArray(volume.chapters) ? volume.chapters : [])
    : [];
  return [...templateChapters, ...outlineChapters].slice(0, count);
}
