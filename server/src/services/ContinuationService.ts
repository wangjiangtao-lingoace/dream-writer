import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { parseLlmJson } from "../utils/parseJson";
import { updateStoryState, extractMemories } from "./pipeline/postProcessing";

const llmService = new LlmInvokeService();

// ─── 10 条铁律系统 prompt（复用 writingPhase） ───

const WRITING_SYSTEM_PROMPT = `你是一位顶级中文网络小说作家，擅长写出让读者欲罢不能的故事。

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

// ─── 上下文加载 ───

async function loadContinuationContext(novelId: string) {
  const [
    novel,
    characters,
    worldviews,
    hooks,
    foreshadows,
    mainlines,
    memories,
    styleProfile,
    storyState,
    recentChapters,
  ] = await Promise.all([
    prisma.novel.findUnique({ where: { id: novelId } }),
    prisma.character.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.worldview.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 4 }),
    prisma.hook.findMany({ where: { novelId, status: "active" }, orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.foreshadow.findMany({ where: { novelId, status: "planted" }, orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.mainline.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 6 }),
    prisma.memory.findMany({ where: { novelId }, orderBy: [{ importance: "desc" }, { updatedAt: "desc" }], take: 12 }),
    prisma.styleProfile.findFirst({ where: { novelId, isDefault: true } }),
    prisma.storyState.findUnique({ where: { novelId } }),
    prisma.chapter.findMany({
      where: { novelId, status: "drafted" },
      orderBy: { order: "desc" },
      take: 5,
      select: { order: true, title: true, content: true, summary: true },
    }),
  ]);

  return { novel, characters, worldviews, hooks, foreshadows, mainlines, memories, styleProfile, storyState, recentChapters };
}

// ─── 上下文文本构建 ───

function buildCharacterBlock(characters: any[]): string {
  if (!characters.length) return "";
  const lines = characters.map((c) =>
    `- ${c.name}：${[c.role, c.identity, c.motivation, c.arcSummary].filter(Boolean).join(" / ")}`
  );
  return `【人物卡 — 写作时必须保持人物性格一致】\n${lines.join("\n")}`;
}

function buildStyleBlock(style: any): string {
  if (!style) return "";
  const lines: string[] = [];
  const fields = [
    ["toneAndAtmosphere", "基调氛围"],
    ["emotionalRhythm", "情绪节奏"],
    ["contrastPatterns", "反差设计"],
    ["humorStyle", "幽默方式"],
    ["tensionTechniques", "紧张感技巧"],
    ["suspenseTechniques", "悬念技巧"],
    ["sentenceRhythm", "句式节奏"],
    ["dialogueStyle", "对话风格"],
    ["chapterOpeningStyle", "开篇方式"],
    ["chapterEndingStyle", "收尾方式"],
  ];

  let customRules: any = {};
  try { customRules = JSON.parse(style.customRules || "{}"); } catch {}

  for (const [key, label] of fields) {
    const val = style[key] || customRules[key];
    if (val && val !== "无") lines.push(`${label}：${val}`);
  }

  if (Array.isArray(customRules.writingRules) && customRules.writingRules.length) {
    lines.push(`写作规则：${customRules.writingRules.join("；")}`);
  }
  if (Array.isArray(customRules.avoidList) && customRules.avoidList.length) {
    lines.push(`必须避免：${customRules.avoidList.join("；")}`);
  }

  return lines.length > 0 ? `\n${lines.join("\n")}\n` : "";
}

function buildPreviousChaptersBlock(chapters: any[]): string {
  if (!chapters.length) return "【前文衔接】\n这是作品的第一章，需要快速建立人物、冲突和世界观。";
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const lines = sorted.map((c) =>
    `第${c.order}章 ${c.title}（摘要）：${(c.content || "").slice(0, 600)}`
  );
  return `【前文衔接 — 保持剧情连贯性】\n${lines.join("\n\n")}`;
}

function buildHooksBlock(hooks: any[], foreshadows: any[]): string {
  const parts: string[] = [];
  if (hooks.length) {
    parts.push("【未解决的钩子 — 适当推进或回收】");
    for (const h of hooks) {
      parts.push(`- ${h.title}：${h.description || ""}（计划第${h.plannedChapter || "?"}章揭示）`);
    }
  }
  if (foreshadows.length) {
    parts.push("【未回收的伏笔 — 适时安排回收】");
    for (const f of foreshadows) {
      parts.push(`- ${f.title}：${f.description || ""}（计划第${f.payoffChapter || "?"}章回收）`);
    }
  }
  return parts.join("\n");
}

function buildStoryStateBlock(state: any): string {
  if (!state) return "";
  const parts: string[] = ["【当前剧情状态】"];
  parts.push(`当前进度：第${state.currentVolume}卷 第${state.currentChapter}章`);
  parts.push(`剧情阶段：${state.currentPhase}`);
  if (state.protagonistLevel) parts.push(`主角等级：${state.protagonistLevel}`);
  if (state.protagonistGoal) parts.push(`主角目标：${state.protagonistGoal}`);
  if (state.protagonistStatus) parts.push(`主角处境：${state.protagonistStatus}`);
  parts.push(`当前情绪：${state.currentEmotion}（强度${state.emotionIntensity}/10）`);
  if (state.tensionAccumulation > 0) parts.push(`累积压抑值：${state.tensionAccumulation}`);
  if (state.lastPleasureChapter > 0) parts.push(`上次爽点：第${state.lastPleasureChapter}章`);
  return parts.join("\n");
}

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
        .map((c) => `第${c.order}章 ${c.title}：${(c.content || "").slice(0, 300)}`)
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
  outline: string;
  card: any;
  style: any;
  order: number;
  title: string;
  previousChapters: Array<{ order: number; title: string; content: string }>;
  workspaceContext: string;
  targetWordCount: number;
}): Promise<string> {
  const { novel, outline, card, style, order, title, previousChapters, workspaceContext, targetWordCount } = params;

  const characterBlock = buildCharacterBlock(
    (workspaceContext.match(/^- .+$/gm) || []).map((line) => {
      const parts = line.slice(2).split("：");
      return { name: parts[0], role: parts[1]?.split(" / ")[0], identity: parts[1]?.split(" / ")[1] };
    })
  );

  const styleBlock = buildStyleBlock(style);
  const prevBlock = buildPreviousChaptersBlock(previousChapters);

  const summary = [card.goal, card.conflict, card.hook].filter(Boolean).join("；");

  const prompt = `请为「${novel.title}」写第${order}章的完整正文。

