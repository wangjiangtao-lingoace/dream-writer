import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { parseLlmJson } from "../utils/parseJson";
import { mergedPostProcessing } from "./pipeline/postProcessing";
import { autoManageMemories } from "./MemoryCompressionService";
import { ContextAssembler } from "./pipeline/contextAssembler";
import { generateChapterSummary } from "./pipeline/writingPhase";
import { validateChapterQuality } from "./pipeline/qualityCheck";
import { WRITING_SYSTEM_PROMPT, QUALITY_THRESHOLDS } from "./pipeline/writingRules";

const llmService = new LlmInvokeService();

// ─── 章节大纲生成 ───

async function generateChapterOutline(params: {
  novel: any;
  characters: any[];
  hooks: any[];
  foreshadows: any[];
  storyState: any;
  recentChapters: any[];
  nextOrder: number;
}): Promise<any> {
  const { novel, characters, hooks, foreshadows, storyState, recentChapters, nextOrder } = params;

  const recentSummary = recentChapters.length
    ? recentChapters
        .sort((a, b) => a.order - b.order)
        .map((c) => `第${c.order}章 ${c.title}：${(c.summary || "").slice(0, 300)}`)
        .join("\n")
    : "尚无已写章节。";

  const activeHooks = hooks.map((h) => `- ${h.title}：${h.description || ""}`).join("\n");
  const activeForeshadows = foreshadows.map((f) => `- ${f.title}：${f.description || ""}`).join("\n");

  const charList = characters
    .slice(0, 8)
    .map((c) => `${c.name}（${c.role || "角色"}：${c.identity || ""}）`)
    .join("、");

  const prompt = `请为小说「${novel.title}」生成第${nextOrder}章的详细大纲。

【故事背景】
${novel.outline || novel.inspiration || "暂无大纲"}

【主要人物】
${charList || "暂无人物"}

【最近剧情】
${recentSummary}

${activeHooks ? `【未解决钩子】\n${activeHooks}` : ""}
${activeForeshadows ? `【未回收伏笔】\n${activeForeshadows}` : ""}

${storyState ? `【剧情状态】\n阶段：${storyState.currentPhase}，主角目标：${storyState.protagonistGoal || "未知"}，情绪：${storyState.currentEmotion}` : ""}

请输出 JSON：
{
  "title": "章节标题（要有吸引力，4-10字）",
  "goal": "本章要达成的剧情目标",
  "conflict": "本章的核心冲突或矛盾",
  "emotion": "本章的情绪基调（如：紧张/温馨/震撼/悲壮）",
  "hook": "章末钩子设计（让读者想看下一章）",
  "foreshadowing": "本章埋设的伏笔（如有）",
  "pleasurePoint": "本章的爽点设计（如有）",
  "characters": [
    {"name": "角色名", "role": "在本章中的作用", "goal": "本章目标", "action": "关键行动"}
  ]
}

只输出 JSON，不要其他文字。`;

  const result = await llmService.completeText({
    prompt,
    temperature: 0.7,
    maxTokens: 1500,
  });

  return parseLlmJson(result) || {
    title: `第${nextOrder}章`,
    goal: "继续推进剧情",
    conflict: "待定",
    emotion: "neutral",
    hook: "待定",
    characters: [],
  };
}

// ─── 章节正文生成 ───

