import { prisma } from "../../db/prisma";

/**
 * 因果链管理服务
 *
 * 负责：
 * 1. 从后处理结果中提取因果关系并写入 DB
 * 2. 构建因果链上下文文本（供续写注入）
 * 3. 检查因果链完整性（孤立事件、未解决伏笔）
 */

// ──────────────────────────── 类型 ────────────────────────────

interface CausalLinkInput {
  causeType: string;
  causeRefId?: string;
  causeDescription: string;
  effectType: string;
  effectRefId?: string;
  effectDescription: string;
  strength?: number;
  isMainConflict?: boolean;
}

interface PostProcessingResult {
  chapterSummary?: {
    keyEvents?: string[];
    summary?: string;
    endingState?: string;
  };
  resolvedHooks?: string[];
  paidOffForeshadows?: string[];
  characterUpdates?: Array<{
    name: string;
    arcSummary?: string;
    growthCheckpoint?: string;
  }>;
  storyState?: {
    mainConflict?: string;
    currentPhase?: string;
    activeForeshadows?: string[];
    pendingPayoffs?: string[];
  };
}

interface IntegrityIssue {
  type: "orphan_event" | "unresolved_effect" | "dangling_cause";
  severity: "low" | "medium" | "high";
  description: string;
  chapterOrder: number;
}

// ──────────────────────────── 核心函数 ────────────────────────────

/**
 * 从后处理结果提取因果关系并写入 DB
 *
 * 提取策略：
 * 1. keyEvents 中相邻事件自动配对为 cause → effect
 * 2. 钩子/伏笔回收视为 effect，对应埋设视为 cause
 * 3. 角色成长检查点视为 effect，触发事件视为 cause
 */
export async function captureCausalLinks(
  novelId: string,
  chapterOrder: number,
  result: PostProcessingResult,
): Promise<void> {
  const links: CausalLinkInput[] = [];

  // 1. 从 keyEvents 提取相邻事件因果链
  const keyEvents = result.chapterSummary?.keyEvents || [];
  if (keyEvents.length >= 2) {
    for (let i = 0; i < keyEvents.length - 1; i++) {
      links.push({
        causeType: "event",
        causeDescription: keyEvents[i],
        effectType: "event",
        effectDescription: keyEvents[i + 1],
        strength: 6,
      });
    }
  }

  // 2. 钩子回收 → 因果关系
  if (Array.isArray(result.resolvedHooks)) {
    for (const hookTitle of result.resolvedHooks) {
      if (!hookTitle) continue;
      // 查找钩子记录获取 ID
      const hook = await prisma.hook.findFirst({
        where: { novelId, title: hookTitle },
        select: { id: true, description: true, plannedChapter: true },
      }).catch(() => null);

      links.push({
        causeType: "hook",
        causeRefId: hook?.id,
        causeDescription: `钩子「${hookTitle}」的铺垫（${hook?.description?.slice(0, 50) || "无描述"}）`,
        effectType: "hook_resolved",
        effectRefId: hook?.id,
        effectDescription: `钩子「${hookTitle}」在第${chapterOrder}章被回收`,
        strength: 7,
      });
    }
  }

  // 3. 伏笔回收 → 因果关系
  if (Array.isArray(result.paidOffForeshadows)) {
    for (const fsTitle of result.paidOffForeshadows) {
      if (!fsTitle) continue;
      const fs = await prisma.foreshadow.findFirst({
        where: { novelId, title: fsTitle },
        select: { id: true, description: true, plantChapter: true },
      }).catch(() => null);

      links.push({
        causeType: "foreshadow",
        causeRefId: fs?.id,
        causeDescription: `伏笔「${fsTitle}」的埋设（第${fs?.plantChapter || "?"}章）`,
        effectType: "foreshadow_paid_off",
        effectRefId: fs?.id,
        effectDescription: `伏笔「${fsTitle}」在第${chapterOrder}章被回收`,
        strength: 8,
        isMainConflict: true,
      });
    }
  }

  // 4. 角色成长 → 因果关系
  if (Array.isArray(result.characterUpdates)) {
    for (const cu of result.characterUpdates) {
      if (!cu.growthCheckpoint) continue;
      links.push({
        causeType: "event",
        causeDescription: `第${chapterOrder}章的关键事件`,
        effectType: "character_growth",
        effectDescription: `${cu.name}：${cu.growthCheckpoint}`,
        strength: 5,
      });
    }
  }

  // 5. 核心矛盾推进
  if (result.storyState?.mainConflict) {
    const mainConflict = result.storyState.mainConflict;
    if (keyEvents.length > 0) {
      links.push({
        causeType: "conflict",
        causeDescription: keyEvents[keyEvents.length - 1],
        effectType: "conflict_progress",
        effectDescription: `核心矛盾推进：${mainConflict}`,
        strength: 9,
        isMainConflict: true,
      });
    }
  }

  // 批量写入 DB（不阻塞主流程）
  if (links.length === 0) return;

  try {
    await prisma.causalLink.createMany({
      data: links.map(link => ({
        novelId,
        chapterOrder,
        causeType: link.causeType,
        causeRefId: link.causeRefId || null,
        causeDescription: link.causeDescription,
        effectType: link.effectType,
        effectRefId: link.effectRefId || null,
        effectDescription: link.effectDescription,
        strength: link.strength ?? 5,
        isMainConflict: link.isMainConflict ?? false,
      })),
    });
  } catch (e) {
    console.warn("[causalChain] 因果链写入失败:", e);
  }
}