【故事核心】
${outline || novel.outline || novel.inspiration || "暂无大纲"}

${characterBlock}

【本章任务】
章节标题：${title}
章节目标：${summary || "继续推进剧情"}

${styleBlock}

${card.characters?.length ? `【出场角色】\n${card.characters.map((c: any) => `${c.name}（目标：${c.goal || "无"}，行动：${c.action || "无"}）`).join("、")}` : ""}

${prevBlock}

【写作要求】
1. 输出纯正文，不要 Markdown 标记，不要提纲，不要解释
2. 目标字数：约 ${targetWordCount} 中文字
3. 场景转换用空行分隔，不要用「场景一」「场景二」这样的标记
4. 对话用引号「」标注，不要用 ""
5. 每段不超过 4 行，保持阅读节奏
6. 章末必须留钩子

请开始写作：`;

  const result = await llmService.completeText({
    system: WRITING_SYSTEM_PROMPT,
    prompt,
    temperature: 0.78,
    maxTokens: Math.max(2000, Math.min(4500, Math.round(targetWordCount * 2))),
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
  }): Promise<Array<{ id: string; order: number; title: string; content: string }>> {
    const { novelId, chapterCount = 1, targetWordCount = 1800 } = params;

    // 加载上下文
    const ctx = await loadContinuationContext(novelId);
    if (!ctx.novel) throw new Error("小说不存在");

    // 获取当前最大章节序号
    const maxChapter = await prisma.chapter.findFirst({
      where: { novelId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const startOrder = (maxChapter?.order || 0) + 1;

    // 构建工作台上下文
    const workspaceContext = this.buildWorkspaceContext(ctx);

    // 构建故事核心
    const outline = ctx.novel.outline || ctx.novel.inspiration || "";

    const results: Array<{ id: string; order: number; title: string; content: string }> = [];
    const previousChapters = ctx.recentChapters
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ order: c.order, title: c.title, content: (c.content || "").slice(0, 1200) }));

    for (let i = 0; i < chapterCount; i++) {
      const nextOrder = startOrder + i;
      console.log(`[ContinuationService] 生成第${nextOrder}章...`);

      // 1. 生成章节大纲
      const card = await generateChapterOutline({
        novel: ctx.novel,
        characters: ctx.characters,
        hooks: ctx.hooks,
        foreshadows: ctx.foreshadows,
        storyState: ctx.storyState,
        recentChapters: previousChapters.slice(-5),
        nextOrder,
      });

      // 2. 生成章节正文
      const content = await generateChapterContent({
        novel: ctx.novel,
        outline,
        card,
        style: ctx.styleProfile,
        order: nextOrder,
        title: card.title || `第${nextOrder}章`,
        previousChapters: previousChapters.slice(-5),
        workspaceContext,
        targetWordCount,
      });

      if (!content) {
        console.warn(`[ContinuationService] 第${nextOrder}章生成失败，跳过`);
        continue;
      }

      // 3. 保存章节
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
        },
      });

      // 4. 更新 StoryState
      await updateStoryState(novelId, nextOrder, content);

      // 5. 提取记忆
      const memoryCount = await extractMemories(novelId, chapter.id, content);
      console.log(`[ContinuationService] 第${nextOrder}章完成，提取${memoryCount}条记忆`);

      // 6. 保存知识资产
      await prisma.knowledgeAsset.create({
        data: {
          novelId,
          title: `第${nextOrder}章 ${card.title}`,
          category: "chapter",
          content: content.slice(0, 2000),
        },
      });

      // 更新前文上下文
      previousChapters.push({ order: nextOrder, title: card.title, content: content.slice(0, 1200) });
      results.push({ id: chapter.id, order: nextOrder, title: card.title, content });
    }

    return results;
  }

  private buildWorkspaceContext(ctx: Awaited<ReturnType<typeof loadContinuationContext>>): string {
    const lines: string[] = ["【当前作品已入库资产】"];

    if (ctx.novel?.outline) {
      lines.push("## 当前作品大纲", ctx.novel.outline);
    }
    if (ctx.characters.length) {
      lines.push("## 人物卡");
      for (const c of ctx.characters) {
        lines.push(`- ${c.name}：${[c.role, c.identity, c.motivation, c.arcSummary].filter(Boolean).join(" / ")}`);
      }
    }
    if (ctx.worldviews.length) {
      lines.push("## 世界观");
      for (const w of ctx.worldviews) {
        lines.push(`- ${w.name}：${[w.summary, w.rules, w.powerSystem].filter(Boolean).join(" / ")}`);
      }
    }
    if (ctx.mainlines.length) {
      lines.push("## 主线");
      for (const m of ctx.mainlines) {
        lines.push(`- ${m.title}：${m.description || ""}`);
      }
    }
    if (ctx.hooks.length) {
      lines.push("## 活跃钩子");
      for (const h of ctx.hooks) {
        lines.push(`- ${h.title}：${h.description || ""}（状态：${h.status}）`);
      }
    }
    if (ctx.memories.length) {
      lines.push("## 高优先级记忆");
      for (const m of ctx.memories) {
        lines.push(`- ${m.title}：${m.content.slice(0, 260)}`);
      }
    }

    return lines.join("\n");
  }
}
