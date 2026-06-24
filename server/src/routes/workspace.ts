import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { LlmInvokeService } from "../services/llm/LlmInvokeService";

/** 返回本地时区日期字符串 YYYY-MM-DD，避免 UTC 时区偏移问题 */
function localDate(d?: Date): string {
  const date = d || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const router = Router();
const llmService = new LlmInvokeService();

/** 英文情绪/阶段 → 中文映射 */
const EMOTION_MAP: Record<string, string> = {
  neutral: "平和", tension: "紧张", release: "释放", depression: "压抑",
  climax: "高潮", calm: "平和", excited: "兴奋", sad: "悲伤",
  happy: "开心", angry: "愤怒", fear: "恐惧", surprise: "惊讶",
};
const PHASE_MAP: Record<string, string> = {
  setup: "铺垫", development: "发展", climax: "高潮", resolution: "收束",
  rising_action: "上升", falling_action: "下降", exposition: "展开",
  opening: "开篇", ending: "结局", middle: "中段",
};
function mapEmotion(v?: string | null): string {
  if (!v) return "平和";
  return EMOTION_MAP[v.toLowerCase()] || v;
}
function mapPhase(v?: string | null): string {
  if (!v) return "铺垫";
  return PHASE_MAP[v.toLowerCase()] || v;
}

const idSchema = z.object({ id: z.string().trim().min(1) });
const chapterIdSchema = z.object({
  id: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

// GET /novels/:id/workspace-data - 统一工作台数据
router.get("/:id/workspace-data", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const [novel, chapters, characters, foreshadows, storyState, volumes, chapterOutlines, emotionCurves, worldviews] = await Promise.all([
      prisma.novel.findUnique({ where: { id }, select: { title: true, targetWordCount: true, chaptersPerVol: true } }),
      prisma.chapter.findMany({ where: { novelId: id }, orderBy: { order: "asc" }, select: { id: true, order: true, title: true, wordCount: true, status: true, source: true } }),
      prisma.character.findMany({ where: { novelId: id }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, name: true, role: true, identity: true, motivation: true, appearance: true, background: true, relationsText: true, notes: true, arcSummary: true, arcDetail: true, speechStyle: true, powerLevel: true, firstAppear: true, lastAppear: true, appearanceCount: true } }),
      prisma.foreshadow.findMany({ where: { novelId: id }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, description: true, status: true, plantChapter: true, payoffChapter: true } }),
      prisma.storyState.findUnique({ where: { novelId: id } }),
      prisma.volume.findMany({ where: { novelId: id }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true, sortOrder: true } }),
      prisma.chapterOutline.findMany({ where: { novelId: id }, select: { sortOrder: true, emotion: true, conflict: true, chapterType: true, readerPromise: true } }),
      prisma.emotionCurve.findMany({ where: { novelId: id }, orderBy: { chapterOrder: "desc" }, take: 10, select: { chapterOrder: true, isClimax: true } }),
      prisma.worldview.findMany({ where: { novelId: id }, select: { id: true, name: true, summary: true, rules: true, powerSystem: true, geography: true, factions: true, history: true, culture: true, customNotes: true } }),
    ]);

    const outlineMap = new Map(chapterOutlines.map(co => [co.sortOrder, co]));
    const cpv = novel?.chaptersPerVol || 20;

    const enrichedChapters = chapters.map(ch => {
      const outline = outlineMap.get(ch.order);
      const volume = volumes.find(v => v.sortOrder === Math.ceil(ch.order / cpv));
      return {
        ...ch,
        volumeTitle: volume?.title || volumes[0]?.title || undefined,
        emotion: outline?.emotion || undefined,
        conflict: outline?.conflict || undefined,
        chapterType: outline?.chapterType || undefined,
        readerPromise: outline?.readerPromise || undefined,
      };
    });

    const signals = {
      mood: mapEmotion(storyState?.currentEmotion),
      rhythm: mapPhase(storyState?.currentPhase),
      climax: emotionCurves.some(ec => ec.isClimax),
    };

    const today = localDate();
    const todaySession = await prisma.writingSession.findUnique({
      where: { novelId_date: { novelId: id, date: today } },
    });

    const recentSessions = await prisma.writingSession.findMany({
      where: { novelId: id },
      orderBy: { date: "desc" },
      take: 30,
      select: { date: true },
    });
    let streak = 0;
    const checkDate = new Date();
    for (const session of recentSessions) {
      const expected = localDate(checkDate);
      if (session.date === expected) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
    const targetWordCount = novel?.targetWordCount || 100000;
    const remaining = Math.max(0, targetWordCount - totalWordCount);
    const avgSpeed = todaySession?.wordCount && todaySession?.duration
      ? todaySession.wordCount / (todaySession.duration / 60)
      : 500;
    const estimatedMinutes = Math.round(remaining / avgSpeed);
    const estimatedTime = estimatedMinutes > 60
      ? `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`
      : `${estimatedMinutes}m`;

    res.json({
      success: true,
      data: {
        novel: { title: novel?.title, targetWordCount },
        chapters: enrichedChapters,
        characters,
        worldviews,
        foreshadows,
        storyState: storyState ? {
          currentEmotion: mapEmotion(storyState.currentEmotion),
          emotionIntensity: storyState.emotionIntensity,
          currentPhase: mapPhase(storyState.currentPhase),
          protagonistGoal: storyState.protagonistGoal,
          tensionAccumulation: storyState.tensionAccumulation,
        } : null,
        signals,
        writingStats: {
          todayWordCount: todaySession?.wordCount || 0,
          targetWordCount: novel?.targetWordCount || 100000,
          totalWordCount,
          streakDays: streak,
          estimatedTime,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /novels/:id/writing-stats - 写作统计
router.get("/:id/writing-stats", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const today = localDate();

    const [novel, todaySession, chapters] = await Promise.all([
      prisma.novel.findUnique({ where: { id }, select: { targetWordCount: true } }),
      prisma.writingSession.findUnique({ where: { novelId_date: { novelId: id, date: today } } }),
      prisma.chapter.findMany({ where: { novelId: id }, select: { wordCount: true } }),
    ]);

    const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

    const recentSessions = await prisma.writingSession.findMany({
      where: { novelId: id },
      orderBy: { date: "desc" },
      take: 30,
      select: { date: true },
    });
    let streak = 0;
    const checkDate = new Date();
    for (const session of recentSessions) {
      if (session.date === localDate(checkDate)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }

    res.json({
      success: true,
      data: {
        todayWordCount: todaySession?.wordCount || 0,
        streakDays: streak,
        totalWordCount,
        targetWordCount: novel?.targetWordCount || 100000,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /novels/:id/chapters/:chapterId/ai-review - 读取已有评审结果
router.get("/:id/chapters/:chapterId/ai-review", async (req, res, next) => {
  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);

    // 读取最新存储的评审结果
    const reviewMemory = await prisma.memory.findFirst({
      where: { novelId: id, chapterId, type: "evaluation", category: "chapter_review" },
      orderBy: { createdAt: "desc" },
      select: { content: true, createdAt: true },
    });

    if (reviewMemory) {
      try {
        const review = JSON.parse(reviewMemory.content);
        return res.json({ success: true, data: review });
      } catch { /* fall through */ }
    }

    // 兼容旧版 chapter_score
    const scoreMemory = await prisma.memory.findFirst({
      where: { novelId: id, chapterId, type: "evaluation", category: "chapter_score" },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    if (scoreMemory) {
      try {
        const parsed = JSON.parse(scoreMemory.content);
        return res.json({
          success: true,
          data: {
            overallScore: parsed.overall_score || parsed.score || 0,
            dimensions: {
              hook: parsed.hook_score || 0,
              plot: parsed.plot_score || 0,
              character: parsed.character_score || 0,
              writing: parsed.writing_score || 0,
              excitement: parsed.excitement_score || 0,
            },
            comment: parsed.comment || "",
            suggestions: [],
            readerFeedback: [],
            commercialPotential: "",
          },
        });
      } catch { /* fall through */ }
    }

    // 兜底：使用 pipeline qualityScore
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { qualityScore: true },
    });

    res.json({
      success: true,
      data: {
        overallScore: chapter?.qualityScore || 0,
        dimensions: { hook: 0, plot: 0, character: 0, writing: 0, excitement: 0 },
        comment: "",
        suggestions: [],
        readerFeedback: [],
        commercialPotential: "",
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /novels/:id/chapters/:chapterId/ai-review - 生成 AI 评审
router.post("/:id/chapters/:chapterId/ai-review", async (req, res, next) => {
  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);

    // 加载章节及上下文
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, order: true, title: true, content: true, wordCount: true, novelId: true },
    });
    if (!chapter || !chapter.content) {
      return res.status(400).json({ success: false, error: "章节内容为空" });
    }

    // 加载前后章节摘要（提供上下文）
    const [prevChapter, nextChapter] = await Promise.all([
      prisma.chapter.findFirst({
        where: { novelId: id, order: chapter.order - 1 },
        select: { title: true, summary: true, content: true },
      }),
      prisma.chapter.findFirst({
        where: { novelId: id, order: chapter.order + 1 },
        select: { title: true, summary: true },
      }),
    ]);

    // 加载小说大纲和章纲
    const [novel, chapterOutline, characters, storyState] = await Promise.all([
      prisma.novel.findUnique({
        where: { id },
        select: { title: true, genre: true, outline: true, inspiration: true },
      }),
      prisma.chapterOutline.findFirst({
        where: { novelId: id, sortOrder: chapter.order },
        select: { title: true, goal: true, emotion: true, conflict: true, hook: true },
      }),
      prisma.character.findMany({
        where: { novelId: id },
        select: { name: true, role: true, identity: true, motivation: true },
        take: 10,
      }),
      prisma.storyState.findUnique({
        where: { novelId: id },
        select: { currentPhase: true, currentEmotion: true, protagonistGoal: true },
      }),
    ]);

    // 构建上下文
    const prevContext = prevChapter
      ? `【上一章】${prevChapter.title}\n摘要：${prevChapter.summary || "无"}\n结尾片段：${prevChapter.content?.slice(-300) || ""}`
      : "这是第一章";

    const outlineContext = novel?.outline
      ? `【小说大纲】\n${novel.outline.slice(0, 1000)}`
      : "";

    const chapterOutlineContext = chapterOutline
      ? `【本章章纲】\n标题：${chapterOutline.title}\n目标：${chapterOutline.goal || "无"}\n情绪：${chapterOutline.emotion || "无"}\n冲突：${chapterOutline.conflict || "无"}\n钩子：${chapterOutline.hook || "无"}`
      : "";

    const characterContext = characters.length > 0
      ? `【主要角色】\n${characters.map(c => `${c.name}（${c.role || "未知"}）：${c.identity || ""}，动机：${c.motivation || "未知"}`).join("\n")}`
      : "";

    // 商业编辑 + 读者模拟 + 运营分析的综合评审 prompt
    const system = `你是一名资深网文商业编辑，同时具备以下三种视角：
1. 商业编辑视角：关注作品的商业价值、读者留存、付费转化潜力
2. 番茄/起点读者模拟器：模拟三类典型读者（快节奏党、角色党、设定党）的阅读体验
3. 连载运营分析师：关注章节节奏、钩子效果、追更动力

你的评审必须专业、具体、有建设性，不能泛泛而谈。`;

    const prompt = `请对以下网文章节进行专业评审。

【小说信息】
书名：${novel?.title || "未知"}
类型：${novel?.genre || "未知"}

${outlineContext}

${characterContext}

${prevContext}

【待评审章节】
第${chapter.order}章：${chapter.title}
字数：${chapter.wordCount || chapter.content.length}
${chapterOutlineContext}

章节正文：
${chapter.content.slice(0, 6000)}

---

请按以下结构进行评审，严格使用 JSON 格式输出：

{
  "overallScore": 综合评分(1-10, 保留一位小数),
  "dimensions": {
    "hook": 钩子效果评分(1-10),
    "plot": 剧情推进评分(1-10),
    "character": 人物塑造评分(1-10),
    "writing": 文笔质量评分(1-10),
    "excitement": 爽感指数评分(1-10)
  },
  "comment": "50字以内的总体评价",
  "suggestions": [
    {"type": "问题类型(hook/plot/character/writing/excitement)", "severity": "high/medium/low", "description": "具体问题描述", "suggestion": "修改建议"}
  ],
  "readerFeedback": [
    {"readerType": "快节奏党/角色党/设定党", "score": 评分(1-10), "comment": "该类读者的真实反馈"}
  ],
  "commercialPotential": "商业潜力评估(50字内，含留存率预估和付费转化分析)",
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["问题1", "问题2"]
}

评审要点：
1. 钩子效果：开头300字是否能抓住读者？章末钩子是否有效？
2. 剧情推进：本章是否推动了主线/支线？有没有水字数？
3. 人物塑造：对话是否有个人特色？行为是否符合人设？
4. 文笔质量：是否有AI味词汇？节奏是否合理？
5. 爽感指数：有没有爽点释放？情绪曲线是否合理？
6. 三类读者分别会怎么评价这章？`;

    const result = await llmService.completeText({
      system,
      prompt,
      temperature: 0.3,
      maxTokens: 2000,
    });

    if (!result) {
      return res.status(500).json({ success: false, error: "评审生成失败" });
    }

    // 解析 JSON
    let review: any;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      review = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result);
    } catch {
      return res.status(500).json({ success: false, error: "评审结果解析失败" });
    }

    // 确保字段完整
    const normalizedReview = {
      overallScore: review.overallScore || review.overall_score || 0,
      dimensions: {
        hook: review.dimensions?.hook || review.hook_score || 0,
        plot: review.dimensions?.plot || review.plot_score || 0,
        character: review.dimensions?.character || review.character_score || 0,
        writing: review.dimensions?.writing || review.writing_score || 0,
        excitement: review.dimensions?.excitement || review.excitement_score || 0,
      },
      comment: review.comment || "",
      suggestions: review.suggestions || [],
      readerFeedback: review.readerFeedback || [],
      commercialPotential: review.commercialPotential || "",
      strengths: review.strengths || [],
      weaknesses: review.weaknesses || [],
      generatedAt: new Date().toISOString(),
    };

    // 保存到 Memory 表
    await prisma.memory.create({
      data: {
        novelId: id,
        chapterId,
        type: "evaluation",
        category: "chapter_review",
        title: `第${chapter.order}章评审`,
        content: JSON.stringify(normalizedReview),
        importance: 5,
      },
    });

    // 同步更新 chapter.qualityScore
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { qualityScore: Math.round(normalizedReview.overallScore) },
    });

    res.json({ success: true, data: normalizedReview });
  } catch (error) {
    next(error);
  }
});

// POST /novels/:id/chapters/:chapterId/polish - 章节润色
router.post("/:id/chapters/:chapterId/polish", async (req, res, next) => {
  try {
    const { id, chapterId } = chapterIdSchema.parse(req.params);
    const { mode, userHint } = req.body as { mode: "review" | "custom"; userHint?: string };

    // 加载章节
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, order: true, title: true, content: true, wordCount: true },
    });
    if (!chapter || !chapter.content) {
      return res.status(400).json({ success: false, error: "章节内容为空" });
    }

    // 如果是根据评审润色，加载评审结果
    let reviewContext = "";
    if (mode === "review") {
      const reviewMemory = await prisma.memory.findFirst({
        where: { novelId: id, chapterId, type: "evaluation", category: "chapter_review" },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      });
      if (reviewMemory) {
        try {
          const review = JSON.parse(reviewMemory.content);
          const issues = (review.suggestions || []).map((s: any) => `- [${s.severity}] ${s.description}：${s.suggestion}`).join("\n");
          const weaknesses = (review.weaknesses || []).map((w: string) => `- ${w}`).join("\n");
          reviewContext = `
【评审报告摘要】
综合评分：${review.overallScore}/10
五维评分：钩子${review.dimensions?.hook || 0} | 剧情${review.dimensions?.plot || 0} | 人物${review.dimensions?.character || 0} | 文笔${review.dimensions?.writing || 0} | 爽感${review.dimensions?.excitement || 0}

待改进项：
${weaknesses || "无"}

具体建议：
${issues || "无"}`;
        } catch { /* ignore */ }
      }
    }

    // 加载章节大纲（提供润色方向）
    const chapterOutline = await prisma.chapterOutline.findFirst({
      where: { novelId: id, sortOrder: chapter.order },
      select: { title: true, goal: true, emotion: true, conflict: true, hook: true },
    });
    const outlineContext = chapterOutline
      ? `\n【章纲】目标：${chapterOutline.goal}，情绪：${chapterOutline.emotion}，冲突：${chapterOutline.conflict}，钩子：${chapterOutline.hook}`
      : "";

    const system = `# Role: AI 文章润色师 (AI Text Polisher & Humanizer)

## Profile:
- Language: 中文
- Description: 专注于将 AI 生成的文章转化为地道、流畅、富有吸引力的人类写作风格的专家。致力于在保留核心信息的同时，消除内容的机械感，注入人情味与阅读的乐趣。

## Background:
你是一位深谙中文语境下的写作艺术与 AI 语言模型特性的资深编辑。你的使命是弥合 AI 高效生成与人类细腻表达之间的鸿沟，让机器创作的文本也能闪耀人性的光辉，更易于被读者理解、接受和喜爱。

## Core Skills:
1. 敏锐洞察力：精准识别 AI 写作的典型模式（如刻板句式、缺乏情感、过渡生硬等）
2. 风格感知与适应：能够根据文章目标受众、预期语调和内容主题，灵活调整语言风格
3. 语言重塑力：熟练运用丰富的词汇、多样的句式和修辞手法进行文本润色与重构
4. 情感与个性化注入：自然地融入情感色彩、个人视角和生动细节，提升文章的温度感和代入感
5. 逻辑与流畅性优化：确保思路清晰，过渡自然，逻辑链条完整顺畅

## Guidelines for Humanization:
1. 句式灵动：长短结合，并列、从句、口语化表达交替使用
2. 词汇鲜活：用具体、形象、有温度的词替换中性、抽象、生硬的词。多用动词，少用被动
3. 自然过渡：使用更隐性、符合思维流的连接方式
4. 视角与情感：适度引入感叹、反问，通过描绘细节引发共鸣。展示而非说教 (Show, don't tell)
5. 互动感营造：适当使用设问、直接称呼读者，邀请读者思考
6. 节奏把控：张弛有度，模仿人类写作的自然起伏
7. 避免 AI 习语：坚决去除"值得注意的是"、"不难发现"、"基于以上分析"等高频 AI 特征短语
8. 口语化与书面语平衡：根据文章性质和目标读者，恰当把握口语化表达和书面语规范的平衡

## Constraints:
- 忠于原意：核心信息、关键数据不得篡改或遗漏
- 风格匹配：优化后的风格需符合原文的主题、目的和目标受众
- 自然为本：避免过度修饰或炫技，追求真诚、自然的表达
- 逻辑严谨：优化过程不能破坏原文的逻辑结构
- 杜绝新"AI 味"：严格遵守 Guidelines for Humanization

## 网文特别要求：
- 保持网文的爽感和节奏，不要改成传统文学风格
- 对话要符合人物性格，不要千人一面
- 场景描写要有功能性（推进剧情/揭示人物/营造氛围）
- 钩子和爽点必须保留并强化`;

    const userRequest = mode === "review"
      ? `请根据评审报告对以下章节进行润色优化，重点改进评审指出的问题。`
      : `请根据以下用户要求对章节进行润色：${userHint || "提升文笔质量，去除 AI 味"}`;

    const prompt = `${userRequest}
${reviewContext}
${outlineContext}

【原文】
${chapter.content}

---

请直接输出润色后的完整章节内容，不要添加任何解释或标记。保持原有的章节标题和格式。`;

    const result = await llmService.completeText({
      system,
      prompt,
      temperature: 0.7,
      maxTokens: Math.max(chapter.content.length * 2, 8000),
    });

    if (!result) {
      return res.status(500).json({ success: false, error: "润色失败" });
    }

    // 清理可能的 markdown 代码块标记
    let polished = result.trim();
    if (polished.startsWith("```")) {
      polished = polished.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    }

    res.json({
      success: true,
      data: {
        original: chapter.content,
        polished,
        wordCount: polished.replace(/\s/g, "").length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /novels/:id/radar-scores - 雷达图评分
router.get("/:id/radar-scores", async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const [pleasurePoints, emotionCurves, foreshadows] = await Promise.all([
      prisma.pleasurePoint.findMany({ where: { novelId: id }, orderBy: { chapterOrder: "desc" }, take: 10, select: { intensity: true } }),
      prisma.emotionCurve.findMany({ where: { novelId: id }, orderBy: { chapterOrder: "desc" }, take: 10, select: { intensity: true, tensionLevel: true } }),
      prisma.foreshadow.findMany({ where: { novelId: id }, select: { status: true } }),
    ]);

    const pleasureDensity = pleasurePoints.length > 0
      ? Math.round(pleasurePoints.reduce((s, p) => s + p.intensity, 0) / pleasurePoints.length)
      : 5;

    const emotionWave = emotionCurves.length > 0
      ? Math.round(emotionCurves.reduce((s, e) => s + e.intensity, 0) / emotionCurves.length)
      : 5;

    const planted = foreshadows.filter(f => f.status === "planted").length;
    const paidOff = foreshadows.filter(f => f.status === "paid_off").length;
    const infoRelease = planted + paidOff > 0
      ? Math.round((paidOff / (planted + paidOff)) * 10)
      : 3;

    res.json({
      success: true,
      data: { pleasureDensity, emotionWave, infoRelease },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
