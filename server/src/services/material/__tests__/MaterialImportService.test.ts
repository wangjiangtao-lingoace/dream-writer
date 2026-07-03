import { importMaterialAssets } from "../MaterialImportService";
import { prisma } from "../../../db/prisma";

jest.mock("../../../db/prisma", () => ({
  prisma: {
    novel: { update: jest.fn() },
    character: { upsert: jest.fn() },
    hook: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    knowledgeAsset: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    memory: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));

describe("importMaterialAssets", () => {
  it("persists mapped material assets", async () => {
    await importMaterialAssets("novel-1", {
      novelPatch: { coreSellingPoint: "老祖阴间享福、后代阳间打工、双线成长" },
      characters: [{ name: "林凡", role: "男主", personality: "普通起点", behaviorRules: [], forbiddenBehavior: [], rawProfile: "raw", sourceType: "user_original", isCanonical: true }],
      hooks: [],
      constraints: [],
      knowledgeAssets: [],
    });

    expect(prisma.novel.update).toHaveBeenCalled();
    expect(prisma.character.upsert).toHaveBeenCalled();
  });
});
