import { prisma } from "../../db/prisma";
import { getRagRetrieveService } from "../RagRetrieveService";

/**
 * 按需组装章级创作上下文
 *
 * 核心原则：章纲是创作蓝图（完整传递），其余上下文只传精简摘要。
 * 每章上下文约 1,200-1,500 tokens，相比全量 JSON（~15,000 tokens）节省 90%。
 */
export class ContextAssembler {
  constructor(private novelId: string) {}

  /**
   * 组装某章的精简创作上下文
   */
  async assembleForChapter(chapterOrder: number, chapterOutline: any): Promise<string> {
    const [characters, worldview, style, summaryData, novel, ragContext, memories, storyState, activeHooks, plantedForeshadows] = await Promise.all([
      this.loadInvolvedCharacters(chapterOutline),
      this.loadWorldviewSummary(),
      this.loadStyleCompact(),
      this.loadRecentSummaries(chapterOrder, 5),
      this.loadNovelMeta(),
      this.loadRagContext(chapterOutline),
      this.loadRelevantMemories(chapterOrder),
      this.loadStoryState(),
      this.loadActiveHooks(),
      this.loadPlantedForeshadows(),
    ]);

    return buildCompactContext({
      novelMeta: novel,
      outline: null,
      enrichedChapter: chapterOutline,
      style,
      previousChapters: summaryData.recent,
      milestoneSummaries: summaryData.milestones,
      characters,
      worldview,
      ragContext,
      memories,
      storyState,
      activeHooks,
      plantedForeshadows,
    });
  }

  /**
   * 只加载本章出场的角色精简卡片
   */
  private async loadInvolvedCharacters(outline: any) {
    const names: string[] = (outline?.characters || []).map((c: any) => c.name).filter(Boolean);
    if (names.length === 0) return [];

    return prisma.character.findMany({
      where: { novelId: this.novelId, name: { in: names } },
      select: { name: true, role: true, identity: true, motivation: true, arcSummary: true },
    });
  }

  /**
   * 只加载世界观精简信息（扩展到 300 字）
   */
  private async loadWorldviewSummary() {
    const wv = await prisma.worldview.findFirst({
      where: { novelId: this.novelId },
      select: { name: true, summary: true, rules: true, powerSystem: true },
    });
    if (!wv) return null;

    let powerSystemName = "";
    try {
      powerSystemName = JSON.parse(wv.powerSystem || "{}")?.name || "";
    } catch { /* ignore */ }

    return {
      name: wv.name,
      summary: wv.summary?.slice(0, 300) || "",
      rules: wv.rules?.slice(0, 300) || "",
      powerSystem: powerSystemName,
    };
  }

  /**
   * 只加载风格精简信息
   */
  private async loadStyleCompact() {
    const sp = await prisma.styleProfile.findFirst({
      where: { novelId: this.novelId, isDefault: true },
      select: { name: true, description: true, pacing: true, customRules: true },
    });
    if (!sp) return null;

    let rules: any = {};
    try { rules = JSON.parse(sp.customRules || "{}"); } catch { /* ignore */ }

    return {
      name: sp.name,
      description: sp.description,
      toneAndAtmosphere: rules.toneAndAtmosphere?.slice(0, 100) || "",
      pacing: sp.pacing,
      chapterOpeningStyle: rules.chapterOpeningStyle?.slice(0, 50) || "",
      chapterEndingStyle: rules.chapterEndingStyle?.slice(0, 50) || "",
      dialogueStyle: rules.dialogueStyle?.slice(0, 50) || "",
      writingRules: Array.isArray(rules.writingRules) ? rules.writingRules.slice(0, 3) : [],
      avoidList: Array.isArray(rules.avoidList) ? rules.avoidList.slice(0, 3) : [],
    };
  }

