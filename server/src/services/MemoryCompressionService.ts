import { prisma } from "../db/prisma";

// 记忆层级
export enum MemoryLayer {
  PERMANENT = "permanent",   // 一级记忆：永久（世界规则、核心人设、金手指规则）
  LONG_TERM = "long_term",   // 二级记忆：长期（当前卷主线、关系网、势力）
  SHORT_TERM = "short_term", // 三级记忆：短期（最近3章事件、当前情绪、冲突）
  TEMPORARY = "temporary",   // 四级记忆：临时（当前场景、当前动作）
}

// 记忆压缩配置
interface CompressionConfig {
  maxPermanent: number;   // 永久记忆最大数量
  maxLongTerm: number;    // 长期记忆最大数量
  maxShortTerm: number;   // 短期记忆最大数量
  maxTemporary: number;   // 临时记忆最大数量
  importanceThreshold: number; // 重要性阈值
}

const DEFAULT_CONFIG: CompressionConfig = {
  maxPermanent: 50,
  maxLongTerm: 100,
  maxShortTerm: 30,
  maxTemporary: 10,
  importanceThreshold: 7,
};

// 根据类型和重要性确定记忆层级
function determineLayer(type: string, importance: number): MemoryLayer {
  // 永久记忆：世界观规则、核心人设、金手指规则
  if (type === "world" && importance >= 8) {
    return MemoryLayer.PERMANENT;
  }
  if (type === "character" && importance >= 8) {
    return MemoryLayer.PERMANENT;
  }

  // 长期记忆：世界观、角色、剧情
  if (importance >= 6) {
    return MemoryLayer.LONG_TERM;
  }

  // 短期记忆
  if (importance >= 4) {
    return MemoryLayer.SHORT_TERM;
  }

  // 临时记忆
  return MemoryLayer.TEMPORARY;
}

// 获取压缩后的记忆上下文
export async function getCompressedMemoryContext(
  novelId: string,
  currentChapterOrder: number,
  config: Partial<CompressionConfig> = {}
): Promise<string> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // 获取所有记忆
  const allMemories = await prisma.memory.findMany({
    where: { novelId },
    orderBy: [
      { importance: "desc" },
      { updatedAt: "desc" },
    ],
  });

  // 分层
  const layers: Record<MemoryLayer, typeof allMemories> = {
    [MemoryLayer.PERMANENT]: [],
    [MemoryLayer.LONG_TERM]: [],
    [MemoryLayer.SHORT_TERM]: [],
    [MemoryLayer.TEMPORARY]: [],
  };

  for (const memory of allMemories) {
    const layer = determineLayer(memory.type, memory.importance);
    layers[layer].push(memory);
  }

  // 压缩每层
  const compressed = {
    permanent: layers[MemoryLayer.PERMANENT].slice(0, fullConfig.maxPermanent),
    longTerm: layers[MemoryLayer.LONG_TERM].slice(0, fullConfig.maxLongTerm),
    shortTerm: layers[MemoryLayer.SHORT_TERM].slice(0, fullConfig.maxShortTerm),
    temporary: layers[MemoryLayer.TEMPORARY].slice(0, fullConfig.maxTemporary),
  };

  // 构建上下文
  const context: string[] = [];

  // 一级记忆：永久
  if (compressed.permanent.length > 0) {
    context.push("【核心设定（永久记忆）】");
    for (const m of compressed.permanent) {
      context.push(`[${m.type}] ${m.title}: ${m.content}`);
    }
    context.push("");
  }

  // 二级记忆：长期
  if (compressed.longTerm.length > 0) {
    context.push("【重要设定（长期记忆）】");
    for (const m of compressed.longTerm) {
      context.push(`[${m.type}] ${m.title}: ${m.content}`);
    }
    context.push("");
  }

  // 三级记忆：短期
  if (compressed.shortTerm.length > 0) {
    context.push("【近期事件（短期记忆）】");
    for (const m of compressed.shortTerm) {
      context.push(`[${m.type}] ${m.title}: ${m.content}`);
    }
    context.push("");
  }

  // 四级记忆：临时
  if (compressed.temporary.length > 0) {
    context.push("【当前场景（临时记忆）】");
    for (const m of compressed.temporary) {
      context.push(`[${m.type}] ${m.title}: ${m.content}`);
    }
  }

  return context.join("\n");
}

