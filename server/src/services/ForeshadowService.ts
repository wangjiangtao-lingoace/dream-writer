import { LlmInvokeService } from "./llm/LlmInvokeService";
import { prisma } from "../db/prisma";
import { buildStoryContext } from "./StoryStateService";

const llmService = new LlmInvokeService();

// 伏笔状态
export type ForeshadowStatus = "planted" | "active" | "payoff_pending" | "paid_off" | "expired";

// 创建伏笔
export async function createForeshadow(novelId: string, data: {
  title: string;
  description: string;
  plantChapter?: number;
  targetPayoffChapter?: number;
  relatedCharacters?: string[];
  importance?: number;
}) {
  return prisma.foreshadow.create({
    data: {
      novelId,
      title: data.title,
      description: data.description,
      plantChapter: data.plantChapter || null,
      payoffChapter: data.targetPayoffChapter || null,
      status: "planted",
    },
  });
}

// 更新伏笔状态
export async function updateForeshadowStatus(
  foreshadowId: string,
  status: ForeshadowStatus,
  payoffChapter?: number
) {
  const data: Record<string, unknown> = { status };
  if (payoffChapter) {
    data.payoffChapter = payoffChapter;
  }
  return prisma.foreshadow.update({
    where: { id: foreshadowId },
    data,
  });
}

// 获取活跃伏笔
export async function getActiveForeshadows(novelId: string) {
  return prisma.foreshadow.findMany({
    where: {
      novelId,
      status: { in: ["planted", "active", "payoff_pending"] },
    },
    orderBy: { createdAt: "asc" },
  });
}

// 获取待回收伏笔
export async function getPendingPayoffs(novelId: string, currentChapter: number) {
  return prisma.foreshadow.findMany({
    where: {
      novelId,
      status: "payoff_pending",
      payoffChapter: { lte: currentChapter },
    },
    orderBy: { payoffChapter: "asc" },
  });
}

// 自动伏笔回收分析
export async function analyzeForeshadowsForPayoff(novelId: string, currentChapter: number) {
  const activeForeshadows = await getActiveForeshadows(novelId);
  const pendingPayoffs = await getPendingPayoffs(novelId, currentChapter);

  const storyContext = await buildStoryContext(novelId);

  const foreshadowList = activeForeshadows.map((f) => 
    `- ${f.title}: ${f.description} (埋设于第${f.plantChapter}章, 状态: ${f.status})`
  ).join("\n");

  const prompt = [
    "你是一位小说伏笔管理专家，负责分析伏笔回收时机。",
    "",
    "当前章节：第" + currentChapter + "章",
    "",
    "剧情状态：",
    storyContext,
    "",
    "活跃伏笔：",
    foreshadowList || "暂无",
    "",
    "请分析：",
    "1. 哪些伏笔应该在当前章节回收？",
    "2. 哪些伏笔应该继续埋设？",
    "3. 哪些伏笔已经过期应该放弃？",
    "4. 回收方式建议（直接揭示/部分揭示/反转）",
    "",
    "请用 JSON 格式输出：",
    "{",
    '  "should_payoff": [{"id": "伏笔ID", "reason": "原因", "method": "回收方式"}],',
    '  "should_keep": [{"id": "伏笔ID", "reason": "原因"}],',
    '  "should_expire": [{"id": "伏笔ID", "reason": "原因"}],',
    '  "new_foreshadows": [{"title": "标题", "description": "描述"}]',
    "}",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位小说伏笔管理专家，擅长长线伏笔的设计和回收。",
    prompt,
    temperature: 0.3,
    maxTokens: 1500,
  });

  return result || "分析失败。";
}

// 自动伏笔生命周期管理
export async function manageForeshadowLifecycle(novelId: string, currentChapter: number) {
  const activeForeshadows = await getActiveForeshadows(novelId);
  
  const updates: Array<{ id: string; status: ForeshadowStatus }> = [];

  for (const foreshadow of activeForeshadows) {
    // 如果伏笔已经超过目标回收章节，标记为待回收
    if (foreshadow.payoffChapter && foreshadow.payoffChapter <= currentChapter) {
      updates.push({
        id: foreshadow.id,
        status: "payoff_pending",
      });
    }

    // 如果伏笔埋设超过 50 章还没回收，标记为过期
    if (foreshadow.plantChapter && currentChapter - foreshadow.plantChapter > 50) {
      updates.push({
        id: foreshadow.id,
        status: "expired",
      });
    }
  }

  // 执行更新
  for (const update of updates) {
    await updateForeshadowStatus(update.id, update.status);
  }

  return {
    totalActive: activeForeshadows.length,
    updatedCount: updates.length,
  };
}

// 生成伏笔上下文（用于 AI 生成）
export async function buildForeshadowContext(novelId: string, currentChapter: number) {
  const activeForeshadows = await getActiveForeshadows(novelId);
  const pendingPayoffs = await getPendingPayoffs(novelId, currentChapter);

  const context: string[] = [];

  if (activeForeshadows.length > 0) {
    context.push("【活跃伏笔】");
    for (const f of activeForeshadows) {
      const statusLabel = f.status === "payoff_pending" ? "待回收" : "活跃";
      context.push(`- ${f.title}: ${f.description} (${statusLabel})`);
    }
    context.push("");
  }

  if (pendingPayoffs.length > 0) {
    context.push("【必须回收的伏笔】");
    for (const f of pendingPayoffs) {
      context.push(`- ${f.title}: ${f.description} (应在本章回收)`);
    }
    context.push("");
  }

  return context.join("\n");
}

// 批量创建伏笔
export async function batchCreateForeshadows(novelId: string, foreshadows: Array<{
  title: string;
  description: string;
  plantChapter?: number;
  targetPayoffChapter?: number;
}>) {
  const results = [];
  for (const f of foreshadows) {
    const result = await createForeshadow(novelId, f);
    results.push(result);
  }
  return results;
}

// 伏笔统计
export async function getForeshadowStats(novelId: string) {
  const all = await prisma.foreshadow.findMany({
    where: { novelId },
  });

  const stats = {
    total: all.length,
    planted: all.filter((f) => f.status === "planted").length,
    active: all.filter((f) => f.status === "active").length,
    payoff_pending: all.filter((f) => f.status === "payoff_pending").length,
    paid_off: all.filter((f) => f.status === "paid_off").length,
    expired: all.filter((f) => f.status === "expired").length,
  };

  return stats;
}
