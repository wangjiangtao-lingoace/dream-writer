/**
 * 周期性一致性检查模块
 * 每 10 章运行一次，检查钩子/伏笔逾期、角色漂移、情绪节奏
 */

import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { PhaseContext } from "./pipelineUtils";

export interface HookAlert {
  hookId: string;
  title: string;
  plannedChapter: number;
  currentChapter: number;
  overdueBy: number;
  severity: "warning" | "critical";
}

export interface ForeshadowAlert {
  foreshadowId: string;
  title: string;
  payoffChapter: number;
  currentChapter: number;
  overdueBy: number;
  severity: "warning" | "critical";
}

export interface CharacterDrift {
  characterName: string;
  driftDescription: string;
  severity: "warning" | "critical";
}

export interface PeriodicCheckResult {
  hookAlerts: HookAlert[];
  foreshadowAlerts: ForeshadowAlert[];
  characterDrifts: CharacterDrift[];
  emotionIssues: string[];
}

/**
 * 运行周期性一致性检查
 * 建议每 10 章调用一次
 */
export async function runPeriodicConsistencyCheck(
  ctx: PhaseContext,
  novelId: string,
  chapterOrder: number,
): Promise<PeriodicCheckResult> {
  const [hookAlerts, foreshadowAlerts, emotionIssues] = await Promise.all([
    checkOverdueHooks(novelId, chapterOrder),
    checkOverdueForeshadows(novelId, chapterOrder),
    checkEmotionRhythm(novelId, chapterOrder),
  ]);

  // 角色漂移检测（LLM，较重，可选）
  const characterDrifts = await detectCharacterDrifts(ctx, novelId, chapterOrder);

  return { hookAlerts, foreshadowAlerts, characterDrifts, emotionIssues };
}

/**
 * 检查逾期未回收的钩子
 */
async function checkOverdueHooks(novelId: string, currentChapter: number): Promise<HookAlert[]> {
  const overdueHooks = await prisma.hook.findMany({
    where: {
      novelId,
      status: { in: ["planted", "active"] },
      resolvedChapter: { not: null, lt: currentChapter },
    },
    select: { id: true, title: true, resolvedChapter: true },
  });

  return overdueHooks.map(h => {
    const planned = h.resolvedChapter || 0;
    const overdueBy = currentChapter - planned;
    return {
      hookId: h.id,
      title: h.title,
      plannedChapter: planned,
      currentChapter,
      overdueBy,
      severity: overdueBy > 10 ? "critical" as const : "warning" as const,
    };
  });
}

/**
 * 检查逾期未回收的伏笔
 */
async function checkOverdueForeshadows(novelId: string, currentChapter: number): Promise<ForeshadowAlert[]> {
  const overdueForeshadows = await prisma.foreshadow.findMany({
    where: {
      novelId,
      status: "planted",
      payoffChapter: { not: null, lt: currentChapter },
    },
    select: { id: true, title: true, payoffChapter: true },
  });

  return overdueForeshadows.map(f => {
    const planned = f.payoffChapter || 0;
    const overdueBy = currentChapter - planned;
    return {
      foreshadowId: f.id,
      title: f.title,
      payoffChapter: planned,
      currentChapter,
      overdueBy,
      severity: overdueBy > 10 ? "critical" as const : "warning" as const,
    };
  });
}

/**
 * 检查情绪节奏（连续高潮/低谷）
 */
async function checkEmotionRhythm(novelId: string, currentChapter: number): Promise<string[]> {
  const issues: string[] = [];

  // 获取最近 10 章的情绪曲线
  const recentEmotions = await prisma.emotionCurve.findMany({
    where: {
      novelId,
      chapterOrder: { gte: currentChapter - 10, lt: currentChapter },
    },
    orderBy: { chapterOrder: "asc" },
    select: { chapterOrder: true, isClimax: true, intensity: true, emotionType: true },
  });

  if (recentEmotions.length < 3) return issues;

  // 检查连续 3+ 高潮
  let consecutiveClimax = 0;
  for (const emo of recentEmotions) {
    if (emo.isClimax) {
      consecutiveClimax++;
      if (consecutiveClimax >= 3) {
        issues.push(`连续${consecutiveClimax}章高潮（第${emo.chapterOrder - consecutiveClimax + 1}-${emo.chapterOrder}章），节奏过于紧张`);
        break;
      }
    } else {
      consecutiveClimax = 0;
    }
  }

  // 检查连续 5+ 低谷（intensity <= 3）
  let consecutiveLow = 0;
  for (const emo of recentEmotions) {
    if (emo.intensity <= 3) {
      consecutiveLow++;
      if (consecutiveLow >= 5) {
        issues.push(`连续${consecutiveLow}章低强度（第${emo.chapterOrder - consecutiveLow + 1}-${emo.chapterOrder}章），节奏过于平淡`);
        break;
      }
    } else {
      consecutiveLow = 0;
    }
  }

  return issues;
}

