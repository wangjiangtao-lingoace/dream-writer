import { prisma } from "../../db/prisma";
import { recordMaterialUsage } from "./pipelineUtils";

export interface MaterialContextItem {
  assetType: string;
  assetId: string;
  title: string;
  content: string;
}

const MATERIAL_KNOWLEDGE_CATEGORIES = [
  "worldview",
  "overall_plan",
  "creative_document",
  "hook_plan",
  "writing_constraints",
];

function limitText(value: string | null | undefined, max = 1500): string {
  const text = (value || "").trim();
  return text.length > max ? `${text.slice(0, max)}\n...(素材截断)` : text;
}

export function buildMaterialContextText(items: MaterialContextItem[]): string {
  if (items.length === 0) return "";
  return [
    "【作者原始素材资产】以下内容优先级高于自动生成内容，规划和正文必须引用并遵守。",
    ...items.map(item => `\n## ${item.title}\n${limitText(item.content)}`),
  ].join("\n");
}

export async function loadMaterialContextForNovel(novelId: string, pipelineJobId?: string): Promise<string> {
  const [novel, constraints, hooks, knowledgeAssets] = await Promise.all([
    prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, coreSellingPoint: true, corePayoffs: true, readerExpectations: true },
    }),
    prisma.memory.findMany({
      where: { novelId, type: "constraint" },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.hook.findMany({
      where: { novelId, category: "material_import" },
      orderBy: [{ plannedChapter: "asc" }, { createdAt: "asc" }],
      take: 20,
    }),
    prisma.knowledgeAsset.findMany({
      where: { novelId, category: { in: MATERIAL_KNOWLEDGE_CATEGORIES } },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
  ]);

  const items: MaterialContextItem[] = [];
  if (novel?.coreSellingPoint) {
    items.push({
      assetType: "novel",
      assetId: novel.id,
      title: "核心卖点",
      content: [
        novel.coreSellingPoint,
        novel.corePayoffs ? `核心兑现：${novel.corePayoffs}` : "",
        novel.readerExpectations ? `读者期待：${novel.readerExpectations}` : "",
      ].filter(Boolean).join("\n"),
    });
  }

  for (const constraint of constraints) {
    items.push({ assetType: "memory", assetId: constraint.id, title: constraint.title, content: constraint.content });
  }

  if (hooks.length > 0) {
    items.push({
      assetType: "hook",
      assetId: hooks.map(h => h.id).join(","),
      title: "钩子预埋与回收",
      content: hooks.map(h => {
        const range = [h.plannedChapter ? `预埋第${h.plannedChapter}章` : "", h.resolvedChapter ? `回收第${h.resolvedChapter}章` : ""].filter(Boolean).join("，");
        return `- ${h.title}${range ? `（${range}）` : ""}：${h.description || ""}`;
      }).join("\n"),
    });
  }

  for (const asset of knowledgeAssets) {
    items.push({ assetType: "knowledge_asset", assetId: asset.id, title: asset.title, content: asset.content });
  }

  await recordMaterialUsage(novelId, pipelineJobId, "pipeline_context", items.map(item => ({
    assetType: item.assetType,
    assetId: item.assetId,
    title: item.title,
  })));

  return buildMaterialContextText(items);
}
