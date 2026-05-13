import { Router } from "express";
import { z } from "zod";
import { NovelService } from "../services/NovelService";
import { LlmInvokeService } from "../services/llm/LlmInvokeService";
import { initSSE, writeSSEFrame } from "../llm/streaming";
import { prisma } from "../db/prisma";
import { imitationPlanService } from "../services/ImitationPlanService";
import * as AIService from "../services/AIService";

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
});

const novelUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  inspiration: z.string().nullable().optional(),
  outline: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  status: z.string().trim().min(1).optional(),
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
    const missing: string[] = [];
    if (!latestAnalysis) missing.push("缺拆书");
    if (!latestPlan) missing.push("缺仿写方案");
    if (!characters) missing.push("缺人物卡");
    if (!worldviews) missing.push("缺世界观");
    if (!styleProfiles) missing.push("缺风格配置");
    if (!volumes || !chapterOutlines) missing.push("缺卷纲/章纲");
    if (!hooks) missing.push("缺钩子");
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
        key: "draft",
        label: "自动生成 1-3 章",
        enabled: Boolean(latestPlan),
        reason: latestPlan ? (hasDrafts ? "已有正文，默认不会覆盖已有草稿。" : "已有仿写方案，可生成样章。") : "需要先生成仿写方案。",
        imitationPlanId: latestPlan?.id ?? null,
      },
      {
        key: "continue",
        label: "继续生成下一章",
        enabled: chapters.length > 0,
        reason: chapters.length > 0 ? "可进入章节写作继续扩写。" : "需要先生成或创建章节。",
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
          characters: usedTypes.has("character") ? "已被 Pipeline 使用" : characters ? "已进入知识库" : "未使用",
          worldviews: usedTypes.has("worldview") ? "已被 Pipeline 使用" : worldviews ? "已进入知识库" : "未使用",
          volumes: usedTypes.has("volume") || usedTypes.has("chapter_outline") ? "已被 Pipeline 使用" : volumes ? "已进入知识库" : "未使用",
          hooks: usedTypes.has("hook") ? "已被 Pipeline 使用" : hooks ? "已进入知识库" : "未使用",
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
    const input = novelUpdateSchema.parse(req.body);
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
    res.json({ success: true, data: await novelService.updateChapter(id, chapterId, input) });
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

export default router;
