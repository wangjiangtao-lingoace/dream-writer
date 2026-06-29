import { MappedMaterialAssets } from "./MaterialAssetMapper";
import { MaterialSection } from "./MaterialSectionParser";

export interface MaterialCoverageReport {
  recognizedSections: Array<{ type: string; title: string; startLine: number; endLine: number }>;
  importedCounts: Record<string, number>;
  warnings: string[];
}

export interface AssetConsistencyResult {
  coverage: number;
  totalItems: number;
  referencedItems: number;
  missingCharacters: string[];
  missingHooks: string[];
  warnings: string[];
}

export function buildMaterialCoverageReport(
  sections: MaterialSection[],
  assets: MappedMaterialAssets,
): MaterialCoverageReport {
  const warnings: string[] = [];

  // 动态检测人物卡：从 sections 中提取 character_card 类型，与实际提取的角色名交叉校验
  const characterCardSections = sections.filter(s => s.type === "character_card");
  if (characterCardSections.length === 0) {
    warnings.push("未识别到任何人物卡");
  } else {
    const recognizedNames = assets.characters.map(c => c.name);
    for (const sec of characterCardSections) {
      const headerName = sec.title
        .replace(/^男\d+-/, "")
        .replace(/^人物卡[:：]\s*/, "")
        .replace(/设定$/, "")
        .replace(/[（(].*[）)]/, "")
        .trim();
      if (headerName && !recognizedNames.includes(headerName)) {
        warnings.push(`人物卡「${headerName}」名称提取失败`);
      }
    }
  }

  if (!assets.novelPatch.coreSellingPoint) warnings.push("未识别核心卖点");
  if (assets.hooks.length === 0) warnings.push("未识别钩子预埋与回收表");
  if (assets.constraints.length === 0) warnings.push("未识别强制约束规则");

  return {
    recognizedSections: sections.map(s => ({ type: s.type, title: s.title, startLine: s.startLine, endLine: s.endLine })),
    importedCounts: {
      characters: assets.characters.length,
      hooks: assets.hooks.length,
      constraints: assets.constraints.length,
      knowledgeAssets: assets.knowledgeAssets.length,
    },
    warnings,
  };
}

/**
 * 检查生成内容是否引用了素材资产（软检查，warn 但不阻断）
 */
export function checkMaterialAssetConsistency(
  generatedText: string,
  assets: MappedMaterialAssets,
): AssetConsistencyResult {
  const warnings: string[] = [];
  const missingCharacters: string[] = [];
  const missingHooks: string[] = [];

  let referencedItems = 0;
  const totalItems = assets.characters.length + assets.hooks.length;

  // 检查角色名是否在生成文本中出现
  for (const char of assets.characters) {
    if (generatedText.includes(char.name)) {
      referencedItems++;
    } else {
      missingCharacters.push(char.name);
    }
  }

  // 检查钩子关键词是否被引用
  for (const hook of assets.hooks) {
    const keywords = [hook.title, hook.code].filter(Boolean);
    const found = keywords.some(kw => kw && generatedText.includes(kw));
    if (found) {
      referencedItems++;
    } else {
      missingHooks.push(`${hook.code} ${hook.title}`);
    }
  }

  const coverage = totalItems > 0 ? referencedItems / totalItems : 1;

  if (missingCharacters.length > 0) {
    warnings.push(`章纲未引用角色：${missingCharacters.join("、")}`);
  }
  if (missingHooks.length > 0 && missingHooks.length <= 5) {
    warnings.push(`章纲未引用钩子：${missingHooks.join("、")}`);
  }

  return { coverage, totalItems, referencedItems, missingCharacters, missingHooks, warnings };
}

/**
 * 从 DB 数据检查章纲与素材资产的一致性（简化版，无需 MappedMaterialAssets）
 */
export async function checkMaterialConsistencyFromDb(
  novelId: string,
  generatedText: string,
): Promise<AssetConsistencyResult> {
  const { prisma } = await import("../../db/prisma");
  const [characters, hooks] = await Promise.all([
    prisma.character.findMany({ where: { novelId }, select: { name: true } }),
    prisma.hook.findMany({ where: { novelId, category: "material_import" }, select: { title: true } }),
  ]);
  const assets: MappedMaterialAssets = {
    novelPatch: {},
    characters: characters.map(c => ({ name: c.name, role: "", personality: "", behaviorRules: [], forbiddenBehavior: [], rawProfile: "", sourceType: "user_original" as const, isCanonical: true as const })),
    hooks: hooks.map(h => ({ code: "", title: h.title, description: "", plannedChapter: null, resolvedChapter: null, status: "planned" as const })),
    constraints: [],
    knowledgeAssets: [],
  };
  return checkMaterialAssetConsistency(generatedText, assets);
}