  /**
   * 加载前 N 章概要 + 每 50 章的里程碑摘要
   * 返回 { recent, milestones } 结构
   */
  private async loadRecentSummaries(currentOrder: number, count: number) {
    // 1. 最近 N 章详细概要
    const summaries = await prisma.chapterSummary.findMany({
      where: {
        novelId: this.novelId,
        chapterOrder: { lt: currentOrder, gte: currentOrder - count },
      },
      orderBy: { chapterOrder: "desc" },
      select: { chapterOrder: true, title: true, summary: true, endingState: true },
    });

    const recent = summaries.length > 0
      ? summaries.map(s => ({
          order: s.chapterOrder,
          title: s.title,
          summary: s.summary,
          ending: s.endingState,
        }))
      : await this.loadRecentChaptersFallback(currentOrder, count);

    // 2. 每 50 章一个的里程碑摘要（写第 300 章时，包含第 250、200、150... 章的摘要）
    const milestones: Array<{ order: number; title: string; summary: string }> = [];
    const milestoneOrders: number[] = [];
    for (let m = Math.floor((currentOrder - 1) / 50) * 50; m > 0; m -= 50) {
      milestoneOrders.push(m);
    }

    if (milestoneOrders.length > 0) {
      const milestoneSummaries = await prisma.chapterSummary.findMany({
        where: {
          novelId: this.novelId,
          chapterOrder: { in: milestoneOrders },
        },
        orderBy: { chapterOrder: "desc" },
        select: { chapterOrder: true, title: true, summary: true },
      });
      for (const ms of milestoneSummaries) {
        milestones.push({ order: ms.chapterOrder, title: ms.title, summary: ms.summary });
      }
    }

    return { recent, milestones };
  }

  private async loadRecentChaptersFallback(currentOrder: number, count: number) {
    const chapters = await prisma.chapter.findMany({
      where: {
        novelId: this.novelId,
        order: { lt: currentOrder, gte: currentOrder - count },
        content: { not: "" },
      },
      orderBy: { order: "desc" },
      select: { order: true, title: true, summary: true, content: true },
    });
    return chapters.map(ch => ({
      order: ch.order,
      title: ch.title,
      summary: ch.summary || ch.content.slice(0, 100),
      ending: ch.content.slice(-300),
    }));
  }

  /**
   * 加载作品元信息
   */
  private async loadNovelMeta() {
    const novel = await prisma.novel.findUnique({
      where: { id: this.novelId },
      select: { title: true, genre: true, synopsis: true },
    });
    return {
      title: novel?.title || "",
      genre: novel?.genre || "",
      theme: novel?.synopsis?.slice(0, 100) || "",
    };
  }

  /**
   * 通过 RAG 检索与本章相关的历史上下文（设定、角色、情节等）
   */
  private async loadRagContext(chapterOutline: any): Promise<string> {
    const ragService = getRagRetrieveService();
    if (!ragService) return "";

    // 用章纲的关键信息作为检索 query
    const queryParts: string[] = [];
    if (chapterOutline?.title) queryParts.push(chapterOutline.title);
    if (chapterOutline?.goal) queryParts.push(chapterOutline.goal);
    if (chapterOutline?.conflict) queryParts.push(chapterOutline.conflict);
    const charNames = (chapterOutline?.characters || []).map((c: any) => c.name).filter(Boolean);
    if (charNames.length > 0) queryParts.push(charNames.join(" "));

    const query = queryParts.join(" ").slice(0, 200);
    if (!query.trim()) return "";

    try {
      return await ragService.retrieve(query, { novelId: this.novelId, topK: 5 });
    } catch {
      return "";
    }
  }

  /**
   * 加载高重要度记忆（角色关系、关键剧情、世界观规则等）
   * 同时更新记忆访问追踪
   */
  private async loadRelevantMemories(chapterOrder: number): Promise<Array<{ type: string; title: string; content: string }>> {
    // 加载重要度 >= 6 的记忆，按重要度降序，最多 10 条
    const memories = await prisma.memory.findMany({
      where: {
        novelId: this.novelId,
        importance: { gte: 6 },
      },
      orderBy: { importance: "desc" },
      take: 10,
      select: { id: true, type: true, title: true, content: true },
    });

    // 更新访问追踪（异步，不阻塞主流程）
    if (memories.length > 0) {
      prisma.memory.updateMany({
        where: { id: { in: memories.map(m => m.id) } },
        data: {
          lastAccessedAt: new Date(),
          accessCount: { increment: 1 },
          lastAccessedChapter: chapterOrder,
        },
      }).catch(() => {});
    }

    return memories.map(({ id, ...rest }) => rest);
  }

  /**
   * 加载活跃钩子（未解决的悬念/反转等）
   */
  private async loadActiveHooks(): Promise<Array<{ title: string; description: string | null; type: string; intensity: number }>> {
    const hooks = await prisma.hook.findMany({
      where: { novelId: this.novelId, status: { in: ["planted", "active"] } },
      orderBy: { intensity: "desc" },
      take: 8,
      select: { title: true, description: true, type: true, intensity: true },
    });
    return hooks;
  }

