import { prisma } from "../../db/prisma";
import { getRagRetrieveService } from "../RagRetrieveService";
import { buildFullSystemPrompt } from "./prompts";
import { safeParseRules } from "./promptFormatters";
import { loadMaterialContextForNovel } from "./materialContext";

/**
 * 按需组装章级创作上下文
 *
 * 核心原则：章纲是创作蓝图（完整传递），其余上下文只传精简摘要。
 * 每章上下文约 1,200-1,500 tokens，相比全量 JSON（~15,000 tokens）节省 90%。
 *
 * 7 层 Prompt 架构升级：
 * - 第一层：基础写作引擎（固定）
 * - 第二层：作品风格模板（动态）
 * - 第三层：本书核心约束（动态）
 * - 第四层：角色约束（动态）
 * - 第五层：世界观约束（动态）
 * - 第六层：章节任务（动态）
 * - 第七层：读者期待约束（动态）
 */
export class ContextAssembler {
  constructor(private novelId: string) {}

  /**
   * 组装某章的精简创作上下文（使用 7 层 Prompt 架构）
   */
  async assembleForChapter(chapterOrder: number, chapterOutline: any): Promise<string> {
    // 加载各层数据
    const [characters, worldview, style, novel, previousChapterEnding, materialContext] = await Promise.all([
      this.loadInvolvedCharacters(chapterOutline),
      this.loadWorldviewSummary(chapterOutline?.chapterType),
      this.loadStyleCompact(),
      this.loadNovelMeta(),
      this.loadPreviousChapterEnding(chapterOrder),
      loadMaterialContextForNovel(this.novelId).catch(() => ""),
    ]);

    // 使用 7 层 Prompt 架构组装
    const prompt = buildFullSystemPrompt({
      novel,
      style,
      characters,
      worldview,
      chapterOutline,
      previousChapterEnding,
    });
    return materialContext ? `${materialContext}\n\n${prompt}` : prompt;
  }

  /**
   * 只加载本章出场的角色精简卡片
   */
  private async loadInvolvedCharacters(outline: any) {
    const names: string[] = (outline?.characters || []).map((c: any) => c.name).filter(Boolean);
    if (names.length === 0) return [];

    return prisma.character.findMany({
      where: { novelId: this.novelId, name: { in: names } },
      select: {
        name: true, role: true, identity: true, motivation: true,
        arcSummary: true, speechStyle: true,
        personality: true, appearance: true, background: true,
        notes: true, powerLevel: true, behaviorRules: true,
        forbiddenBehavior: true, signatureLines: true,
        comedyMechanisms: true, emotionalHooks: true,
      },
    });
  }

  /**
   * 加载世界观精简信息，按章节类型选择相关规则
   */
  private async loadWorldviewSummary(chapterType?: string) {
    const wv = await prisma.worldview.findFirst({
      where: { novelId: this.novelId },
      select: { name: true, summary: true, rules: true, powerSystem: true, geography: true, factions: true },
    });
    if (!wv) return null;

    let powerSystemName = "";
    try {
      powerSystemName = JSON.parse(wv.powerSystem || "{}")?.name || "";
    } catch { /* ignore */ }

    // 按章节类型选择相关世界观规则
    const relevantRules = getRelevantWorldRules(chapterType, wv);

    return {
      name: wv.name,
      summary: wv.summary?.slice(0, 300) || "",
      rules: relevantRules,
      powerSystem: powerSystemName,
    };
  }