async function generateChapterContent(params: {
  novel: any;
  card: any;
  order: number;
  title: string;
  compactContext: string;
  targetWordCount: number;
  retryHint?: string;
  styleProfile?: any;
  coreSellingPoint?: string;
}): Promise<string> {
  const { novel, order, title, compactContext, targetWordCount, retryHint, styleProfile, coreSellingPoint } = params;

  const retrySection = retryHint
    ? `\n【重试修正要求 — 必须严格遵守】\n上一版存在以下问题，请务必修正：\n${retryHint}\n`
    : "";

  // 风格约束注入
  const styleSection = styleProfile
    ? `\n【风格约束】\n风格：${styleProfile.name || ""} — ${styleProfile.description || ""}\n${styleProfile.masterWriterStyle ? `作家风格模仿：${styleProfile.masterWriterStyle}\n` : ""}${styleProfile.toneAndAtmosphere ? `基调：${styleProfile.toneAndAtmosphere}\n` : ""}${styleProfile.dialogueStyle ? `对话风格：${styleProfile.dialogueStyle}\n` : ""}${Array.isArray(styleProfile.writingRules) && styleProfile.writingRules.length ? `写作规则：${styleProfile.writingRules.join("；")}\n` : ""}${Array.isArray(styleProfile.avoidList) && styleProfile.avoidList.length ? `避免：${styleProfile.avoidList.join("；")}\n` : ""}`
    : "";

  // 核心卖点注入
  const sellingPointSection = coreSellingPoint
    ? `\n【核心卖点】${coreSellingPoint}\n`
    : "";

  const prompt = `请为「${novel.title}」写第${order}章的完整正文。

${compactContext}
${styleSection}${sellingPointSection}
【写作要求】
1. 输出纯正文，不要 Markdown 标记，不要提纲，不要解释
2. 目标字数：${targetWordCount} 中文字（不少于 ${Math.round(targetWordCount * 0.8)} 字，不超过 ${Math.round(targetWordCount * 1.2)} 字）
3. 场景转换用空行分隔，不要用「场景一」「场景二」这样的标记
4. 对话用引号「」标注，不要用 ""
5. 每段不超过 4 行，保持阅读节奏
6. 章末必须留钩子
7. 必须使用第三人称视角（他/她/角色名），禁止使用「我」「我们」
${retrySection}
请开始写作：`;

  const result = await llmService.completeText({
    system: WRITING_SYSTEM_PROMPT,
    prompt,
    temperature: 0.78,
    maxTokens: Math.max(3000, Math.min(5000, Math.round(targetWordCount * 2))),
  });

  return result?.trim() || "";
}

// ─── 主服务类 ───

export class ContinuationService {
  /**
   * 续写指定数量的章节
   */
  async continueWriting(params: {
    novelId: string;
    chapterCount?: number;
    targetWordCount?: number;
  }): Promise<Array<{ id: string; order: number; title: string; content: string; retryCount: number; estimatedTokens: number }>> {
    const { novelId, chapterCount = 1, targetWordCount = 2500 } = params;

    // 校验小说存在
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) throw new Error("小说不存在");

