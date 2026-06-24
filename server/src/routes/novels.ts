import { Router } from "express";
import { z } from "zod";
import { NovelService } from "../services/NovelService";
import { LlmInvokeService } from "../services/llm/LlmInvokeService";
import { initSSE, writeSSEFrame } from "../llm/streaming";
import { prisma } from "../db/prisma";
import { imitationPlanService } from "../services/ImitationPlanService";
import * as AIService from "../services/AIService";
import { chapterRevisionService } from "../services/ChapterRevisionService";

/** 返回本地时区日期字符串 YYYY-MM-DD，避免 UTC 时区偏移问题 */
function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const router = Router();
const novelService = new NovelService();
const llmService = new LlmInvokeService();

const idSchema = z.object({ id: z.string().trim().min(1) });
const chapterIdSchema = z.object({
  id: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

const novelCreateSchema = z.object({
  title: z.string().trim().min(1, "小说名不能为空。"),
  inspiration: z.string().trim().optional(),
  outline: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  synopsis: z.string().trim().optional(),
  targetWordCount: z.number().int().min(10000).max(10000000).optional(),
  chapterWordMin: z.number().int().min(500).max(10000).optional(),
  chapterWordMax: z.number().int().min(1000).max(20000).optional(),
  volumeCount: z.number().int().min(1).max(100).optional(),
  chaptersPerVol: z.number().int().min(1).max(200).optional(),
});

const novelUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  inspiration: z.string().nullable().optional(),
  outline: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  targetWordCount: z.number().int().min(10000).max(10000000).nullable().optional(),
  chapterWordMin: z.number().int().min(500).max(10000).nullable().optional(),
  chapterWordMax: z.number().int().min(1000).max(20000).nullable().optional(),
  volumeCount: z.number().int().min(1).max(100).nullable().optional(),
  chaptersPerVol: z.number().int().min(1).max(200).nullable().optional(),
  status: z.string().trim().min(1).optional(),
  // 7 层 Prompt 架构新增字段
  coreSellingPoint: z.string().nullable().optional(),
  corePayoffs: z.string().nullable().optional(),
  coreConflict: z.string().nullable().optional(),
  readerExpectations: z.string().nullable().optional(),
});

const chapterCreateSchema = z.object({
  title: z.string().trim().min(1, "章节名不能为空。"),
  summary: z.string().trim().optional(),
  order: z.number().int().min(1).optional(),
});

const chapterUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  summary: z.string().nullable().optional(),
  content: z.string().optional(),
  status: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
});