// 记忆生命周期管理
export async function manageMemoryLifecycle(novelId: string, currentChapterOrder: number) {
  // 获取所有记忆
  const allMemories = await prisma.memory.findMany({
    where: { novelId },
    orderBy: { importance: "desc" },
  });

  const updates: Array<{ id: string; importance: number }> = [];

  for (const memory of allMemories) {
    const layer = determineLayer(memory.type, memory.importance);
    let newImportance = memory.importance;

    // 根据层级调整重要性
    switch (layer) {
      case MemoryLayer.PERMANENT:
        // 永久记忆保持不变
        break;
      case MemoryLayer.LONG_TERM:
        // 长期记忆轻微衰减
        if (memory.importance > 6) {
          newImportance = Math.max(6, memory.importance - 0.1);
        }
        break;
      case MemoryLayer.SHORT_TERM:
        // 短期记忆中度衰减
        if (memory.importance > 4) {
          newImportance = Math.max(4, memory.importance - 0.3);
        }
        break;
      case MemoryLayer.TEMPORARY:
        // 临时记忆快速衰减
        if (memory.importance > 2) {
          newImportance = Math.max(2, memory.importance - 0.5);
        }
        break;
    }

    if (newImportance !== memory.importance) {
      updates.push({
        id: memory.id,
        importance: Math.round(newImportance * 10) / 10,
      });
    }
  }

  // 批量更新
  for (const update of updates) {
    await prisma.memory.update({
      where: { id: update.id },
      data: { importance: update.importance },
    });
  }

  return {
    totalMemories: allMemories.length,
    updatedCount: updates.length,
  };
}

// 记忆整合（将相似记忆合并）
export async function consolidateMemories(novelId: string) {
  const allMemories = await prisma.memory.findMany({
    where: { novelId },
    orderBy: { importance: "desc" },
  });

  // 按类型分组
  const groups: Record<string, typeof allMemories> = {};
  for (const memory of allMemories) {
    const key = `${memory.type}_${memory.category}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(memory);
  }

  const consolidated: Array<{
    type: string;
    category: string;
    title: string;
    content: string;
    importance: number;
    count: number;
  }> = [];

  // 整合每组
  for (const [key, memories] of Object.entries(groups)) {
    if (memories.length <= 1) {
      consolidated.push({
        type: memories[0].type,
        category: memories[0].category,
        title: memories[0].title,
        content: memories[0].content,
        importance: memories[0].importance,
        count: 1,
      });
      continue;
    }

    // 合并相似记忆
    const mergedContent = memories
      .map((m) => m.content)
      .filter((c, i, arr) => arr.indexOf(c) === i) // 去重
      .join("；");

    const maxImportance = Math.max(...memories.map((m) => m.importance));

    consolidated.push({
      type: memories[0].type,
      category: memories[0].category,
      title: memories[0].title,
      content: mergedContent,
      importance: maxImportance,
      count: memories.length,
    });
  }

  return {
    originalCount: allMemories.length,
    consolidatedCount: consolidated.length,
    memories: consolidated,
  };
}

// 生成记忆摘要
export async function generateMemorySummary(novelId: string): Promise<string> {
  const compressed = await getCompressedMemoryContext(novelId, 0);
  const lifecycle = await manageMemoryLifecycle(novelId, 0);
  const consolidation = await consolidateMemories(novelId);

  const summary = [
    "【记忆系统摘要】",
    `总记忆数: ${lifecycle.totalMemories}`,
    `本次更新: ${lifecycle.updatedCount} 条`,
    `整合后: ${consolidation.consolidatedCount} 条`,
    "",
    compressed,
  ];

  return summary.join("\n");
}

// 自动记忆管理（在章节生成后调用）
export async function autoManageMemories(novelId: string, chapterOrder: number) {
  // 1. 管理记忆生命周期
  const lifecycle = await manageMemoryLifecycle(novelId, chapterOrder);

  // 2. 整合相似记忆
  const consolidation = await consolidateMemories(novelId);

  // 3. 清理低重要性记忆（可选）
  const lowImportanceCount = await prisma.memory.count({
    where: {
      novelId,
      importance: { lt: 2 },
    },
  });

  // 如果低重要性记忆过多，可以删除最旧的
  if (lowImportanceCount > 100) {
    const oldestLow = await prisma.memory.findMany({
      where: {
        novelId,
        importance: { lt: 2 },
      },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });

    for (const memory of oldestLow) {
      await prisma.memory.delete({ where: { id: memory.id } });
    }
  }

  return {
    lifecycle,
    consolidation,
    cleanedCount: lowImportanceCount > 100 ? 50 : 0,
  };
}