    // 获取当前最大章节序号
    const maxChapter = await prisma.chapter.findFirst({
      where: { novelId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const startOrder = (maxChapter?.order || 0) + 1;

    // 创建 ContextAssembler
    const assembler = new ContextAssembler(novelId);

    // 优先从 ChapterSummary 表加载前章概要，回退到 Chapter 表
    const summaryRecords = await prisma.chapterSummary.findMany({
      where: { novelId },
      orderBy: { chapterOrder: "desc" },
      take: 5,
      select: { chapterOrder: true, title: true, summary: true, endingState: true },
    });
    let previousChapters: Array<{ order: number; title: string; summary: string; ending: string }>;
    if (summaryRecords.length > 0) {
      previousChapters = summaryRecords.reverse().map(s => ({
        order: s.chapterOrder, title: s.title, summary: s.summary, ending: s.endingState,
      }));
    } else {
      const recentChapters = await prisma.chapter.findMany({
        where: { novelId, status: "drafted" },
        orderBy: { order: "desc" },
        take: 5,
        select: { order: true, title: true, summary: true, content: true },
      });
      previousChapters = recentChapters.reverse().map(ch => ({
        order: ch.order, title: ch.title,
        summary: ch.summary || ch.content.slice(0, 100),
        ending: ch.content.slice(-300),
      }));
    }

    // 加载全量角色列表（大纲生成需要）+ 风格配置 + 核心卖点
    const [characters, hooks, foreshadows, storyState, styleProfile] = await Promise.all([
      prisma.character.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 12 }),
      prisma.hook.findMany({ where: { novelId, status: "active" }, orderBy: { updatedAt: "desc" }, take: 8 }),
      prisma.foreshadow.findMany({ where: { novelId, status: "planted" }, orderBy: { updatedAt: "desc" }, take: 8 }),
      prisma.storyState.findUnique({ where: { novelId } }),
      prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } }),
    ]);

    const results: Array<{ id: string; order: number; title: string; content: string; retryCount: number; estimatedTokens: number }> = [];

    for (let i = 0; i < chapterCount; i++) {
      const nextOrder = startOrder + i;
      console.log(`[ContinuationService] 生成第${nextOrder}章...`);

      // 1. 生成章节大纲
      const card = await generateChapterOutline({
        novel,
        characters,
        hooks,
        foreshadows,
        storyState,
        recentChapters: previousChapters.slice(-5),
        nextOrder,
      });

      // 2. 组装精简上下文
      const compactContext = await assembler.assembleForChapter(nextOrder, card);

      // 3. 生成章节正文 + 质量后验循环
      let content = await generateChapterContent({
        novel,
        card,
        order: nextOrder,
        title: card.title || `第${nextOrder}章`,
        compactContext,
        targetWordCount,
        styleProfile,
        coreSellingPoint: novel.coreSellingPoint || undefined,
      });

      if (!content) {
        console.warn(`[ContinuationService] 第${nextOrder}章生成失败，跳过`);
        continue;
      }

      // 质量后验：正则检测 + LLM 评分，不合格则重试
      let retryCount = 0;
      let qualityResult = await validateChapterQuality(
        { llmService } as any, novelId, nextOrder, content, targetWordCount, card,
      );

      while (!qualityResult.passed && qualityResult.shouldRetry && retryCount < QUALITY_THRESHOLDS.MAX_RETRY_COUNT) {
        retryCount++;
        console.log(`[ContinuationService] 第${nextOrder}章质量不合格，第${retryCount}次重试`);
        content = await generateChapterContent({
          novel,
          card,
          order: nextOrder,
          title: card.title || `第${nextOrder}章`,
          compactContext,
          targetWordCount,
          retryHint: qualityResult.retryHint,
          styleProfile,
          coreSellingPoint: novel.coreSellingPoint || undefined,
        });
        qualityResult = await validateChapterQuality(
          { llmService } as any, novelId, nextOrder, content, targetWordCount, card,
        );
      }

      // 保存质量日志
      await prisma.chapterQualityLog.create({
        data: {
          novelId,
          chapterOrder: nextOrder,
          checkType: "post_gen",
          scores: JSON.stringify(qualityResult.scores),
          issues: JSON.stringify(qualityResult.issues),
          retryCount,
          passed: qualityResult.passed,
        },
      }).catch((e) => console.warn(`[ContinuationService] 质量日志保存失败:`, e));

      // 4. 保存章节（含质量字段）
      const qualityScore = qualityResult.passed ? 8 : 5;

      const chapter = await prisma.chapter.create({
        data: {
          novelId,
          order: nextOrder,
          title: card.title || `第${nextOrder}章`,
          content,
          summary: card.goal || "",
          wordCount: content.length,
          status: "drafted",
          source: "continuation",
          qualityScore,
          aiSmellCount: Math.round(qualityResult.scores.aiSmell * content.length / 100),
          reviewStatus: qualityResult.passed ? "approved" : "reviewed",
        },
      });

      // 5. 合并后处理：1次LLM调用完成 storyState + 记忆 + 角色状态 + 知识边界
      await mergedPostProcessing(novelId, chapter.id, nextOrder, content, card).catch((e) =>
        console.warn(`[ContinuationService] 第${nextOrder}章后处理失败:`, e)
      );
      await autoManageMemories(novelId, nextOrder).catch((e) =>
        console.warn(`[ContinuationService] 第${nextOrder}章记忆管理失败:`, e)
      );

      // 7. 保存知识资产
      await prisma.knowledgeAsset.create({
        data: {
          novelId,
          title: `第${nextOrder}章 ${card.title}`,
          category: "chapter",
          content: content.slice(0, 2000),
        },
      });

      // 8. 快速摘要直接取正文前100字（省1次LLM调用）
      const quickSummary = content.slice(0, 100);
      previousChapters.push({ order: nextOrder, title: card.title, summary: quickSummary, ending: content.slice(-300) });

      // 9. 结构化概要存入 ChapterSummary 表（异步，不阻塞）
      generateChapterSummary({ llmService } as any, nextOrder, card.title, content).then(async (structured) => {
        try {
          await prisma.chapterSummary.upsert({
            where: { novelId_chapterOrder: { novelId, chapterOrder: nextOrder } },
            create: { novelId, chapterOrder: nextOrder, title: card.title, ...structured },
            update: { title: card.title, ...structured, updatedAt: new Date() },
          });
        } catch (e) {
          console.warn(`[ContinuationService] 第${nextOrder}章概要存储失败:`, e);
        }
      }).catch(() => {});

      // 估算 token 消耗：每次 generateChapterContent 调用约消耗 promptTokens + 内容长度
      // 初次生成 + retryCount 次重试 = (1 + retryCount) 次 LLM 调用
      const totalCalls = 1 + retryCount;
      const promptTokens = 1500; // 粗估 system prompt + context 的 token 数
      const estimatedTokens = Math.round((promptTokens + content.length) * totalCalls);

      results.push({ id: chapter.id, order: nextOrder, title: card.title, content, retryCount, estimatedTokens });
    }

    return results;
  }
}