/**
 * 角色漂移检测（LLM）
 * 对比 Character.arcSummary 与最近 10 章的行为
 */
async function detectCharacterDrifts(
  ctx: PhaseContext,
  novelId: string,
  chapterOrder: number,
): Promise<CharacterDrift[]> {
  try {
    // 获取活跃角色（最近 10 章内出场过）
    const activeCharacters = await prisma.character.findMany({
      where: {
        novelId,
        lastAppear: { gte: chapterOrder - 10 },
      },
      select: { name: true, arcSummary: true, role: true },
      take: 5,
    });

    if (activeCharacters.length === 0) return [];

    // 获取最近 10 章的概要
    const recentSummaries = await prisma.chapterSummary.findMany({
      where: {
        novelId,
        chapterOrder: { gte: chapterOrder - 10, lt: chapterOrder },
      },
      orderBy: { chapterOrder: "asc" },
      select: { chapterOrder: true, summary: true, characterStates: true },
    });

    if (recentSummaries.length < 3) return [];

    const charList = activeCharacters.map(c =>
      `${c.name}（${c.role || "角色"}）：设定为「${c.arcSummary || "无"}」`
    ).join("\n");

    const summaryText = recentSummaries.map(s =>
      `第${s.chapterOrder}章：${s.summary}`
    ).join("\n");

    const prompt = `请检查以下角色在最近章节中是否出现了人设漂移（行为与设定不符）。

【角色设定】
${charList}

【最近剧情】
${summaryText}

请输出 JSON：
{
  "drifts": [
    { "characterName": "角色名", "driftDescription": "漂移描述", "severity": "warning/critical" }
  ]
}

如果没有人设漂移，输出空数组。只输出 JSON。`;

    const result = await ctx.llmService.completeText({ prompt, temperature: 0.3, maxTokens: 500 });
    const parsed = parseLlmJson<any>(result);

    if (!parsed?.drifts?.length) return [];

    return parsed.drifts.map((d: any) => ({
      characterName: d.characterName || "",
      driftDescription: d.driftDescription || "",
      severity: d.severity || "warning",
    }));
  } catch {
    return [];
  }
}

/**
 * 将检查结果写入 ConsistencyIssue 表
 */
export async function persistPeriodicCheckResults(
  novelId: string,
  chapterOrder: number,
  result: PeriodicCheckResult,
): Promise<void> {
  const issues: Array<{
    novelId: string;
    type: string;
    severity: string;
    description: string;
    evidence: string;
    suggestion: string;
  }> = [];

  for (const alert of result.hookAlerts) {
    issues.push({
      novelId,
      type: "hook",
      severity: alert.severity,
      description: `钩子「${alert.title}」逾期 ${alert.overdueBy} 章未回收`,
      evidence: `计划第${alert.plannedChapter}章回收，当前第${chapterOrder}章`,
      suggestion: "在下一章中安排回收或调整计划",
    });
  }

  for (const alert of result.foreshadowAlerts) {
    issues.push({
      novelId,
      type: "foreshadow",
      severity: alert.severity,
      description: `伏笔「${alert.title}」逾期 ${alert.overdueBy} 章未回收`,
      evidence: `计划第${alert.payoffChapter}章回收，当前第${chapterOrder}章`,
      suggestion: "在下一章中安排回收或调整计划",
    });
  }

  for (const drift of result.characterDrifts) {
    issues.push({
      novelId,
      type: "character",
      severity: drift.severity,
      description: `角色「${drift.characterName}」人设漂移：${drift.driftDescription}`,
      evidence: `第${chapterOrder - 10}-${chapterOrder}章`,
      suggestion: "检查后续章节中该角色的行为是否符合设定",
    });
  }

  for (const issue of result.emotionIssues) {
    issues.push({
      novelId,
      type: "emotion",
      severity: "warning",
      description: issue,
      evidence: `第${chapterOrder - 10}-${chapterOrder}章情绪曲线`,
      suggestion: "调整后续章节的情绪节奏",
    });
  }

  if (issues.length > 0) {
    await prisma.consistencyIssue.createMany({ data: issues });
  }
}
