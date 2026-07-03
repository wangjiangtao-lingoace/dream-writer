import { prisma } from "../../db/prisma";
import { MappedMaterialAssets } from "./MaterialAssetMapper";

function json(value: unknown): string {
  return JSON.stringify(value ?? []);
}

async function upsertKnowledgeAsset(novelId: string, asset: { title: string; category: string; content: string; tags: string[] }) {
  const existing = await prisma.knowledgeAsset.findFirst({ where: { novelId, title: asset.title } });
  const data = { category: asset.category, content: asset.content, tags: json(asset.tags) };
  if (existing) {
    await prisma.knowledgeAsset.update({ where: { id: existing.id }, data });
  } else {
    await prisma.knowledgeAsset.create({ data: { novelId, title: asset.title, ...data } });
  }
}

async function upsertHook(novelId: string, hook: MappedMaterialAssets["hooks"][number]) {
  const title = `${hook.code} ${hook.title}`;
  const existing = await prisma.hook.findFirst({ where: { novelId, title } });
  const data = {
    description: hook.description,
    plannedChapter: hook.plannedChapter,
    resolvedChapter: hook.resolvedChapter,
    status: hook.status,
    type: "foreshadow",
    intensity: 8,
    category: "material_import",
  };
  if (existing) {
    await prisma.hook.update({ where: { id: existing.id }, data });
  } else {
    await prisma.hook.create({ data: { novelId, title, ...data } });
  }
}

async function upsertConstraintMemory(novelId: string, constraint: MappedMaterialAssets["constraints"][number]) {
  const existing = await prisma.memory.findFirst({ where: { novelId, type: "constraint", title: constraint.title } });
  const data = {
    category: constraint.scope,
    content: constraint.content,
    importance: constraint.priority,
    metadata: JSON.stringify({ source: "material_import" }),
  };
  if (existing) {
    await prisma.memory.update({ where: { id: existing.id }, data });
  } else {
    await prisma.memory.create({ data: { novelId, type: "constraint", title: constraint.title, ...data } });
  }
}

export async function importMaterialAssets(novelId: string, assets: MappedMaterialAssets): Promise<void> {
  if (Object.keys(assets.novelPatch).length > 0) {
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        coreSellingPoint: assets.novelPatch.coreSellingPoint,
        corePayoffs: assets.novelPatch.corePayoffs ? json(assets.novelPatch.corePayoffs) : undefined,
        coreConflict: assets.novelPatch.coreConflict,
        readerExpectations: assets.novelPatch.readerExpectations ? json(assets.novelPatch.readerExpectations) : undefined,
        outline: assets.novelPatch.outline,
        targetWordCount: assets.novelPatch.targetWordCount,
        volumeCount: assets.novelPatch.volumeCount,
        chaptersPerVol: assets.novelPatch.chaptersPerVol,
      },
    });
  }

  for (const character of assets.characters) {
    const data = {
      role: character.role,
      personality: character.personality,
      behaviorRules: json(character.behaviorRules),
      forbiddenBehavior: json(character.forbiddenBehavior),
      rawProfile: character.rawProfile,
      sourceType: character.sourceType,
      isCanonical: character.isCanonical,
      speechStyle: character.speechStyle || undefined,
      signatureLines: character.signatureLines?.length ? json(character.signatureLines) : undefined,
      signatureScenes: character.signatureScenes?.length ? json(character.signatureScenes) : undefined,
      comedyMechanisms: character.comedyMechanisms || undefined,
      emotionalHooks: character.emotionalHooks || undefined,
      abilities: character.abilities || undefined,
      appearance: character.appearance || undefined,
      background: character.background || undefined,
      motivation: character.motivation || undefined,
      arcDetail: character.arcDetail || undefined,
    };
    await prisma.character.upsert({
      where: { novelId_name: { novelId, name: character.name } },
      create: { novelId, name: character.name, ...data },
      update: data,
    });
  }

  for (const hook of assets.hooks) await upsertHook(novelId, hook);
  for (const asset of assets.knowledgeAssets) await upsertKnowledgeAsset(novelId, asset);
  for (const constraint of assets.constraints) await upsertConstraintMemory(novelId, constraint);
}