  /**
   * 加载完整风格配置（包括所有维度）
   */
  private async loadStyleCompact() {
    const sp = await prisma.styleProfile.findFirst({
      where: { novelId: this.novelId, isDefault: true },
      select: {
        name: true, description: true, pacing: true, customRules: true, styleDna: true,
        narrativePov: true, tense: true, sentenceLength: true, vocabulary: true,
        dialogueRatio: true, emotionIntensity: true, humorLevel: true,
        avoidAIWords: true, useShortSentences: true, useDialogue: true, useSensoryDetail: true,
      },
    });
    if (!sp) return null;

    let rules: any = {};
    try { rules = JSON.parse(sp.customRules || "{}"); } catch { /* ignore */ }

    return {
      name: sp.name,
      description: sp.description,
      toneAndAtmosphere: typeof rules.toneAndAtmosphere === 'object' ? JSON.stringify(rules.toneAndAtmosphere).slice(0, 500) : (rules.toneAndAtmosphere?.slice(0, 500) || ""),
      pacing: sp.pacing,
      chapterOpeningStyle: typeof rules.chapterOpeningStyle === 'object' ? JSON.stringify(rules.chapterOpeningStyle).slice(0, 200) : (rules.chapterOpeningStyle?.slice(0, 200) || ""),
      chapterEndingStyle: typeof rules.chapterEndingStyle === 'object' ? JSON.stringify(rules.chapterEndingStyle).slice(0, 200) : (rules.chapterEndingStyle?.slice(0, 200) || ""),
      dialogueStyle: typeof rules.dialogueStyle === 'object' ? JSON.stringify(rules.dialogueStyle).slice(0, 200) : (rules.dialogueStyle?.slice(0, 200) || ""),
      humorStyle: typeof rules.humorStyle === 'object' ? JSON.stringify(rules.humorStyle).slice(0, 300) : (rules.humorStyle?.slice(0, 300) || ""),
      contrastPatterns: Array.isArray(rules.contrastPatterns) ? rules.contrastPatterns.slice(0, 4) : [],
      writingRules: Array.isArray(rules.writingRules) ? rules.writingRules.slice(0, 5) : [],
      avoidList: Array.isArray(rules.avoidList) ? rules.avoidList.slice(0, 5) : [],
      // 完整风格维度
      narrativePov: sp.narrativePov,
      tense: sp.tense,
      sentenceLength: sp.sentenceLength,
      vocabulary: sp.vocabulary,
      dialogueRatio: sp.dialogueRatio,
      emotionIntensity: sp.emotionIntensity,
      humorLevel: sp.humorLevel,
      masterWriterStyle: rules.masterWriterStyle || "",
      // 用户原文风格示例（来自风格分析阶段）
      userStyleExamples: Array.isArray(rules.userStyleExamples) ? rules.userStyleExamples.slice(0, 3) : [],
      // 风格 DNA（可执行约束）
      styleDna: sp.styleDna || undefined,
    };
  }