  /**
   * 加载已埋设未回收的伏笔
   */
  private async loadPlantedForeshadows(): Promise<Array<{ title: string; description: string; plantChapter: number | null }>> {
    const foreshadows = await prisma.foreshadow.findMany({
      where: { novelId: this.novelId, status: "planted" },
      orderBy: { plantChapter: "asc" },
      take: 8,
      select: { title: true, description: true, plantChapter: true },
    });
    return foreshadows;
  }

  /**
   * 加载当前剧情状态
   */
  private async loadStoryState(): Promise<{
    currentPhase: string;
    protagonistStatus: string;
    protagonistGoal: string;
    currentEmotion: string;
    activeForeshadows: string[];
  } | null> {
    const state = await prisma.storyState.findUnique({
      where: { novelId: this.novelId },
      select: {
        currentPhase: true,
        protagonistStatus: true,
        protagonistGoal: true,
        currentEmotion: true,
        activeForeshadows: true,
      },
    });
    if (!state) return null;

    let foreshadows: string[] = [];
    try { foreshadows = JSON.parse(state.activeForeshadows || "[]"); } catch { /* ignore */ }

    return {
      currentPhase: state.currentPhase || "",
      protagonistStatus: state.protagonistStatus || "",
      protagonistGoal: state.protagonistGoal || "",
      currentEmotion: state.currentEmotion || "",
      activeForeshadows: foreshadows,
    };
  }
}

/**
 * 组装精简创作上下文（~1,200-1,500 tokens）
 * 核心原则：章纲是创作蓝图，完整保留；其余上下文只传精简摘要
 */
