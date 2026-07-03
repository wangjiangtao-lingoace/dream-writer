import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/db/prisma";
import { mapMaterialSections } from "../src/services/material/MaterialAssetMapper";
import { buildMaterialCoverageReport } from "../src/services/material/MaterialCoverageReport";
import { importMaterialAssets } from "../src/services/material/MaterialImportService";
import { parseMaterialSections } from "../src/services/material/MaterialSectionParser";
import { executeCanonicalImport } from "../src/services/pipeline/canonicalImport";

async function main() {
  const [novelId, filePath] = process.argv.slice(2);
  if (!novelId || !filePath) {
    throw new Error("用法：pnpm --filter @dream-writer/server import:material <novelId> <filePath>");
  }

  const absolutePath = path.resolve(filePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { id: true } });
  if (!novel) throw new Error(`作品不存在：${novelId}`);

  const sections = parseMaterialSections(text);
  const assets = mapMaterialSections(sections);
  await importMaterialAssets(novelId, assets);

  const canonicalText = sections.find(section => section.type === "canonical_chapters")?.content || "";
  const canonicalResult = canonicalText
    ? await executeCanonicalImport(novelId, canonicalText)
    : { chapters: [], imported: 0, skipped: 0 };

  const report = buildMaterialCoverageReport(sections, assets);
  console.log(JSON.stringify({
    source: absolutePath,
    ...report,
    canonicalChapters: {
      detected: canonicalResult.chapters.length,
      imported: canonicalResult.imported,
      skipped: canonicalResult.skipped,
    },
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