  /**
   * 加载前 N 章概要 + 每 50 章的里程碑摘要
   * 返回 { recent, milestones } 结构
   */
  private async loadRecentSummaries(currentOrder: number, count: number) {
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
   * 加载上一章结尾内容（用于防止跳章）
   * v3.0: 如果前一章是用户原文，增加承接说明
   */
  private async loadPreviousChapterEnding(chapterOrder: number): Promise<string> {
    if (chapterOrder <= 1) return "";

    const prevChapter = await prisma.chapter.findFirst({
      where: {
        novelId: this.novelId,
        order: chapterOrder - 1,
        content: { not: "" },
      },
      select: { content: true, sourceType: true, isCanonical: true, title: true },
      orderBy: { order: "desc" },
    });

    if (!prevChapter) return "";

    const ending = prevChapter.content.slice(-500);

    // v3.0: 如果前一章是用户原文，添加承接说明
    if (prevChapter.sourceType === "user_original" || prevChapter.isCanonical) {
      return `【用户原文章节 — 第${chapterOrder - 1}章 ${prevChapter.title || ""} 结尾】\n${ending}\n\n【承接要求】本章开头必须承接上文，不得重新介绍设定或跳过关键事件。前序章节为用户原文，不可改写。`;
    }

    return ending;
  }

  /**
   * 加载作品元信息
   */
  private async loadNovelMeta() {
    const novel = await prisma.novel.findUnique({
      where: { id: this.novelId },
      select: {
        title: true,
        genre: true,
        synopsis: true,
        // 7 层 Prompt 架构新增字段
        coreSellingPoint: true,
        corePayoffs: true,
        coreConflict: true,
        readerExpectations: true,
      },
    });
    return {
      title: novel?.title || "",
      genre: novel?.genre || "",
      theme: novel?.synopsis?.slice(0, 100) || "",
      // 7 层 Prompt 架构新增字段
      coreSellingPoint: novel?.coreSellingPoint || "",
      corePayoffs: novel?.corePayoffs || "",
      coreConflict: novel?.coreConflict || "",
      readerExpectations: novel?.readerExpectations || "",
    };
  }

  /**
   * 通过 RAG 检索与本章相关的历史上下文（设定、角色、情节等）
   * 返回带相关度标注的上下文文本
   */
  private async loadRagContext(chapterOutline: any): Promise<string> {
    const ragService = getRagRetrieveService();
    if (!ragService) return "";

    const queryParts: string[] = [];
    if (chapterOutline?.title) queryParts.push(chapterOutline.title);
    if (chapterOutline?.goal) queryParts.push(chapterOutline.goal);
    if (chapterOutline?.conflict) queryParts.push(chapterOutline.conflict);
    const charNames = (chapterOutline?.characters || []).map((c: any) => c.name).filter(Boolean);
    if (charNames.length > 0) queryParts.push(charNames.join(" "));

    const query = queryParts.join(" ").slice(0, 200);
    if (!query.trim()) return "";

    try {
      const scored = await ragService.retrieveScored(query, { novelId: this.novelId, topK: 5 });
      if (scored.length === 0) return "";

      return scored.map((c, i) => {
        const relevance = c.score >= 80 ? "高相关" : c.score >= 50 ? "中相关" : "低相关";
        return `[${i + 1}] (${c.ownerType}, ${relevance}) ${c.text}`;
      }).join("\n\n");
    } catch {
      return "";
    }
  }

  /**
   * 加载高重要度记忆（角色关系、关键剧情、世界观规则等）
   */
  private async loadRelevantMemories(chapterOrder: number): Promise<Array<{ type: string; title: string; content: string }>> {
    const memories = await prisma.memory.findMany({
      where: {
        novelId: this.novelId,
        importance: { gte: 6 },
      },
      orderBy: { importance: "desc" },
      take: 10,
      select: { id: true, type: true, title: true, content: true },
    });

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
   * 加载当前剧情状态（包含禁止/允许列表和爽点冷却）
   */
  private async loadStoryState(chapterOrder: number): Promise<{
    currentPhase: string;
    protagonistStatus: string;
    protagonistGoal: string;
    currentEmotion: string;
    activeForeshadows: string[];
    forbiddenActions: string[];
    allowedActions: string[];
    pleasureCooldown: number;
    mainConflict: string;
  } | null> {
    const state = await prisma.storyState.findUnique({
      where: { novelId: this.novelId },
      select: {
        currentPhase: true,
        protagonistStatus: true,
        protagonistGoal: true,
        currentEmotion: true,
        activeForeshadows: true,
        forbiddenActions: true,
        allowedActions: true,
        pleasureCooldown: true,
        lastPleasureChapter: true,
        mainConflict: true,
      },
    });
    if (!state) return null;

    let foreshadows: string[] = [];
    try { foreshadows = JSON.parse(state.activeForeshadows || "[]"); } catch { /* ignore */ }
    let forbidden: string[] = [];
    try { forbidden = JSON.parse(state.forbiddenActions || "[]"); } catch { /* ignore */ }
    let allowed: string[] = [];
    try { allowed = JSON.parse(state.allowedActions || "[]"); } catch { /* ignore */ }

    // 计算实际冷却值：如果距离上次爽点不足冷却值，保持冷却
    const chaptersSincePleasure = chapterOrder - state.lastPleasureChapter;
    const effectiveCooldown = Math.max(0, state.pleasureCooldown - chaptersSincePleasure);

    return {
      currentPhase: state.currentPhase || "",
      protagonistStatus: state.protagonistStatus || "",
      protagonistGoal: state.protagonistGoal || "",
      currentEmotion: state.currentEmotion || "",
      activeForeshadows: foreshadows,
      forbiddenActions: forbidden,
      allowedActions: allowed,
      pleasureCooldown: effectiveCooldown,
      mainConflict: state.mainConflict || "",
    };
  }

  /**
   * 加载当前章节范围内的活跃主线剧情
   */
  private async loadMainlines(chapterOrder: number): Promise<Array<{ title: string; type: string; description: string | null; priority: number }>> {
    const mainlines = await prisma.mainline.findMany({
      where: {
        novelId: this.novelId,
        status: "active",
        OR: [
          { startChapter: null, endChapter: null },
          { startChapter: { lte: chapterOrder }, endChapter: null },
          { startChapter: null, endChapter: { gte: chapterOrder } },
          { startChapter: { lte: chapterOrder }, endChapter: { gte: chapterOrder } },
        ],
      },
      orderBy: { priority: "desc" },
      take: 5,
      select: { title: true, type: true, description: true, priority: true },
    });
    return mainlines;
  }

  /**
   * 加载本章出场角色之间的关系
   */
  private async loadCharacterRelations(outline: any): Promise<Array<{ charA: string; charB: string; relType: string; description: string | null }>> {
    const names: string[] = (outline?.characters || []).map((c: any) => c.name).filter(Boolean);
    if (names.length < 2) return [];

    const relations = await prisma.characterRelation.findMany({
      where: {
        novelId: this.novelId,
        status: "active",
        charA: { name: { in: names } },
        charB: { name: { in: names } },
      },
      include: { charA: { select: { name: true } }, charB: { select: { name: true } } },
      take: 10,
    });
    return relations.map(r => ({ charA: r.charA.name, charB: r.charB.name, relType: r.relType, description: r.description }));
  }

  /**
   * 加载当前章节的情绪曲线数据
   */
  private async loadEmotionCurve(chapterOrder: number): Promise<{
    emotionType: string;
    intensity: number;
    isClimax: boolean;
    isTurningPoint: boolean;
    isBreathing: boolean;
    description: string;
  } | null> {
    const curve = await prisma.emotionCurve.findFirst({
      where: { novelId: this.novelId, chapterOrder },
      select: {
        emotionType: true, intensity: true,
        isClimax: true, isTurningPoint: true, isBreathing: true,
        description: true,
      },
    });
    return curve;
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
  characters?: Array<{ name: string; role?: string | null; identity?: string | null; motivation?: string | null; arcSummary?: string | null; speechStyle?: string | null }>;
  worldview?: { name: string; summary: string; rules: string; powerSystem: string } | null;
  ragContext?: string;
  memories?: Array<{ type: string; title: string; content: string }>;
  storyState?: {
    currentPhase: string; protagonistStatus: string; protagonistGoal: string; currentEmotion: string;
    activeForeshadows: string[]; forbiddenActions: string[]; allowedActions: string[];
    pleasureCooldown: number; mainConflict: string;
  } | null;
  activeHooks?: Array<{ title: string; description: string | null; type: string; intensity: number }>;
  plantedForeshadows?: Array<{ title: string; description: string; plantChapter: number | null }>;
  mainlines?: Array<{ title: string; type: string; description: string | null; priority: number }>;
  characterRelations?: Array<{ charA: string; charB: string; relType: string; description: string | null }>;
  emotionCurve?: { emotionType: string; intensity: number; isClimax: boolean; isTurningPoint: boolean; isBreathing: boolean; description: string } | null;
}): string {
  const parts: string[] = [];

  // 1. 作品信息 + 主题约束（~80 tokens）
  let genreLine = `【作品】${input.novelMeta.title}`;
  if (input.novelMeta.genre) {
    genreLine += `（${input.novelMeta.genre}）`;
    genreLine += `\n【主题硬约束】本作品类型为「${input.novelMeta.genre}」，所有内容必须严格围绕此类型展开。禁止出现与该类型不符的元素（如都市文中禁止出现修仙、异能、穿越等玄幻元素）。`;
  }
  parts.push(genreLine);

  // 2. 主线剧情（~150 tokens）
  if (input.mainlines && input.mainlines.length > 0) {
    const mlLines = input.mainlines.map(ml =>
      `「${ml.title}」（${ml.type}，优先级${ml.priority}）：${(ml.description || "").slice(0, 80)}`
    );
    parts.push(`【主线剧情 — 必须围绕以下主线展开】\n${mlLines.join("\n")}`);
  }

  // 3. 本章出场角色（~200 tokens）
  if (input.characters && input.characters.length > 0) {
    const charLines = input.characters.map(c => {
      const p = [c.name];
      if (c.role) p.push(`角色：${c.role}`);
      if (c.identity) p.push(`身份：${c.identity}`);
      if (c.motivation) p.push(`动机：${c.motivation}`);
      if (c.arcSummary) p.push(`特点：${c.arcSummary}`);
      if (c.speechStyle) p.push(`语言风格：${c.speechStyle}`);
      return p.join("，");
    });
    parts.push(`【本章角色】\n${charLines.join("\n")}`);
  }

  // 4. 角色关系（~100 tokens）
  if (input.characterRelations && input.characterRelations.length > 0) {
    const relLines = input.characterRelations.map(r =>
      `${r.charA} ↔ ${r.charB}：${r.relType}${r.description ? `（${r.description.slice(0, 40)}）` : ""}`
    );
    parts.push(`【角色关系】\n${relLines.join("\n")}`);
  }

  // 5. 世界观锚点（~100 tokens）
  if (input.worldview) {
    const wvLines: string[] = [];
    if (input.worldview.name) wvLines.push(`世界：${input.worldview.name}`);
    if (input.worldview.summary) wvLines.push(`概述：${input.worldview.summary}`);
    if (input.worldview.rules) wvLines.push(`规则：${input.worldview.rules}`);
    if (input.worldview.powerSystem) wvLines.push(`力量体系：${input.worldview.powerSystem}`);
    parts.push(`【世界设定】\n${wvLines.join("\n")}`);
  }

  // 6. 本章详细规划（章纲是核心蓝图，完整保留，~500 tokens）
  if (input.enrichedChapter) {
    const enrichedBlock = buildEnrichedChapterBlockLocal(input.enrichedChapter);
    if (enrichedBlock) parts.push(enrichedBlock);
  }

  // 7. 风格约束完整版（~200 tokens）
  if (input.style) {
    const styleLines: string[] = [];
    if (input.style.name) styleLines.push(`风格：${input.style.name} — ${input.style.description || ""}`);
    if (input.style.masterWriterStyle) styleLines.push(`【作家风格模仿】${input.style.masterWriterStyle}`);
    if (input.style.toneAndAtmosphere) styleLines.push(`基调：${input.style.toneAndAtmosphere}`);
    if (input.style.pacing) styleLines.push(`节奏：${input.style.pacing}`);
    if (input.style.narrativePov) {
      const povMap: Record<string, string> = { first_person: "第一人称", third_person: "第三人称有限视角", mixed: "灵活切换视角" };
      styleLines.push(`叙事视角：${povMap[input.style.narrativePov] || input.style.narrativePov}`);
    }
    if (input.style.tense) {
      const tenseMap: Record<string, string> = { past: "过去时态", present: "现在时态" };
      styleLines.push(`时态：${tenseMap[input.style.tense] || input.style.tense}`);
    }
    if (input.style.sentenceLength) {
      const lenMap: Record<string, string> = { short: "多用短句", long: "可用长句", mixed: "长短句结合" };
      styleLines.push(`句式：${lenMap[input.style.sentenceLength] || input.style.sentenceLength}`);
    }
    if (input.style.dialogueRatio) {
      const ratioMap: Record<string, string> = { low: "少对话多叙述", balanced: "对话叙述平衡", high: "多对话推进" };
      styleLines.push(`对话比例：${ratioMap[input.style.dialogueRatio] || input.style.dialogueRatio}`);
    }
    if (input.style.emotionIntensity) {
      const eiMap: Record<string, string> = { low: "情感克制内敛", medium: "情感适度", high: "情感强烈饱满" };
      styleLines.push(`情感强度：${eiMap[input.style.emotionIntensity] || input.style.emotionIntensity}`);
    }
    if (input.style.humorLevel && input.style.humorLevel !== "none") {
      const hlMap: Record<string, string> = { low: "偶尔轻松", medium: "适当幽默", high: "多用幽默调侃" };
      styleLines.push(`幽默程度：${hlMap[input.style.humorLevel] || input.style.humorLevel}`);
    }
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
    // 用户原文风格示例（来自风格分析阶段）
    if (Array.isArray(input.style.userStyleExamples) && input.style.userStyleExamples.length > 0) {
      const examples = input.style.userStyleExamples.map((ex: string, i: number) => `示例${i + 1}：${ex}`).join("\n\n");
      parts.push(`【用户原文风格参考 — 你的写作必须匹配这个风格】\n${examples}`);
    }
  }

  // 8. 情绪曲线指导（~80 tokens）
  if (input.emotionCurve) {
    const ec = input.emotionCurve;
    const tags: string[] = [];
    if (ec.isClimax) tags.push("高潮章");
    if (ec.isTurningPoint) tags.push("转折章");
    if (ec.isBreathing) tags.push("呼吸章");
    let ecLine = `目标情绪：${ec.emotionType}（强度：${ec.intensity}）`;
    if (tags.length) ecLine += ` [${tags.join(",")}]`;
    if (ec.description) ecLine += `\n情绪描述：${ec.description.slice(0, 60)}`;
    parts.push(`【情绪曲线指导】\n${ecLine}`);
  }

  // 9. 前文回顾（~300 tokens）
  if (input.previousChapters.length > 0) {
    const review = input.previousChapters.map(ch =>
      `第${ch.order}章 ${ch.title}：${ch.summary}${ch.ending ? `\n章末：${ch.ending}` : ""}`
    ).join("\n\n");
    parts.push(`【前文回顾】\n${review}`);
  } else {
    parts.push("【前文回顾】这是开篇第一章，需要快速建立人物、冲突和世界观。");
  }

  // 10. 里程碑摘要
  if (input.milestoneSummaries && input.milestoneSummaries.length > 0) {
    const milestoneLines = input.milestoneSummaries.map(ms =>
      `第${ms.order}章 ${ms.title}：${ms.summary.slice(0, 100)}`
    );
    parts.push(`【剧情里程碑】\n${milestoneLines.join("\n")}`);
  }

  // 11. RAG 检索的历史相关上下文
  if (input.ragContext?.trim()) {
    parts.push(`【历史参考】\n${input.ragContext.slice(0, 800)}`);
  }

  // 12. 关键记忆
  if (input.memories && input.memories.length > 0) {
    const memLines = input.memories.map(m =>
      `[${m.type}] ${m.title}：${m.content.slice(0, 80)}`
    );
    parts.push(`【重要记忆】\n${memLines.join("\n")}`);
  }

  // 13. 当前剧情状态（含禁止/允许列表）
  if (input.storyState) {
    const stateLines: string[] = [];
    if (input.storyState.protagonistStatus) stateLines.push(`主角处境：${input.storyState.protagonistStatus}`);
    if (input.storyState.protagonistGoal) stateLines.push(`当前目标：${input.storyState.protagonistGoal}`);
    if (input.storyState.currentPhase) stateLines.push(`剧情阶段：${input.storyState.currentPhase}`);
    if (input.storyState.mainConflict) stateLines.push(`核心矛盾：${input.storyState.mainConflict}`);
    if (input.storyState.activeForeshadows.length > 0) {
      stateLines.push(`活跃伏笔：${input.storyState.activeForeshadows.slice(0, 5).join("、")}`);
    }
    if (stateLines.length > 0) parts.push(`【剧情状态】\n${stateLines.join("\n")}`);

    // 禁止/允许列表
    if (input.storyState.forbiddenActions.length > 0) {
      parts.push(`【禁止剧情 — 本章绝对不能出现】\n${input.storyState.forbiddenActions.join("、")}`);
    }
    if (input.storyState.allowedActions.length > 0) {
      parts.push(`【允许剧情 — 本章可以展开】\n${input.storyState.allowedActions.join("、")}`);
    }

    // 爽点冷却约束
    if (input.storyState.pleasureCooldown > 0) {
      parts.push(`【爽点冷却】当前处于爽点冷却期（剩余${input.storyState.pleasureCooldown}章），本章禁止出现爽点（金手指、复仇、震撼、逆袭等高能情节）。应以铺垫、过渡、人物互动为主。`);
    }
  }

  // 14. 活跃钩子
  if (input.activeHooks && input.activeHooks.length > 0) {
    const hookLines = input.activeHooks.map(h =>
      `「${h.title}」（${h.type}，强度${h.intensity}）：${(h.description || "").slice(0, 60)}`
    );
    parts.push(`【未解决钩子】\n${hookLines.join("\n")}`);
  }

  // 15. 已埋设伏笔
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

/**
 * 按章节类型选择相关世界观规则
 * 不同类型的章节需要不同的世界观侧面
 */
function getRelevantWorldRules(
  chapterType: string | undefined,
  worldview: { rules?: string | null; powerSystem?: string | null; geography?: string | null; factions?: string | null },
): string {
  const ruleLines = safeParseRules(worldview.rules);
  if (!chapterType || ruleLines.length === 0) return (worldview.rules || "").slice(0, 300);

  const typeKeywords: Record<string, string[]> = {
    payoff: ["力量", "等级", "能力", "突破", "升级", "奖励", "战力", "境界", "功法", "技能"],
    danger_escalation: ["危险", "敌人", "势力", "威胁", "禁地", "规则", "惩罚", "死亡", "战斗", "追杀"],
    comedy_daily: ["日常", "生活", "社会", "风俗", "习惯", "搞笑", "轻松", "宗门", "门派", "家族"],
    info_reveal: ["秘密", "历史", "真相", "背景", "传说", "预言", "伏笔", "身世", "来历"],
    mission: ["任务", "目标", "条件", "限制", "考验", "试炼", "奖励", "惩罚"],
    emotional: ["情感", "关系", "羁绊", "师徒", "兄弟", "爱情", "友情", "仇恨"],
  };

  const keywords = typeKeywords[chapterType] || [];
  if (keywords.length === 0) return ruleLines.join("；").slice(0, 300);

  // 优先保留包含相关关键词的规则
  const relevant = ruleLines.filter(rule =>
    keywords.some(kw => rule.includes(kw))
  );

  // 有匹配结果时用匹配的，否则 fallback 到全量截断
  if (relevant.length > 0) {
    return relevant.join("；").slice(0, 400);
  }
  return ruleLines.join("；").slice(0, 300);
}