export function buildCompactContext(input: {
  novelMeta: { title: string; genre?: string };
  outline: any;
  enrichedChapter: any;
  style: any;
  previousChapters: Array<{ order: number; title: string; summary: string; ending: string }>;
  milestoneSummaries?: Array<{ order: number; title: string; summary: string }>;
  characters?: Array<{ name: string; role?: string | null; identity?: string | null; motivation?: string | null; arcSummary?: string | null }>;
  worldview?: { name: string; summary: string; rules: string; powerSystem: string } | null;
  ragContext?: string;
  memories?: Array<{ type: string; title: string; content: string }>;
  storyState?: { currentPhase: string; protagonistStatus: string; protagonistGoal: string; currentEmotion: string; activeForeshadows: string[] } | null;
  activeHooks?: Array<{ title: string; description: string | null; type: string; intensity: number }>;
  plantedForeshadows?: Array<{ title: string; description: string; plantChapter: number | null }>;
}): string {
  const parts: string[] = [];

  // 1. 作品信息（~50 tokens）
  parts.push(`【作品】${input.novelMeta.title}${input.novelMeta.genre ? `（${input.novelMeta.genre}）` : ""}`);

  // 2. 本章出场角色（~200 tokens，只传精简卡片）
  if (input.characters && input.characters.length > 0) {
    const charLines = input.characters.map(c => {
      const parts = [c.name];
      if (c.role) parts.push(`角色：${c.role}`);
      if (c.identity) parts.push(`身份：${c.identity}`);
      if (c.motivation) parts.push(`动机：${c.motivation}`);
      if (c.arcSummary) parts.push(`特点：${c.arcSummary}`);
      return parts.join("，");
    });
    parts.push(`【本章角色】\n${charLines.join("\n")}`);
  }

  // 3. 世界观锚点（~100 tokens）
  if (input.worldview) {
    const wvLines: string[] = [];
    if (input.worldview.name) wvLines.push(`世界：${input.worldview.name}`);
    if (input.worldview.summary) wvLines.push(`概述：${input.worldview.summary}`);
    if (input.worldview.rules) wvLines.push(`规则：${input.worldview.rules}`);
    if (input.worldview.powerSystem) wvLines.push(`力量体系：${input.worldview.powerSystem}`);
    parts.push(`【世界设定】\n${wvLines.join("\n")}`);
  }

  // 4. 本章详细规划（章纲是核心蓝图，完整保留，~500 tokens）
  if (input.enrichedChapter) {
    const enrichedBlock = buildEnrichedChapterBlockLocal(input.enrichedChapter);
    if (enrichedBlock) parts.push(enrichedBlock);
  }

  // 5. 风格约束精简版（~150 tokens）
  if (input.style) {
    const styleLines: string[] = [];
    if (input.style.name) styleLines.push(`风格：${input.style.name} — ${input.style.description || ""}`);
    if (input.style.toneAndAtmosphere) styleLines.push(`基调：${input.style.toneAndAtmosphere}`);
    if (input.style.pacing) styleLines.push(`节奏：${input.style.pacing}`);
    if (input.style.chapterOpeningStyle) styleLines.push(`开篇：${input.style.chapterOpeningStyle}`);
    if (input.style.chapterEndingStyle) styleLines.push(`收尾：${input.style.chapterEndingStyle}`);
    if (input.style.dialogueStyle) styleLines.push(`对话：${input.style.dialogueStyle}`);
    if (Array.isArray(input.style.writingRules) && input.style.writingRules.length) {
      styleLines.push(`规则：${input.style.writingRules.join("；")}`);
    }
    if (Array.isArray(input.style.avoidList) && input.style.avoidList.length) {
      styleLines.push(`避免：${input.style.avoidList.join("；")}`);
    }
    if (styleLines.length > 0) parts.push(`【风格约束】\n${styleLines.join("\n")}`);
  }

  // 6. 前文回顾（~300 tokens）
  if (input.previousChapters.length > 0) {
    const review = input.previousChapters.map(ch =>
      `第${ch.order}章 ${ch.title}：${ch.summary}${ch.ending ? `\n章末：${ch.ending}` : ""}`
    ).join("\n\n");
    parts.push(`【前文回顾】\n${review}`);
  } else {
    parts.push("【前文回顾】这是开篇第一章，需要快速建立人物、冲突和世界观。");
  }

  // 6b. 里程碑摘要（每 50 章一个，帮助理解长程剧情走向）
  if (input.milestoneSummaries && input.milestoneSummaries.length > 0) {
    const milestoneLines = input.milestoneSummaries.map(ms =>
      `第${ms.order}章 ${ms.title}：${ms.summary.slice(0, 100)}`
    );
    parts.push(`【剧情里程碑】\n${milestoneLines.join("\n")}`);
  }

  // 7. RAG 检索的历史相关上下文（~200 tokens）
  if (input.ragContext?.trim()) {
    parts.push(`【历史参考】\n${input.ragContext.slice(0, 800)}`);
  }

  // 8. 关键记忆（~150 tokens）
  if (input.memories && input.memories.length > 0) {
    const memLines = input.memories.map(m =>
      `[${m.type}] ${m.title}：${m.content.slice(0, 80)}`
    );
    parts.push(`【重要记忆】\n${memLines.join("\n")}`);
  }

  // 9. 当前剧情状态（~100 tokens）
  if (input.storyState) {
    const stateLines: string[] = [];
    if (input.storyState.protagonistStatus) stateLines.push(`主角处境：${input.storyState.protagonistStatus}`);
    if (input.storyState.protagonistGoal) stateLines.push(`当前目标：${input.storyState.protagonistGoal}`);
    if (input.storyState.currentPhase) stateLines.push(`剧情阶段：${input.storyState.currentPhase}`);
    if (input.storyState.activeForeshadows.length > 0) {
      stateLines.push(`活跃伏笔：${input.storyState.activeForeshadows.slice(0, 5).join("、")}`);
    }
    if (stateLines.length > 0) parts.push(`【剧情状态】\n${stateLines.join("\n")}`);
  }

  // 10. 活跃钩子（~100 tokens）
  if (input.activeHooks && input.activeHooks.length > 0) {
    const hookLines = input.activeHooks.map(h =>
      `「${h.title}」（${h.type}，强度${h.intensity}）：${(h.description || "").slice(0, 60)}`
    );
    parts.push(`【未解决钩子】\n${hookLines.join("\n")}`);
  }

  // 11. 已埋设伏笔（~100 tokens）
  if (input.plantedForeshadows && input.plantedForeshadows.length > 0) {
    const fsLines = input.plantedForeshadows.map(f =>
      `「${f.title}"（第${f.plantChapter || "?"}章埋设）：${(f.description || "").slice(0, 60)}`
    );
    parts.push(`【未回收伏笔】\n${fsLines.join("\n")}`);
  }

  return parts.join("\n\n");
}

/**
 * 本地版 buildEnrichedChapterBlock（与 writingPhase.ts 中的逻辑一致）
 */
function buildEnrichedChapterBlockLocal(enriched: any): string {
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