router.get("/", async (_req, res, next) => {
  try {
    res.json({ success: true, data: await novelService.listNovels() });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = novelCreateSchema.parse(req.body);
    res.status(201).json({ success: true, data: await novelService.createNovel(input) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/imitation-plans", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    res.json({ success: true, data: await imitationPlanService.listByNovel(id) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/workflow-status", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const novel = await prisma.novel.findUnique({ where: { id } });
    if (!novel) {
      res.status(404).json({ success: false, error: "小说不存在。" });
      return;
    }

    const [
      analysisBindings,
      imitationPlans,
      pipelineJob,
      chapters,
      assetCounts,
      recentUsage,
    ] = await Promise.all([
      prisma.bookAnalysisBinding.findMany({
        where: { novelId: id },
        orderBy: { createdAt: "desc" },
        include: { analysis: { include: { sections: { orderBy: { sortOrder: "asc" } } } } },
      }),
      prisma.imitationPlan.findMany({ where: { novelId: id }, orderBy: { updatedAt: "desc" }, take: 5 }),
      prisma.pipelineJob.findUnique({ where: { novelId: id }, include: { phaseResults: true } }),
      prisma.chapter.findMany({ where: { novelId: id }, orderBy: { order: "asc" } }),
      Promise.all([
        prisma.character.count({ where: { novelId: id } }),
        prisma.worldview.count({ where: { novelId: id } }),
        prisma.volume.count({ where: { novelId: id } }),
        prisma.chapterOutline.count({ where: { novelId: id } }),
        prisma.mainline.count({ where: { novelId: id } }),
        prisma.hook.count({ where: { novelId: id } }),
        prisma.knowledgeAsset.count({ where: { novelId: id } }),
        prisma.memory.count({ where: { novelId: id } }),
        prisma.styleProfile.count({ where: { novelId: id } }),
      ]),
      prisma.assetUsageRecord.findMany({
        where: { novelId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    const latestBinding = analysisBindings[0] ?? null;
    const latestAnalysis = latestBinding?.analysis ?? null;
    const latestPlan = imitationPlans[0] ?? null;
    const firstThree = [1, 2, 3].map((order) => {
      const chapter = chapters.find((item) => item.order === order);
      return chapter
        ? {
            id: chapter.id,
            order: chapter.order,
            title: chapter.title,
            status: chapter.status,
            source: chapter.source,
            wordCount: chapter.wordCount,
            hasContent: Boolean(chapter.content?.trim()),
          }
        : { order, title: `第${order}章`, status: "missing", source: null, wordCount: 0, hasContent: false };
    });

    const [characters, worldviews, volumes, chapterOutlines, mainlines, hooks, knowledgeAssets, memories, styleProfiles] = assetCounts;
    const usedTypes = new Set(recentUsage.map((item) => item.assetType));

    // 独立创作模式：有灵感但无拆书/仿写方案，Pipeline 可从灵感直接生成全部资产
    const hasExistingChapters = chapters.some((ch: any) => ch.content?.trim());
    const isStandalone = Boolean(novel.inspiration?.trim()) && !latestAnalysis && !latestPlan && !hasExistingChapters;
    // 续写模式：已有章节内容但无拆书/仿写方案
    const isContinue = hasExistingChapters && !latestAnalysis && !latestPlan;

    const missing: string[] = [];
    if (isStandalone || isContinue) {
      // 独立创作/续写模式：拆书/仿写方案非必需，只提示 Pipeline 会自动生成的资产
      if (!characters) missing.push("缺人物卡（将自动生成）");
      if (!worldviews) missing.push("缺世界观（将自动生成）");
      if (!styleProfiles) missing.push("缺风格配置（将自动生成）");
      if (!volumes || !chapterOutlines) missing.push("缺卷纲/章纲（将自动生成）");
      if (!hooks) missing.push("缺钩子（将自动生成）");
    } else {
      if (!latestAnalysis) missing.push("缺拆书");
      if (!latestPlan) missing.push("缺仿写方案");
      if (!characters) missing.push("缺人物卡");
      if (!worldviews) missing.push("缺世界观");
      if (!styleProfiles) missing.push("缺风格配置");
      if (!volumes || !chapterOutlines) missing.push("缺卷纲/章纲");
      if (!hooks) missing.push("缺钩子");
    }
    const hasDrafts = firstThree.some((chapter) => chapter.hasContent);

    const nextActions = [
      {
        key: "analysis",
        label: "查询资料并拆书",
        enabled: true,
        reason: latestAnalysis ? "已有绑定拆书，可查看或重做。" : "缺拆书，建议先补齐参考资料。",
      },
      {
        key: "imitation",
        label: "生成仿写方案",
        enabled: Boolean(latestAnalysis),
        reason: latestPlan ? "已有仿写方案，可直接生成正文。" : latestAnalysis ? "拆书已完成，可生成蓝图和章纲。" : "需要先完成拆书。",
      },
      {
        key: "standalone",
        label: "从灵感一键生成全部",
        enabled: isStandalone,
        reason: isStandalone
          ? "基于创作灵感，先生成大纲供你审核确认，确认后再生成世界观、人物、钩子和前 1-3 章。"
          : hasExistingChapters ? "已有章节内容，请使用智能续写。" : latestAnalysis ? "已有拆书资料，请使用仿写流程。" : "需要先填写创作灵感。",
      },
      {
        key: "continue",
        label: "智能续写",
        enabled: isContinue,
        reason: isContinue
          ? "从已有章节提取大纲、人物、世界观，规划卷纲章纲后继续创作。每个阶段可确认调整。"
          : hasExistingChapters ? "已有拆书/仿写方案，请使用对应流程。" : "需要先有已写章节。",
      },
      {
        key: "draft",
        label: "自动生成 1-3 章",
        enabled: Boolean(latestPlan),
        reason: latestPlan ? (hasDrafts ? "已有正文，默认不会覆盖已有草稿。" : "已有仿写方案，可生成样章。") : "需要先生成仿写方案。",
        imitationPlanId: latestPlan?.id ?? null,
      },
    ];

    const usageCounts = recentUsage.reduce<Record<string, number>>((acc, item) => {
      acc[item.assetType] = (acc[item.assetType] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        novel,
        bookAnalysis: latestAnalysis ? {
          id: latestAnalysis.id,
          title: latestAnalysis.title,
          status: latestAnalysis.status,
          sectionTotal: latestAnalysis.sections.length,
          sectionCompleted: latestAnalysis.sections.filter((section) => section.status === "succeeded").length,
          usedForImitation: latestAnalysis.sections.filter((section) => section.usedForImitation !== false).length,
          materialized: Boolean(latestAnalysis.publishedAssetId),
          sourceTitle: latestAnalysis.sourceTitle,
        } : null,
        imitation: latestPlan ? {
          id: latestPlan.id,
          title: latestPlan.title,
          status: latestPlan.status,
          hasBlueprint: Boolean(latestPlan.blueprint && latestPlan.blueprint !== "{}"),
          hasChapterTemplate: Boolean(latestPlan.chapterTemplate && latestPlan.chapterTemplate !== "{}"),
          sampleDraftCount: (() => {
            try {
              const parsed = JSON.parse(latestPlan.sampleDrafts || "[]");
              return Array.isArray(parsed) ? parsed.length : 0;
            } catch {
              return 0;
            }
          })(),
          materialized: Boolean(latestPlan.knowledgeAssetId),
          pipelineJobId: latestPlan.pipelineJobId,
        } : null,
        assets: {
          characters,
          worldviews,
          volumes,
          chapterOutlines,
          mainlines,
          hooks,
          knowledgeAssets,
          memories,
          styleProfiles,
        },
        adoption: {
          characters: usedTypes.has("character") ? "已被流水线使用" : characters ? "已进入知识库" : "未使用",
          worldviews: usedTypes.has("worldview") ? "已被流水线使用" : worldviews ? "已进入知识库" : "未使用",
          volumes: usedTypes.has("volume") || usedTypes.has("chapter_outline") ? "已被流水线使用" : volumes ? "已进入知识库" : "未使用",
          hooks: usedTypes.has("hook") ? "已被流水线使用" : hooks ? "已进入知识库" : "未使用",
          styleProfiles: styleProfiles ? "已进入知识库" : "未使用",
        },
        chapters: {
          total: chapters.length,
          drafted: chapters.filter((chapter) => chapter.content?.trim()).length,
          firstThree,
        },
        pipeline: pipelineJob ? {
          id: pipelineJob.id,
          status: pipelineJob.status,
          currentPhase: pipelineJob.currentPhase,
          currentStep: pipelineJob.currentStep,
          progress: pipelineJob.progress,
          updatedAt: pipelineJob.updatedAt,
          phaseResults: pipelineJob.phaseResults.map((result) => ({
            phase: result.phase,
            step: result.step,
            status: result.status,
            selfScore: result.selfScore,
          })),
        } : null,
        usage: {
          countsByType: usageCounts,
          recent: recentUsage,
        },
        nextActions,
        creationMode: isContinue ? "continue" : isStandalone ? "standalone" : "imitation",
        health: {
          missing,
          warnings: hasDrafts ? ["已有正文默认不会被自动覆盖。"] : [],
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const novel = await novelService.getNovel(id);
    if (!novel) {
      res.status(404).json({ success: false, error: "小说不存在。" });
      return;
    }
    res.json({ success: true, data: novel });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const parsed = novelUpdateSchema.parse(req.body);
    // 转换 null 为 undefined（Prisma 更新不接受 null）
    const input = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, v === null ? undefined : v])
    );
    res.json({ success: true, data: await novelService.updateNovel(id, input) });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    await novelService.deleteNovel(id);
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/chapters", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const input = chapterCreateSchema.parse(req.body);
    res.status(201).json({ success: true, data: await novelService.createChapter(id, input) });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/chapters/:chapterId", async (req, res, next) => {
  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);
    const input = chapterUpdateSchema.parse(req.body);
    const existingChapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { wordCount: true, content: true, title: true } });

    if (input.content && existingChapter?.content && input.content !== existingChapter.content) {
      chapterRevisionService.createRevision(chapterId, existingChapter.content, existingChapter.title).catch(() => {});
    }

    const result = await novelService.updateChapter(id, chapterId, input);
    res.json({ success: true, data: result });

    // Fire-and-forget: update writing session stats
    const today = localDate();
    const newWordCount = input.content ? input.content.replace(/\s/g, "").length : 0;
    const oldWordCount = existingChapter?.wordCount || 0;
    const wordDelta = newWordCount - oldWordCount;
    if (wordDelta > 0) {
      prisma.writingSession.upsert({
        where: { novelId_date: { novelId: id, date: today } },
        update: { wordCount: { increment: wordDelta } },
        create: { novelId: id, date: today, wordCount: wordDelta },
      }).catch(() => {});
    }
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/chapters/:chapterId", async (req, res, next) => {
  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);
    await novelService.deleteChapter(id, chapterId);
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

// 获取章节版本历史
router.get("/:id/chapters/:chapterId/revisions", async (req, res, next) => {
  try {
    const { chapterId } = chapterIdSchema.parse(req.params);
    const revisions = await chapterRevisionService.getRevisions(chapterId);
    res.json({ success: true, data: revisions });
  } catch (error) {
    next(error);
  }
});

// 回滚到指定版本
router.post("/:id/chapters/:chapterId/revisions/:revision/rollback", async (req, res, next) => {
  try {
    const { chapterId } = chapterIdSchema.parse(req.params);
    const { revision } = z.object({ revision: z.string() }).parse(req.params);
    const chapter = await chapterRevisionService.rollbackToRevision(chapterId, parseInt(revision));
    res.json({ success: true, data: chapter });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/generation-logs", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const logs = await prisma.generationLog.findMany({
      where: { novelId: id },
      orderBy: { id: "desc" },
      take: 50,
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// 生成章纲
router.post("/:id/chapters/:chapterId/generate-outline", async (req, res, next) => {
  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);
    const novel = await novelService.getNovel(id);
    const chapter = novel?.chapters.find((item) => item.id === chapterId);
    if (!novel || !chapter) {
      res.status(404).json({ success: false, error: "小说或章节不存在。" });
      return;
    }

    const result = await AIService.generateChapterOutlineForChapter({
      novelId: id,
      chapterId,
    });

    res.json({ success: true, data: { outline: result } });
  } catch (error) {
    next(error);
  }
});

// 生成章节内容
router.post("/:id/chapters/:chapterId/generate", async (req, res) => {
  const startTime = Date.now();
  let logId: string | null = null;

  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);
    const mode = req.body?.mode || "append";
    
    const novel = await novelService.getNovel(id);
    const chapter = novel?.chapters.find((item) => item.id === chapterId);
    if (!novel || !chapter) {
      return res.status(404).json({ success: false, error: "小说或章节不存在。" });
    }

    // 创建生成日志
    const log = await prisma.generationLog.create({
      data: {
        novelId: id,
        chapterId,
        taskType: mode === "replace" ? "chapter_regeneration" : "chapter_continuation",
        status: "running",
      },
    });
    logId = log.id;

    // 根据模式决定是否使用已有内容
    const existingContent = mode === "append" ? chapter.content : "";

    // 设置响应头，支持流式输出
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // 显示章节信息
    res.write(`═══════════════════════════════════════════\n`);
    res.write(`  第${chapter.order}章\n`);
    res.write(`═══════════════════════════════════════════\n\n`);

    // 先生成章节标题（如果需要）
    let chapterTitle = chapter.title;
    if (mode === "replace" || !chapter.title || chapter.title.startsWith("第")) {
      try {
        const titlePrompt = `请为以下小说章节生成一个有吸引力的标题（不要用"第X章"这种格式）：

小说：${novel.title}
类型：${novel.genre || "未指定"}
章节序号：第${chapter.order}章
章节目标：${chapter.summary || "推进剧情"}

要求：
- 标题要有吸引力，能引起读者兴趣
- 5-15个字
- 不要用"第X章"格式

直接输出标题，不要其他内容。`;

        const titleResult = await llmService.completeText({
          prompt: titlePrompt,
          temperature: 0.8,
          maxTokens: 50,
        });
        
        if (titleResult) {
          chapterTitle = titleResult.trim().replace(/^["']|["']$/g, '');
          res.write(`【${chapterTitle}】\n\n`);
        }
      } catch (e) {
        // 标题生成失败不影响正文生成
      }
    } else {
      res.write(`【${chapterTitle}】\n\n`);
    }

    let fullContent = "";
    for await (const chunk of llmService.streamChapterDraft({
      novelTitle: novel.title,
      inspiration: novel.inspiration,
      outline: novel.outline,
      genre: novel.genre,
      chapterTitle: chapterTitle,
      chapterSummary: chapter.summary,
      existingContent,
    })) {
      fullContent += chunk;
      res.write(chunk);
    }

    // 根据模式决定最终内容
    const finalContent = mode === "append" 
      ? (chapter.content || "") + fullContent
      : fullContent;

    // 计算字数
    const wordCount = finalContent.replace(/\s/g, '').length;

    // 保存生成的内容和标题
    await novelService.updateChapter(id, chapterId, {
      title: chapterTitle,
      content: finalContent,
      status: "drafted",
    });

    // 多维度AI评分
    res.write(`\n\n═══════════════════════════════════════════\n`);
    res.write(`  AI质量评分\n`);
    res.write(`═══════════════════════════════════════════\n`);
    res.write(`  字数：${wordCount}字\n\n`);
    
    try {
      const scorePrompt = `请对以下章节内容进行多维度评分（1-10分）：

【章节内容】
${finalContent.substring(0, 2000)}

请从以下维度评分，并给出简短评价：
1. 剧情质量 - 情节是否紧凑、有逻辑
2. 钩子效果 - 章末是否有吸引力
3. 人物塑造 - 人物是否鲜活、一致
4. 文笔质量 - 语言是否流畅、有文采
5. 爽感指数 - 读起来是否过瘾

请用JSON格式输出：
{
  "plot_score": 8,
  "hook_score": 7,
  "character_score": 8,
  "writing_score": 7,
  "excitement_score": 8,
  "overall_score": 7.6,
  "comment": "总体评价"
}`;

      const scoreResult = await llmService.completeText({
        prompt: scorePrompt,
        temperature: 0.3,
        maxTokens: 500,
      });

      if (scoreResult) {
        try {
          const jsonMatch = scoreResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const scores = JSON.parse(jsonMatch[0]);
            res.write(`  剧情质量：${scores.plot_score}/10\n`);
            res.write(`  钩子效果：${scores.hook_score}/10\n`);
            res.write(`  人物塑造：${scores.character_score}/10\n`);
            res.write(`  文笔质量：${scores.writing_score}/10\n`);
            res.write(`  爽感指数：${scores.excitement_score}/10\n`);
            res.write(`  ─────────────────\n`);
            res.write(`  综合评分：${scores.overall_score}/10\n`);
            res.write(`  评价：${scores.comment || "无"}\n`);
            
            // 保存评分到记忆系统
            await prisma.memory.create({
              data: {
                novelId: id,
                type: "evaluation",
                category: "chapter_score",
                title: `第${chapter.order}章评分`,
                content: JSON.stringify(scores),
                importance: 5,
                chapterId,
              },
            });
          }
        } catch (e) {
          res.write(`  评分解析失败\n`);
        }
      }
    } catch (e) {
      res.write(`  评分生成失败\n`);
    }

    // 保存到知识库
    res.write(`\n═══════════════════════════════════════════\n`);
    res.write(`  知识库同步\n`);
    res.write(`═══════════════════════════════════════════\n`);
    
    try {
      await prisma.knowledgeAsset.create({
        data: {
          novelId: id,
          title: `第${chapter.order}章 - ${chapterTitle}`,
          category: "chapter",
          content: finalContent,
          tags: `第${chapter.order}章,${novel.genre || ""},章节`,
        },
      });
      res.write(`  ✓ 已保存到知识库\n`);
    } catch (e) {
      res.write(`  ✗ 知识库保存失败\n`);
    }

    // 自动提取记忆
    res.write(`\n═══════════════════════════════════════════\n`);
    res.write(`  记忆提取\n`);
    res.write(`═══════════════════════════════════════════\n`);
    
    try {
      const memoryPrompt = `请从以下章节内容中提取关键信息，用于记忆系统。

【章节内容】
${finalContent.substring(0, 2000)}

请提取以下类型的记忆：
1. 世界记忆（world）：世界观设定、规则、地理等
2. 角色记忆（character）：人物特征、关系变化、成长
3. 剧情记忆（plot）：关键事件、转折点、冲突
4. 伏笔记忆（foreshadow）：埋设的伏笔、悬念

请用JSON格式输出：
{
  "memories": [
    {
      "type": "world",
      "title": "记忆标题",
      "content": "记忆内容",
      "importance": 8
    }
  ]
}`;

      const memoryResult = await llmService.completeText({
        prompt: memoryPrompt,
        temperature: 0.3,
        maxTokens: 1000,
      });

      if (memoryResult) {
        try {
          const jsonMatch = memoryResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const memoryData = JSON.parse(jsonMatch[0]);
            let savedCount = 0;
            
            for (const mem of memoryData.memories || []) {
              await prisma.memory.create({
                data: {
                  novelId: id,
                  type: mem.type || "plot",
                  category: mem.category || "",
                  title: mem.title || "未命名记忆",
                  content: mem.content || "",
                  importance: mem.importance || 5,
                  chapterId,
                },
              });
              savedCount++;
            }
            
            res.write(`  ✓ 已提取 ${savedCount} 条记忆\n`);
          }
        } catch (e) {
          res.write(`  ✗ 记忆提取解析失败\n`);
        }
      }
    } catch (e) {
      res.write(`  ✗ 记忆提取失败\n`);
    }

    // 更新日志为成功
    await prisma.generationLog.update({
      where: { id: logId },
      data: { status: "succeeded", durationMs: Date.now() - startTime },
    });

    res.write(`\n═══════════════════════════════════════════\n`);
    res.write(`  生成完成\n`);
    res.write(`═══════════════════════════════════════════\n`);
    
    res.end();
  } catch (error) {
    // 更新日志为失败
    if (logId) {
      await prisma.generationLog.update({
        where: { id: logId },
        data: {
          status: "failed",
          errorMsg: error instanceof Error ? error.message : "章节生成失败。",
          durationMs: Date.now() - startTime,
        },
      }).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "章节生成失败。",
    });
  }
});

// ─── 作品健康仪表盘 API ───

/**
 * GET /api/novels/:id/health
 * 返回作品的全面健康指标
 */
router.get("/:id/health", async (req, res) => {
  const parseResult = idSchema.safeParse(req.params);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, error: "无效的作品 ID。" });
  }

  try {
    const novelId = parseResult.data.id;

    // 并行查询所有指标
    const [
      novel,
      totalChapters,
      totalWords,
      hooks,
      foreshadows,
      mainlines,
      characters,
      avgQuality,
      qualityLogs,
      recentEmotions,
      consistencyIssues,
    ] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, select: { targetWordCount: true } }),
      prisma.chapter.count({ where: { novelId, content: { not: "" } } }),
      prisma.chapter.aggregate({ where: { novelId, content: { not: "" } }, _sum: { wordCount: true } }),
      prisma.hook.findMany({ where: { novelId }, select: { status: true } }),
      prisma.foreshadow.findMany({ where: { novelId }, select: { status: true } }),
      prisma.mainline.findMany({ where: { novelId }, select: { status: true } }),
      prisma.character.findMany({ where: { novelId }, select: { name: true, lastAppear: true } }),
      prisma.chapter.aggregate({ where: { novelId, qualityScore: { not: null } }, _avg: { qualityScore: true } }),
      prisma.chapterQualityLog.findMany({
        where: { novelId, checkType: "post_gen" },
        orderBy: { chapterOrder: "asc" },
        select: { chapterOrder: true, scores: true, passed: true, retryCount: true },
      }),
      prisma.emotionCurve.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "desc" },
        take: 50,
        select: { chapterOrder: true, isClimax: true, intensity: true, emotionType: true },
      }),
      prisma.consistencyIssue.findMany({
        where: { novelId, status: "open" },
        select: { type: true, severity: true },
      }),
    ]);

    const targetWords = novel?.targetWordCount || 300000;
    const currentWords = totalWords._sum.wordCount || 0;
    const progress = targetWords > 0 ? Math.round((currentWords / targetWords) * 100) : 0;

    // 钩子回收率
    const hookTotal = hooks.length;
    const hookResolved = hooks.filter(h => h.status === "resolved").length;
    const hookRate = hookTotal > 0 ? Math.round((hookResolved / hookTotal) * 100) : 100;
    const hookOverdue = hooks.filter(h => h.status !== "resolved" && h.status !== "abandoned").length;

    // 伏笔回收率
    const fsTotal = foreshadows.length;
    const fsResolved = foreshadows.filter(f => f.status === "paid_off").length;
    const fsRate = fsTotal > 0 ? Math.round((fsResolved / fsTotal) * 100) : 100;

    // 主线完成度
    const mainlineTotal = mainlines.length;
    const mainlineCompleted = mainlines.filter(m => m.status === "completed").length;
    const mainlineRate = mainlineTotal > 0 ? Math.round((mainlineCompleted / mainlineTotal) * 100) : 100;

    // 沉默角色
    const silentCharacters = characters.filter(c =>
      c.lastAppear && c.lastAppear < totalChapters - 50
    ).length;

    // 质量指标
    const qualityScores = qualityLogs.map(log => {
      try { return JSON.parse(log.scores); } catch { return null; }
    }).filter(Boolean);

    const avgAiSmell = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((sum, s) => sum + (s.aiSmell || 0), 0) / qualityScores.length * 100) / 100
      : 0;

    const wordCountCompliant = qualityLogs.filter(log => {
      try { return JSON.parse(log.scores)?.wordCount >= 8; } catch { return false; }
    }).length;
    const wordCountRate = qualityLogs.length > 0 ? Math.round((wordCountCompliant / qualityLogs.length) * 100) : 100;

    // 情绪节奏
    const emotions = recentEmotions.reverse();
    let consecutiveClimax = 0;
    let maxConsecutiveClimax = 0;
    let consecutiveLow = 0;
    let maxConsecutiveLow = 0;
    for (const emo of emotions) {
      if (emo.isClimax) {
        consecutiveClimax++;
        maxConsecutiveClimax = Math.max(maxConsecutiveClimax, consecutiveClimax);
        consecutiveLow = 0;
      } else {
        consecutiveClimax = 0;
        if (emo.intensity <= 3) {
          consecutiveLow++;
          maxConsecutiveLow = Math.max(maxConsecutiveLow, consecutiveLow);
        } else {
          consecutiveLow = 0;
        }
      }
    }

    // 一致性问题统计
    const issueCounts = {
      hook: consistencyIssues.filter(i => i.type === "hook").length,
      foreshadow: consistencyIssues.filter(i => i.type === "foreshadow").length,
      character: consistencyIssues.filter(i => i.type === "character").length,
      emotion: consistencyIssues.filter(i => i.type === "emotion").length,
      total: consistencyIssues.length,
    };

    // 质量趋势（最近 20 章）
    const qualityTrend = qualityLogs.slice(-20).map(log => {
      try {
        const scores = JSON.parse(log.scores);
        return {
          chapterOrder: log.chapterOrder,
          style: scores.style || 0,
          infoDensity: scores.infoDensity || 0,
          character: scores.character || 0,
          emotion: scores.emotion || 0,
          passed: log.passed,
          retryCount: log.retryCount,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    res.json({
      success: true,
      data: {
        overview: {
          totalChapters,
          totalWords: currentWords,
          targetWords,
          progress,
          avgChapterQuality: Math.round(avgQuality._avg.qualityScore || 0),
        },
        quality: {
          aiSmellRate: avgAiSmell,
          wordCountRate,
          styleScore: qualityScores.length > 0
            ? Math.round(qualityScores.reduce((sum, s) => sum + (s.style || 0), 0) / qualityScores.length * 10) / 10
            : 0,
          infoDensityScore: qualityScores.length > 0
            ? Math.round(qualityScores.reduce((sum, s) => sum + (s.infoDensity || 0), 0) / qualityScores.length * 10) / 10
            : 0,
        },
        lifecycle: {
          hookResolutionRate: hookRate,
          hookTotal,
          hookResolved,
          hookOverdue,
          foreshadowResolutionRate: fsRate,
          foreshadowTotal: fsTotal,
          foreshadowResolved: fsResolved,
          mainlineCompletionRate: mainlineRate,
        },
        characters: {
          total: characters.length,
          silent: silentCharacters,
        },
        emotion: {
          consecutiveClimax: maxConsecutiveClimax,
          consecutiveLow: maxConsecutiveLow,
          recentEmotions: emotions.slice(-20).map(e => ({
            chapterOrder: e.chapterOrder,
            intensity: e.intensity,
            type: e.emotionType,
            isClimax: e.isClimax,
          })),
        },
        consistency: issueCounts,
        qualityTrend,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "获取健康指标失败。",
    });
  }
});

export default router;
