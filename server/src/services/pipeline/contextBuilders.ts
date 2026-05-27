import { prisma } from "../../db/prisma";
import { PipelineConfig } from "../PipelineService";

export async function buildWorkspaceAssetContext(novelId: string, jobId?: string): Promise<string> {
  const [
    novel,
    characters,
    worldviews,
    volumes,
    mainlines,
    hooks,
    memories,
    assets,
  ] = await Promise.all([
    prisma.novel.findUnique({ where: { id: novelId } }),
    prisma.character.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.worldview.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 4 }),
    prisma.volume.findMany({
      where: { novelId },
      orderBy: { sortOrder: "asc" },
      include: { chapterOutlines: { orderBy: { sortOrder: "asc" }, take: 6 } },
      take: 3,
    }),
    prisma.mainline.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 6 }),
    prisma.hook.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.memory.findMany({ where: { novelId }, orderBy: [{ importance: "desc" }, { updatedAt: "desc" }], take: 12 }),
    prisma.knowledgeAsset.findMany({ where: { novelId }, orderBy: { updatedAt: "desc" }, take: 10 }),
  ]);

  const usageItems: Array<{ assetType: string; assetId: string; title: string }> = [];
  const lines: string[] = ["【当前作品已入库资产】"];
  if (novel?.outline?.trim()) {
    lines.push("## 当前作品大纲", novel.outline.trim());
    usageItems.push({ assetType: "novel_outline", assetId: novel.id, title: `${novel.title}/作品大纲` });
  }
  if (characters.length) {
    lines.push("## 人物卡");
    for (const character of characters) {
      lines.push(`- ${character.name}：${[character.role, character.identity, character.motivation, character.arcSummary].filter(Boolean).join(" / ")}`);
      usageItems.push({ assetType: "character", assetId: character.id, title: character.name });
    }
  }
  if (worldviews.length) {
    lines.push("## 世界观");
    for (const worldview of worldviews) {
      lines.push(`- ${worldview.name}：${[worldview.summary, worldview.rules, worldview.powerSystem].filter(Boolean).join(" / ")}`);
      usageItems.push({ assetType: "worldview", assetId: worldview.id, title: worldview.name });
    }
  }
  if (volumes.length) {
    lines.push("## 卷纲与章纲");
    for (const volume of volumes) {
      lines.push(`- ${volume.title}：${[volume.goal, volume.conflict, volume.endHook].filter(Boolean).join(" / ")}`);
      usageItems.push({ assetType: "volume", assetId: volume.id, title: volume.title });
      for (const chapter of volume.chapterOutlines) {
        lines.push(`  - 第${chapter.sortOrder}章 ${chapter.title}：${[chapter.goal, chapter.conflict, chapter.hook].filter(Boolean).join(" / ")}`);
        usageItems.push({ assetType: "chapter_outline", assetId: chapter.id, title: chapter.title });
      }
    }
  }
  if (mainlines.length) {
    lines.push("## 主线");
    for (const mainline of mainlines) {
      lines.push(`- ${mainline.title}：${mainline.description || ""}`);
      usageItems.push({ assetType: "mainline", assetId: mainline.id, title: mainline.title });
    }
  }
  if (hooks.length) {
    lines.push("## 钩子");
    for (const hook of hooks) {
      lines.push(`- ${hook.title}：${hook.description || ""}（状态：${hook.status}，计划：${hook.plannedChapter ?? "未定"}，回收：${hook.resolvedChapter ?? "未定"}）`);
      usageItems.push({ assetType: "hook", assetId: hook.id, title: hook.title });
    }
  }
  if (memories.length) {
    lines.push("## 高优先级记忆");
    for (const memory of memories) {
      lines.push(`- ${memory.title}：${memory.content.slice(0, 260)}`);
      usageItems.push({ assetType: "memory", assetId: memory.id, title: memory.title });
    }
  }
  if (assets.length) {
    lines.push("## 知识库资产");
    for (const asset of assets) {
      lines.push(`- ${asset.title} [${asset.category}]：${asset.content.slice(0, 260)}`);
      usageItems.push({ assetType: "knowledge_asset", assetId: asset.id, title: asset.title });
    }
  }

  await recordAssetUsage(novelId, jobId, usageItems);
  return lines.length > 1 ? lines.join("\n") : "";
}

export async function recordAssetUsage(
  novelId: string,
  jobId: string | undefined,
  items: Array<{ assetType: string; assetId: string; title: string }>,
  usageStage = "pipeline_context",
) {
  if (!jobId || !items.length) return;
  try {
    await prisma.assetUsageRecord.createMany({
      data: items.map((item) => ({
        novelId,
        pipelineJobId: jobId,
        assetType: item.assetType,
        assetId: item.assetId,
        title: item.title,
        usageStage,
      })),
    });
  } catch (error) {
    console.warn("记录资产使用失败:", error);
  }
}

export async function buildBookAnalysisContext(novelId: string, config: PipelineConfig, jobId?: string): Promise<string> {
  if (!config.bookAnalysisId) return "";
  const analysis = await prisma.bookAnalysis.findFirst({
    where: {
      id: config.bookAnalysisId,
      bindings: { some: { novelId } },
    },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  if (!analysis) return "";
  await recordAssetUsage(novelId, jobId, [{
    assetType: "book_analysis",
    assetId: analysis.id,
    title: analysis.title,
  }], "book_analysis_context");
  return [
    "【绑定拆书参考】",
    `标题：${analysis.title}`,
    `来源：${analysis.sourceTitle || analysis.title}`,
    ...analysis.sections.filter((section) => section.usedForImitation !== false).map((section) => [
      `### ${section.title}`,
      section.editedContent?.trim() || section.aiContent?.trim() || "暂无内容。",
    ].join("\n")),
  ].join("\n");
}

export async function buildImitationPlanContext(novelId: string, config: PipelineConfig, jobId?: string): Promise<string> {
  if (!config.imitationPlanId) return "";
  const plan = await prisma.imitationPlan.findFirst({
    where: {
      id: config.imitationPlanId,
      novelId,
    },
  });
  if (!plan) return "";
  await recordAssetUsage(novelId, jobId, [{
    assetType: "imitation_plan",
    assetId: plan.id,
    title: plan.title,
  }], "imitation_plan_context");
  return [
    "【仿写方案】",
    `标题：${plan.title}`,
    "## 创作蓝图",
    plan.blueprint,
    "## 章节模板",
    plan.chapterTemplate,
    "## 8 分区仿写落点",
    plan.sectionPlans,
    "## 样章草稿",
    plan.sampleDrafts,
  ].join("\n");
}