// ──────────────────────────── 上下文构建 ────────────────────────────

/**
 * 构建因果链上下文文本（注入续写 Prompt）
 *
 * 读取最近 N 章的因果链，生成精简的因果关系摘要。
 * 输出约 200-400 tokens，帮助 AI 理解剧情脉络。
 */
export async function buildCausalChainContext(
  novelId: string,
  chapterOrder: number,
): Promise<string> {
  try {
    // 取最近 5 章的因果链
    const links = await prisma.causalLink.findMany({
      where: {
        novelId,
        chapterOrder: { gte: chapterOrder - 5, lt: chapterOrder },
      },
      orderBy: [
        { chapterOrder: "desc" },
        { strength: "desc" },
      ],
      take: 20,
    });

    if (links.length === 0) return "";

    // 按章节分组
    const grouped = new Map<number, typeof links>();
    for (const link of links) {
      const arr = grouped.get(link.chapterOrder) || [];
      arr.push(link);
      grouped.set(link.chapterOrder, arr);
    }

    const lines: string[] = [];
    for (const [order, chapterLinks] of grouped) {
      const mainLinks = chapterLinks.filter(l => l.isMainConflict);
      const otherLinks = chapterLinks.filter(l => !l.isMainConflict);

      // 优先展示核心矛盾因果链
      const displayLinks = [...mainLinks, ...otherLinks].slice(0, 4);
      const linkDescs = displayLinks.map(l => {
        const strengthTag = l.strength >= 8 ? "[强关联]" : l.strength >= 5 ? "[中关联]" : "[弱关联]";
        return `  ${strengthTag} ${l.causeDescription.slice(0, 40)} → ${l.effectDescription.slice(0, 40)}`;
      });

      lines.push(`第${order}章因果链：\n${linkDescs.join("\n")}`);
    }

    if (lines.length === 0) return "";

    return `【因果链回顾 — 保持剧情逻辑连贯】\n${lines.join("\n\n")}`;
  } catch (e) {
    console.warn("[causalChain] 因果链上下文构建失败:", e);
    return "";
  }
}

// ──────────────────────────── 完整性检查 ────────────────────────────

/**
 * 检查因果链完整性
 *
 * 检测：
 * 1. 孤立事件：有 effect 但无后续 cause 的事件
 * 2. 未解决伏笔：埋设超过 10 章未回收的伏笔
 * 3. 悬挂因果：cause 引用了已回收的钩子/伏笔但 effect 未兑现
 */
export async function checkCausalChainIntegrity(
  novelId: string,
  chapterOrder: number,
): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  try {
    // 1. 检查孤立事件：最近 3 章中，effect 未被后续章引用为 cause 的事件
    const recentLinks = await prisma.causalLink.findMany({
      where: {
        novelId,
        chapterOrder: { gte: chapterOrder - 3, lt: chapterOrder },
      },
      select: { id: true, chapterOrder: true, effectType: true, effectDescription: true },
    });

    const laterLinks = await prisma.causalLink.findMany({
      where: {
        novelId,
        chapterOrder: { gte: chapterOrder - 1 },
      },
      select: { causeDescription: true },
    });

    const laterCauseDescs = new Set(laterLinks.map(l => l.causeDescription.slice(0, 30)));

    for (const link of recentLinks) {
      if (link.effectType === "event") {
        const key = link.effectDescription.slice(0, 30);
        if (!laterCauseDescs.has(key)) {
          // 不报告所有孤立事件，只报告高影响力事件
          const fullLink = await prisma.causalLink.findUnique({
            where: { id: link.id },
            select: { strength: true },
          });
          if (fullLink && fullLink.strength >= 7) {
            issues.push({
              type: "orphan_event",
              severity: "medium",
              description: `第${link.chapterOrder}章的高影响力事件「${link.effectDescription.slice(0, 50)}」未在后续章节中延续`,
              chapterOrder: link.chapterOrder,
            });
          }
        }
      }
    }

    // 2. 检查埋设超过 10 章未回收的伏笔
    const staleForeshadows = await prisma.foreshadow.findMany({
      where: {
        novelId,
        status: "planted",
        plantChapter: { lt: chapterOrder - 10 },
      },
      select: { title: true, plantChapter: true },
    });

    for (const fs of staleForeshadows) {
      issues.push({
        type: "unresolved_effect",
        severity: "high",
        description: `伏笔「${fs.title}」在第${fs.plantChapter || "?"}章埋设，已超过 10 章未回收`,
        chapterOrder: fs.plantChapter || 0,
      });
    }

    // 3. 检查悬挂因果：cause 类型为 foreshadow 但对应伏笔已过期
    const danglingCausalLinks = await prisma.causalLink.findMany({
      where: {
        novelId,
        causeType: "foreshadow",
        effectType: { not: "foreshadow_paid_off" },
        chapterOrder: { lt: chapterOrder - 15 },
      },
      take: 5,
      select: { causeDescription: true, chapterOrder: true, effectDescription: true },
    });

    for (const dl of danglingCausalLinks) {
      issues.push({
        type: "dangling_cause",
        severity: "low",
        description: `因果链悬挂：${dl.causeDescription.slice(0, 40)} → ${dl.effectDescription.slice(0, 40)}（第${dl.chapterOrder}章）`,
        chapterOrder: dl.chapterOrder,
      });
    }
  } catch (e) {
    console.warn("[causalChain] 因果链完整性检查失败:", e);
  }

  return issues;
}
