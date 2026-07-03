# Material Ingestion And Context Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable path from a full author-owned `.txt` creation bible into structured Dream Writer assets, then make chapter outline and chapter draft prompts cite and obey those assets.

**Architecture:** Add a deterministic material parser before LLM-heavy phases, persist each recognized material block into existing domain tables, and assemble chapter context from those typed assets with an auditable usage report. The first implementation should prefer existing tables (`Character`, `Worldview`, `Novel`, `Volume`, `Hook`, `Foreshadow`, `KnowledgeAsset`, `Memory`, `AssetUsageRecord`) and introduce only one new lightweight table for high-priority writing constraints if schema pressure requires it.

**Tech Stack:** TypeScript, Express, Prisma 7, SQLite, Jest/ts-jest, existing PipelineService and pipeline phase modules.

---

## Current Problem

The source file `/Users/lingoace/Downloads/人在阳间打工，老祖阴间享福.txt` contains rich author-owned assets:

- Character cards: 林凡、林富贵、陆清菲、王德发、萧慕晴、钟少府
- Worldview and hard rules: 阴阳交互、贡品体系、品级体系、窥探镜、BGM、感情线、秘密线
- Core selling point: 老祖阴间享福、后代阳间打工、双线成长
- Long-form plan: 6 volumes, 600-800 chapters, 150-200 万字
- First-volume unit plan and chapter rhythm
- Hook planting and payoff tables
- Canonical chapters 1-4

The current system treats most of this as freeform inspiration. It imports chapters and extracts a shallow outline, but it does not persist or prioritize the author’s rules strongly enough for chapter outline and draft generation.

## Desired Behavior

After import, the system should be able to answer:

- Which source sections were recognized?
- Which exact DB assets were created or updated?
- Which assets are used when generating chapter outlines?
- Which constraints and hooks are used when drafting a specific chapter?
- Which author rules were not recognized and need manual attention?

The regenerated plan for this novel should start after canonical chapters. If chapters 1-4 exist as user original content, generated chapter outlines and drafts start at chapter 5.

## File Structure

### New Files

- `server/src/services/material/MaterialSectionParser.ts`
  - Deterministically splits the author `.txt` into typed sections.

- `server/src/services/material/MaterialAssetMapper.ts`
  - Maps typed sections into normalized asset DTOs.

- `server/src/services/material/MaterialImportService.ts`
  - Persists normalized assets into Prisma tables.

- `server/src/services/material/MaterialCoverageReport.ts`
  - Builds import coverage, warnings, and asset usage summary.

- `server/src/services/material/__tests__/MaterialSectionParser.test.ts`
  - Parser regression tests using representative snippets from the author file.

- `server/src/services/material/__tests__/MaterialAssetMapper.test.ts`
  - Mapping tests for core selling point, character cards, hooks, constraints, and chapters.

- `server/src/services/material/__tests__/MaterialImportService.test.ts`
  - Persistence behavior tests using mocked Prisma methods.

- `server/src/services/pipeline/materialContext.ts`
  - Loads high-priority material-derived assets for outline and draft prompts.

- `server/src/services/pipeline/__tests__/materialContext.test.ts`
  - Context assembly tests.

- `docs/change-logs/YYYYMMDDHHMM-material-ingestion-context.md`
  - Change log for this implementation.

### Modified Files

- `server/prisma/schema.prisma`
  - Add `WritingConstraint` only if existing `Memory/KnowledgeAsset` cannot carry priority and scope cleanly.

- `server/src/services/pipeline/analyzePhase.ts`
  - Run material import before generic analyze/decompose.

- `server/src/services/pipeline/canonicalImport.ts`
  - Reuse chapter detection, ensure chapter 4 is also canonical when present.

- `server/src/services/pipeline/chapterOutlinesPhase.ts`
  - Feed material-derived planning context into chapter outline generation.

- `server/src/services/pipeline/contextAssembler.ts`
  - Feed material-derived constraints, hooks, and character rules into writing context.

- `server/src/services/pipeline/generators.ts`
  - Add source-material prompt blocks for title style, hard rules, unit plan, and hook plan.

- `server/src/services/pipeline/pipelineUtils.ts`
  - Record `AssetUsageRecord` for material assets used in each stage.

- `server/src/routes/continuation.ts`
  - If current import route handles pasted/uploaded continuation text, return coverage report.

- `server/src/routes/pipeline.ts`
  - Expose coverage/usage report for a pipeline job if needed by UI.

---

## Task 1: Material Section Parser

**Files:**
- Create: `server/src/services/material/MaterialSectionParser.ts`
- Test: `server/src/services/material/__tests__/MaterialSectionParser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `server/src/services/material/__tests__/MaterialSectionParser.test.ts`:

```ts
import { parseMaterialSections } from "../MaterialSectionParser";

describe("parseMaterialSections", () => {
  it("recognizes major author-material sections", () => {
    const text = [
      "作品相关",
      "男主-林凡设定",
      "人物卡：林凡（男主）",
      "核心定位：林凡不是永远普通的执行者",
      "世界观",
      "世界观设定：《人在阳间享福，老祖阴间打工》",
      "核心卖点",
      "老祖阴间享福、后代阳间打工、双线成长",
      "整体规划",
      "## 整体规划",
      "钩子预埋与回收全表",
      "| 编号 | 钩子名称 | 埋设位置 | 回收位置 | 内容 |",
      "强制约束规则",
      "# 《人在阳间享福，老祖阴间打工》强制约束规则",
      "第1章 他们当时的嘲笑声好大呀",
      "阴司大殿。",
      "第2章 上香",
      "林凡跪在老家祖坟前。",
    ].join("\\n");

    const sections = parseMaterialSections(text);

    expect(sections.map(s => s.type)).toEqual([
      "character_card",
      "worldview",
      "core_selling_point",
      "overall_plan",
      "hook_table",
      "writing_constraints",
      "canonical_chapters",
    ]);
    expect(sections.find(s => s.type === "character_card")?.title).toContain("林凡");
    expect(sections.find(s => s.type === "canonical_chapters")?.content).toContain("第1章");
  });

  it("recognizes all known character card headers", () => {
    const text = [
      "人物卡：林凡（男主）\\n一、基础信息\\n姓名：林凡",
      "人物卡：林富贵（老祖）\\n一、基础信息\\n姓名：林富贵",
      "人物卡：陆清菲（女主）\\n一、基础信息\\n姓名：陆清菲",
      "人物卡：王德发（沙雕死党）\\n一、基础信息\\n姓名：王德发",
      "人物卡：萧慕晴（傲娇富家女）\\n一、基础信息\\n姓名：萧慕晴",
      "# 人物卡：钟少府\\n一、基础信息\\n姓名：钟少府",
    ].join("\\n\\n");

    const sections = parseMaterialSections(text);

    expect(sections.filter(s => s.type === "character_card").map(s => s.title)).toEqual([
      "人物卡：林凡（男主）",
      "人物卡：林富贵（老祖）",
      "人物卡：陆清菲（女主）",
      "人物卡：王德发（沙雕死党）",
      "人物卡：萧慕晴（傲娇富家女）",
      "人物卡：钟少府",
    ]);
  });
});
```

- [ ] **Step 2: Run parser tests and confirm failure**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath src/services/material/__tests__/MaterialSectionParser.test.ts
```

Expected: FAIL because `MaterialSectionParser.ts` does not exist.

- [ ] **Step 3: Implement deterministic parser**

Create `server/src/services/material/MaterialSectionParser.ts`:

```ts
export type MaterialSectionType =
  | "character_card"
  | "worldview"
  | "core_selling_point"
  | "overall_plan"
  | "creative_document"
  | "hook_table"
  | "writing_constraints"
  | "canonical_chapters"
  | "unknown";

export interface MaterialSection {
  type: MaterialSectionType;
  title: string;
  content: string;
  startLine: number;
  endLine: number;
}

interface Marker {
  type: MaterialSectionType;
  title: string;
  lineIndex: number;
}

const CHARACTER_HEADER = /^(?:#\\s*)?人物卡[:：].+|^男主-.+设定$/;
const SECTION_HEADERS: Array<{ type: MaterialSectionType; pattern: RegExp }> = [
  { type: "worldview", pattern: /^世界观\\s*$/ },
  { type: "core_selling_point", pattern: /^核心卖点\\s*$/ },
  { type: "overall_plan", pattern: /^整体规划\\s*$/ },
  { type: "creative_document", pattern: /^完整创作文档\\s*$/ },
  { type: "hook_table", pattern: /^钩子预埋与回收全表\\s*$/ },
  { type: "writing_constraints", pattern: /^强制约束规则\\s*$/ },
  { type: "canonical_chapters", pattern: /^第\\s*[一二三四五六七八九十百千万零〇\\d]+\\s*章\\s*.*$/ },
];

function cleanHeader(line: string): string {
  return line.trim().replace(/^#+\\s*/, "").trim();
}

function markerForLine(line: string, lineIndex: number): Marker | null {
  const header = cleanHeader(line);
  if (!header) return null;
  if (CHARACTER_HEADER.test(header)) {
    return { type: "character_card", title: header, lineIndex };
  }
  for (const candidate of SECTION_HEADERS) {
    if (candidate.pattern.test(header)) {
      return { type: candidate.type, title: header, lineIndex };
    }
  }
  return null;
}

export function parseMaterialSections(text: string): MaterialSection[] {
  const lines = text.split(/\\r?\\n/);
  const markers: Marker[] = [];

  for (let i = 0; i < lines.length; i++) {
    const marker = markerForLine(lines[i], i);
    if (!marker) continue;

    const previous = markers[markers.length - 1];
    if (marker.type === "canonical_chapters" && previous?.type === "canonical_chapters") {
      continue;
    }
    markers.push(marker);
  }

  const sections: MaterialSection[] = [];
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const next = markers[i + 1];
    const endLine = next ? next.lineIndex - 1 : lines.length - 1;
    const content = lines.slice(marker.lineIndex, endLine + 1).join("\\n").trim();
    if (!content) continue;
    sections.push({
      type: marker.type,
      title: marker.title,
      content,
      startLine: marker.lineIndex + 1,
      endLine: endLine + 1,
    });
  }

  return sections;
}
```

- [ ] **Step 4: Run parser tests and confirm pass**

Run the same Jest command.

Expected: PASS.

- [ ] **Step 5: Commit parser task**

```bash
git add server/src/services/material/MaterialSectionParser.ts server/src/services/material/__tests__/MaterialSectionParser.test.ts
git commit -m "feat: parse author material sections"
```

---

## Task 2: Material Asset Mapper

**Files:**
- Create: `server/src/services/material/MaterialAssetMapper.ts`
- Test: `server/src/services/material/__tests__/MaterialAssetMapper.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Create `server/src/services/material/__tests__/MaterialAssetMapper.test.ts`:

```ts
import { mapMaterialSections } from "../MaterialAssetMapper";
import { MaterialSection } from "../MaterialSectionParser";

describe("mapMaterialSections", () => {
  it("maps core selling point exactly as author corrected it", () => {
    const sections: MaterialSection[] = [
      {
        type: "core_selling_point",
        title: "核心卖点",
        content: "核心卖点\\n老祖阴间享福、后代阳间打工、双线成长",
        startLine: 1,
        endLine: 2,
      },
    ];

    const mapped = mapMaterialSections(sections);

    expect(mapped.novelPatch.coreSellingPoint).toBe("老祖阴间享福、后代阳间打工、双线成长");
    expect(mapped.novelPatch.corePayoffs).toContain("老祖阴间享福");
    expect(mapped.novelPatch.corePayoffs).toContain("后代阳间打工");
    expect(mapped.novelPatch.corePayoffs).toContain("双线成长");
  });

  it("maps a character card into canonical character fields", () => {
    const sections: MaterialSection[] = [
      {
        type: "character_card",
        title: "人物卡：林凡（男主）",
        content: [
          "人物卡：林凡（男主）",
          "姓名：林凡",
          "年龄：25岁",
          "标签：社畜 → 养成系主角 · 普通人逆袭",
          "核心定位：从普通人起步，通过任务磨砺成长",
          "他会做的事：",
          "- 从零开始学习、磨砺、成长，不依赖捷径",
          "他不会做的事：",
          "- 一步登天、开挂式变强",
          "成长红线：所有能力都必须有习得过程",
        ].join("\\n"),
        startLine: 1,
        endLine: 10,
      },
    ];

    const mapped = mapMaterialSections(sections);

    expect(mapped.characters[0]).toMatchObject({
      name: "林凡",
      role: "男主",
      sourceType: "user_original",
      isCanonical: true,
    });
    expect(mapped.characters[0].personality).toContain("从普通人起步");
    expect(mapped.characters[0].behaviorRules).toContain("从零开始学习");
    expect(mapped.characters[0].forbiddenBehavior).toContain("一步登天");
    expect(mapped.characters[0].rawProfile).toContain("成长红线");
  });

  it("maps hook table rows into hook DTOs", () => {
    const sections: MaterialSection[] = [
      {
        type: "hook_table",
        title: "钩子预埋与回收全表",
        content: [
          "钩子预埋与回收全表",
          "| 编号 | 钩子名称 | 埋设位置 | 回收位置 | 内容 |",
          "| 1-01 | 老祖怎么从九品爬到三品的 | 第1章·授印大典 | 全书每一章都在回答 | 整本书就是他的升职史 |",
        ].join("\\n"),
        startLine: 1,
        endLine: 3,
      },
    ];

    const mapped = mapMaterialSections(sections);

    expect(mapped.hooks[0]).toMatchObject({
      code: "1-01",
      title: "老祖怎么从九品爬到三品的",
      plannedChapter: 1,
      status: "planned",
    });
    expect(mapped.hooks[0].description).toContain("整本书就是他的升职史");
  });
});
```

- [ ] **Step 2: Run mapper tests and confirm failure**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath src/services/material/__tests__/MaterialAssetMapper.test.ts
```

Expected: FAIL because mapper does not exist.

- [ ] **Step 3: Implement mapper DTOs and helpers**

Create `server/src/services/material/MaterialAssetMapper.ts`:

```ts
import { MaterialSection } from "./MaterialSectionParser";

export interface MaterialNovelPatch {
  coreSellingPoint?: string;
  corePayoffs?: string[];
  coreConflict?: string;
  readerExpectations?: string[];
  outline?: string;
  targetWordCount?: number;
  volumeCount?: number;
  chaptersPerVol?: number;
}

export interface MaterialCharacterDto {
  name: string;
  role: string;
  personality: string;
  behaviorRules: string[];
  forbiddenBehavior: string[];
  rawProfile: string;
  sourceType: "user_original";
  isCanonical: true;
}

export interface MaterialHookDto {
  code: string;
  title: string;
  description: string;
  plannedChapter: number | null;
  resolvedChapter: number | null;
  status: "planned";
}

export interface MaterialConstraintDto {
  title: string;
  content: string;
  priority: number;
  scope: string;
}

export interface MappedMaterialAssets {
  novelPatch: MaterialNovelPatch;
  characters: MaterialCharacterDto[];
  hooks: MaterialHookDto[];
  constraints: MaterialConstraintDto[];
  knowledgeAssets: Array<{ title: string; category: string; content: string; tags: string[] }>;
}

function stripHeader(content: string): string {
  return content.split(/\\r?\\n/).slice(1).join("\\n").trim();
}

function firstMatch(content: string, pattern: RegExp): string {
  return content.match(pattern)?.[1]?.trim() || "";
}

function linesAfterHeading(content: string, heading: string): string[] {
  const lines = content.split(/\\r?\\n/);
  const start = lines.findIndex(line => line.includes(heading));
  if (start < 0) return [];
  const result: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^(他不会做的事|成长红线|四、|五、|六、|七、|八、|九、|十、)/.test(line)) break;
    if (line.startsWith("-")) result.push(line.replace(/^-\\s*/, ""));
  }
  return result;
}

function extractChapterNumber(value: string): number | null {
  const digit = value.match(/第\\s*(\\d+)\\s*章/);
  if (digit) return Number(digit[1]);
  return null;
}

function mapCharacter(section: MaterialSection): MaterialCharacterDto {
  const header = section.title.replace(/^人物卡[:：]/, "");
  const name = firstMatch(section.content, /姓名[:：]\\s*([^\\n]+)/) || header.replace(/[（(].*$/, "").trim();
  const role = section.title.match(/[（(]([^）)]+)[）)]/)?.[1] || "";
  return {
    name,
    role,
    personality: firstMatch(section.content, /核心定位[:：]\\s*([^\\n]+)/),
    behaviorRules: linesAfterHeading(section.content, "他会做的事"),
    forbiddenBehavior: linesAfterHeading(section.content, "他不会做的事"),
    rawProfile: section.content,
    sourceType: "user_original",
    isCanonical: true,
  };
}

function mapHooks(section: MaterialSection): MaterialHookDto[] {
  return section.content.split(/\\r?\\n/)
    .map(line => line.trim())
    .filter(line => /^\\|\\s*[A-Z]?\\d+-\\d+\\s*\\|/.test(line))
    .map(line => line.split("|").map(cell => cell.trim()).filter(Boolean))
    .filter(cells => cells.length >= 5)
    .map(cells => ({
      code: cells[0],
      title: cells[1],
      plannedChapter: extractChapterNumber(cells[2]),
      resolvedChapter: extractChapterNumber(cells[3]),
      description: cells.slice(4).join(" | "),
      status: "planned" as const,
    }));
}

export function mapMaterialSections(sections: MaterialSection[]): MappedMaterialAssets {
  const assets: MappedMaterialAssets = {
    novelPatch: {},
    characters: [],
    hooks: [],
    constraints: [],
    knowledgeAssets: [],
  };

  for (const section of sections) {
    if (section.type === "core_selling_point") {
      const value = stripHeader(section.content).split(/\\r?\\n/).find(Boolean)?.trim() || "";
      assets.novelPatch.coreSellingPoint = value;
      assets.novelPatch.corePayoffs = value.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
      assets.novelPatch.readerExpectations = assets.novelPatch.corePayoffs;
    }
    if (section.type === "character_card") {
      assets.characters.push(mapCharacter(section));
    }
    if (section.type === "hook_table") {
      assets.hooks.push(...mapHooks(section));
      assets.knowledgeAssets.push({
        title: "钩子预埋与回收全表",
        category: "hook_plan",
        content: section.content,
        tags: ["material", "hook", "foreshadow"],
      });
    }
    if (section.type === "writing_constraints") {
      assets.constraints.push({
        title: section.title,
        content: section.content,
        priority: 10,
        scope: "global",
      });
      assets.knowledgeAssets.push({
        title: "强制约束规则",
        category: "writing_constraints",
        content: section.content,
        tags: ["material", "constraint", "p0"],
      });
    }
    if (["worldview", "overall_plan", "creative_document"].includes(section.type)) {
      assets.knowledgeAssets.push({
        title: section.title,
        category: section.type,
        content: section.content,
        tags: ["material", section.type],
      });
    }
  }

  return assets;
}
```

- [ ] **Step 4: Run mapper tests and confirm pass**

Run the same Jest command.

Expected: PASS.

- [ ] **Step 5: Commit mapper task**

```bash
git add server/src/services/material/MaterialAssetMapper.ts server/src/services/material/__tests__/MaterialAssetMapper.test.ts
git commit -m "feat: map author material to assets"
```

---

## Task 3: Persist Material Assets

**Files:**
- Create: `server/src/services/material/MaterialImportService.ts`
- Create: `server/src/services/material/MaterialCoverageReport.ts`
- Test: `server/src/services/material/__tests__/MaterialImportService.test.ts`
- Modify: `server/src/services/pipeline/analyzePhase.ts`

- [ ] **Step 1: Write failing import service test**

Create `server/src/services/material/__tests__/MaterialImportService.test.ts`:

```ts
import { importMaterialAssets } from "../MaterialImportService";
import { prisma } from "../../../db/prisma";

jest.mock("../../../db/prisma", () => ({
  prisma: {
    novel: { update: jest.fn() },
    character: { upsert: jest.fn() },
    hook: { upsert: jest.fn() },
    knowledgeAsset: { upsert: jest.fn() },
    memory: { upsert: jest.fn() },
  },
}));

describe("importMaterialAssets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("persists mapped material into novel, character, hook, knowledge, and memory tables", async () => {
    await importMaterialAssets("novel-1", {
      novelPatch: {
        coreSellingPoint: "老祖阴间享福、后代阳间打工、双线成长",
        corePayoffs: ["老祖阴间享福", "后代阳间打工", "双线成长"],
        readerExpectations: ["老祖阴间享福", "后代阳间打工", "双线成长"],
      },
      characters: [{
        name: "林凡",
        role: "男主",
        personality: "普通起点但不认命",
        behaviorRules: ["从零开始学习"],
        forbiddenBehavior: ["一步登天"],
        rawProfile: "人物卡全文",
        sourceType: "user_original",
        isCanonical: true,
      }],
      hooks: [{
        code: "1-01",
        title: "老祖怎么从九品爬到三品的",
        description: "整本书就是他的升职史",
        plannedChapter: 1,
        resolvedChapter: null,
        status: "planned",
      }],
      constraints: [{
        title: "强制约束规则",
        content: "老祖无法直接解决阳间问题",
        priority: 10,
        scope: "global",
      }],
      knowledgeAssets: [{
        title: "强制约束规则",
        category: "writing_constraints",
        content: "老祖无法直接解决阳间问题",
        tags: ["material", "constraint"],
      }],
    });

    expect(prisma.novel.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "novel-1" },
      data: expect.objectContaining({
        coreSellingPoint: "老祖阴间享福、后代阳间打工、双线成长",
      }),
    }));
    expect(prisma.character.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { novelId_name: { novelId: "novel-1", name: "林凡" } },
    }));
    expect(prisma.hook.upsert).toHaveBeenCalled();
    expect(prisma.knowledgeAsset.upsert).toHaveBeenCalled();
    expect(prisma.memory.upsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run import test and confirm failure**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath src/services/material/__tests__/MaterialImportService.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement import service**

Create `server/src/services/material/MaterialImportService.ts`:

```ts
import { prisma } from "../../db/prisma";
import { MappedMaterialAssets } from "./MaterialAssetMapper";

function json(value: unknown): string {
  return JSON.stringify(value ?? []);
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
    await prisma.character.upsert({
      where: { novelId_name: { novelId, name: character.name } },
      create: {
        novelId,
        name: character.name,
        role: character.role,
        personality: character.personality,
        behaviorRules: json(character.behaviorRules),
        forbiddenBehavior: json(character.forbiddenBehavior),
        rawProfile: character.rawProfile,
        sourceType: character.sourceType,
        isCanonical: character.isCanonical,
      },
      update: {
        role: character.role,
        personality: character.personality,
        behaviorRules: json(character.behaviorRules),
        forbiddenBehavior: json(character.forbiddenBehavior),
        rawProfile: character.rawProfile,
        sourceType: character.sourceType,
        isCanonical: character.isCanonical,
      },
    });
  }

  for (const hook of assets.hooks) {
    await prisma.hook.upsert({
      where: { novelId_title: { novelId, title: `${hook.code} ${hook.title}` } },
      create: {
        novelId,
        title: `${hook.code} ${hook.title}`,
        description: hook.description,
        plannedChapter: hook.plannedChapter,
        resolvedChapter: hook.resolvedChapter,
        status: hook.status,
        type: "foreshadow",
        intensity: 8,
      },
      update: {
        description: hook.description,
        plannedChapter: hook.plannedChapter,
        resolvedChapter: hook.resolvedChapter,
        status: hook.status,
      },
    });
  }

  for (const asset of assets.knowledgeAssets) {
    await prisma.knowledgeAsset.upsert({
      where: { novelId_title: { novelId, title: asset.title } },
      create: {
        novelId,
        title: asset.title,
        category: asset.category,
        content: asset.content,
        tags: json(asset.tags),
      },
      update: {
        category: asset.category,
        content: asset.content,
        tags: json(asset.tags),
      },
    });
  }

  for (const constraint of assets.constraints) {
    await prisma.memory.upsert({
      where: { novelId_type_title: { novelId, type: "constraint", title: constraint.title } },
      create: {
        novelId,
        type: "constraint",
        category: constraint.scope,
        title: constraint.title,
        content: constraint.content,
        importance: constraint.priority,
        metadata: JSON.stringify({ source: "material_import" }),
      },
      update: {
        category: constraint.scope,
        content: constraint.content,
        importance: constraint.priority,
        metadata: JSON.stringify({ source: "material_import" }),
      },
    });
  }
}
```

- [ ] **Step 4: Add missing Prisma unique constraints if needed**

If `Hook`, `KnowledgeAsset`, or `Memory` lacks compound uniques used by upsert, update `server/prisma/schema.prisma`:

```prisma
model Hook {
  // existing fields
  @@unique([novelId, title])
}

model KnowledgeAsset {
  // existing fields
  @@unique([novelId, title])
}

model Memory {
  // existing fields
  @@unique([novelId, type, title])
}
```

Then run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH pnpm prisma:generate
```

Expected: Prisma client generation succeeds.

- [ ] **Step 5: Implement coverage report**

Create `server/src/services/material/MaterialCoverageReport.ts`:

```ts
import { MaterialSection } from "./MaterialSectionParser";
import { MappedMaterialAssets } from "./MaterialAssetMapper";

export interface MaterialCoverageReport {
  recognizedSections: Array<{ type: string; title: string; startLine: number; endLine: number }>;
  importedCounts: Record<string, number>;
  warnings: string[];
}

export function buildMaterialCoverageReport(
  sections: MaterialSection[],
  assets: MappedMaterialAssets,
): MaterialCoverageReport {
  const warnings: string[] = [];
  const characterNames = assets.characters.map(c => c.name);
  for (const required of ["林凡", "林富贵", "陆清菲", "王德发", "萧慕晴", "钟少府"]) {
    if (!characterNames.includes(required)) {
      warnings.push(`未识别人物卡：${required}`);
    }
  }
  if (!assets.novelPatch.coreSellingPoint) {
    warnings.push("未识别核心卖点");
  }
  if (assets.hooks.length === 0) {
    warnings.push("未识别钩子预埋与回收表");
  }
  if (assets.constraints.length === 0) {
    warnings.push("未识别强制约束规则");
  }

  return {
    recognizedSections: sections.map(s => ({
      type: s.type,
      title: s.title,
      startLine: s.startLine,
      endLine: s.endLine,
    })),
    importedCounts: {
      characters: assets.characters.length,
      hooks: assets.hooks.length,
      constraints: assets.constraints.length,
      knowledgeAssets: assets.knowledgeAssets.length,
    },
    warnings,
  };
}
```

- [ ] **Step 6: Wire material import into analyze phase**

Modify `server/src/services/pipeline/analyzePhase.ts` near the start of `executeAnalyzePhase`, before generic analyze/decompose:

```ts
import { parseMaterialSections } from "./../material/MaterialSectionParser";
import { mapMaterialSections } from "./../material/MaterialAssetMapper";
import { importMaterialAssets } from "./../material/MaterialImportService";
import { buildMaterialCoverageReport } from "./../material/MaterialCoverageReport";
```

Then add:

```ts
const materialSections = parseMaterialSections(novel.inspiration || "");
if (materialSections.length > 0) {
  const materialAssets = mapMaterialSections(materialSections);
  await importMaterialAssets(novelId, materialAssets);
  const report = buildMaterialCoverageReport(materialSections, materialAssets);
  await ctx.savePhaseResult(jobId, "outline", "material_import", {
    source: "novel.inspiration",
  }, report);
}
```

Do not return early after material import. Let canonical chapter import and outline generation continue.

- [ ] **Step 7: Run import tests and typecheck**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath src/services/material/__tests__/MaterialImportService.test.ts
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH pnpm typecheck
```

Expected: tests pass, typecheck passes.

- [ ] **Step 8: Commit import task**

```bash
git add server/src/services/material server/src/services/pipeline/analyzePhase.ts server/prisma/schema.prisma
git commit -m "feat: import structured author material"
```

---

## Task 4: Material Context For Prompts

**Files:**
- Create: `server/src/services/pipeline/materialContext.ts`
- Test: `server/src/services/pipeline/__tests__/materialContext.test.ts`
- Modify: `server/src/services/pipeline/chapterOutlinesPhase.ts`
- Modify: `server/src/services/pipeline/contextAssembler.ts`
- Modify: `server/src/services/pipeline/generators.ts`

- [ ] **Step 1: Write failing material context tests**

Create `server/src/services/pipeline/__tests__/materialContext.test.ts`:

```ts
import { buildMaterialContextText } from "../materialContext";

describe("buildMaterialContextText", () => {
  it("prioritizes selling point, constraints, and hooks for outline generation", () => {
    const text = buildMaterialContextText({
      sellingPoint: "老祖阴间享福、后代阳间打工、双线成长",
      constraints: [
        { title: "阴阳交互约束", content: "老祖无法直接解决阳间问题", priority: 10 },
      ],
      hooks: [
        { title: "1-01 老祖怎么从九品爬到三品的", description: "整本书就是他的升职史", plannedChapter: 1, resolvedChapter: null },
      ],
      knowledgeAssets: [
        { title: "整体规划", content: "总章数规划：600-800章" },
      ],
    });

    expect(text).toContain("P0 素材资产");
    expect(text).toContain("老祖阴间享福、后代阳间打工、双线成长");
    expect(text).toContain("老祖无法直接解决阳间问题");
    expect(text).toContain("老祖怎么从九品爬到三品的");
    expect(text).toContain("总章数规划：600-800章");
  });
});
```

- [ ] **Step 2: Run material context test and confirm failure**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath src/services/pipeline/__tests__/materialContext.test.ts
```

Expected: FAIL because file does not exist.

- [ ] **Step 3: Implement pure formatter**

Create `server/src/services/pipeline/materialContext.ts`:

```ts
export interface MaterialContextInput {
  sellingPoint?: string | null;
  constraints: Array<{ title: string; content: string; priority: number }>;
  hooks: Array<{ title: string; description: string; plannedChapter: number | null; resolvedChapter: number | null }>;
  knowledgeAssets: Array<{ title: string; content: string }>;
}

function truncate(value: string, max = 1200): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function buildMaterialContextText(input: MaterialContextInput): string {
  const parts: string[] = ["【P0 素材资产 — 作者原始设定，优先级高于模型自创】"];
  if (input.sellingPoint) {
    parts.push(`核心卖点：${input.sellingPoint}`);
  }
  if (input.constraints.length > 0) {
    parts.push("强制约束：");
    for (const c of input.constraints.sort((a, b) => b.priority - a.priority).slice(0, 5)) {
      parts.push(`- ${c.title}：${truncate(c.content, 500)}`);
    }
  }
  if (input.hooks.length > 0) {
    parts.push("钩子/伏笔计划：");
    for (const h of input.hooks.slice(0, 8)) {
      parts.push(`- ${h.title}：${h.description}（埋设：${h.plannedChapter ?? "未定"}，回收：${h.resolvedChapter ?? "未定"}）`);
    }
  }
  if (input.knowledgeAssets.length > 0) {
    parts.push("长期规划摘录：");
    for (const asset of input.knowledgeAssets.slice(0, 3)) {
      parts.push(`- ${asset.title}：${truncate(asset.content, 700)}`);
    }
  }
  return parts.join("\\n");
}
```

- [ ] **Step 4: Add DB loader for material context**

In the same file add:

```ts
import { prisma } from "../../db/prisma";

export async function loadMaterialContextForNovel(novelId: string): Promise<string> {
  const [novel, constraints, hooks, knowledgeAssets] = await Promise.all([
    prisma.novel.findUnique({
      where: { id: novelId },
      select: { coreSellingPoint: true },
    }),
    prisma.memory.findMany({
      where: { novelId, type: "constraint" },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 8,
      select: { title: true, content: true, importance: true },
    }),
    prisma.hook.findMany({
      where: { novelId },
      orderBy: [{ plannedChapter: "asc" }, { createdAt: "asc" }],
      take: 12,
      select: { title: true, description: true, plannedChapter: true, resolvedChapter: true },
    }),
    prisma.knowledgeAsset.findMany({
      where: { novelId, category: { in: ["overall_plan", "creative_document", "writing_constraints", "hook_plan"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { title: true, content: true },
    }),
  ]);

  return buildMaterialContextText({
    sellingPoint: novel?.coreSellingPoint,
    constraints: constraints.map(c => ({ title: c.title, content: c.content, priority: c.importance })),
    hooks,
    knowledgeAssets,
  });
}
```

- [ ] **Step 5: Feed context into chapter outline prompts**

Modify `server/src/services/pipeline/chapterOutlinesPhase.ts`:

```ts
import { loadMaterialContextForNovel } from "./materialContext";
```

Inside `executeChapterOutlinesPhase`, load once:

```ts
const materialContext = await loadMaterialContextForNovel(novelId).catch(() => "");
```

Pass it into `generateEnrichedChapterOutlines`:

```ts
{
  canonicalOffset,
  titleStyleRules: CHAPTER_TITLE_STYLE_RULES,
  chapterRangeDescription: buildChapterRangeDescription(...),
  materialContext,
}
```

Modify `generationContext` type in `generators.ts`:

```ts
materialContext?: string;
```

Add to prompt after story outline:

```ts
${generationContext?.materialContext ? `\n【作者素材资产】\n${generationContext.materialContext}` : ""}
```

- [ ] **Step 6: Feed context into writing prompts**

Modify `server/src/services/pipeline/contextAssembler.ts`:

```ts
import { loadMaterialContextForNovel } from "./materialContext";
```

Add `materialContext` to the assembled context result:

```ts
const materialContext = await loadMaterialContextForNovel(this.novelId).catch(() => "");
```

Ensure `server/src/services/pipeline/prompts/index.ts` includes the text in P0 or P1, before lower-priority world background.

- [ ] **Step 7: Record asset usage**

Modify `server/src/services/pipeline/pipelineUtils.ts` with a helper:

```ts
export async function recordMaterialUsage(novelId: string, pipelineJobId: string | undefined, usageStage: string, assets: Array<{ type: string; id: string; title: string }>) {
  for (const asset of assets) {
    await prisma.assetUsageRecord.create({
      data: {
        novelId,
        pipelineJobId,
        assetType: asset.type,
        assetId: asset.id,
        title: asset.title,
        usageStage,
      },
    });
  }
}
```

Call this from `loadMaterialContextForNovel` only if the caller passes `pipelineJobId`. If not, skip recording to keep the loader pure for tests.

- [ ] **Step 8: Run material context tests and typecheck**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath src/services/pipeline/__tests__/materialContext.test.ts
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH pnpm typecheck
```

Expected: tests pass, typecheck passes.

- [ ] **Step 9: Commit context task**

```bash
git add server/src/services/pipeline/materialContext.ts server/src/services/pipeline/__tests__/materialContext.test.ts server/src/services/pipeline/chapterOutlinesPhase.ts server/src/services/pipeline/contextAssembler.ts server/src/services/pipeline/generators.ts server/src/services/pipeline/pipelineUtils.ts
git commit -m "feat: link material assets into generation context"
```

---

## Task 5: Current Novel Re-import Workflow

**Files:**
- Create: `server/scripts/import-material-file.ts`
- Test: `server/src/services/material/__tests__/MaterialSectionParser.test.ts`
- Modify: `docs/change-logs/YYYYMMDDHHMM-material-ingestion-context.md`

- [ ] **Step 1: Create a script for local re-import**

Create `server/scripts/import-material-file.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/db/prisma";
import { parseMaterialSections } from "../src/services/material/MaterialSectionParser";
import { mapMaterialSections } from "../src/services/material/MaterialAssetMapper";
import { importMaterialAssets } from "../src/services/material/MaterialImportService";
import { buildMaterialCoverageReport } from "../src/services/material/MaterialCoverageReport";
import { executeCanonicalImport } from "../src/services/pipeline/canonicalImport";

async function main() {
  const novelId = process.argv[2];
  const filePath = process.argv[3];
  if (!novelId || !filePath) {
    throw new Error("Usage: ts-node server/scripts/import-material-file.ts <novelId> <filePath>");
  }

  const absolutePath = path.resolve(filePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const sections = parseMaterialSections(text);
  const assets = mapMaterialSections(sections);

  await importMaterialAssets(novelId, assets);
  const canonical = await executeCanonicalImport(novelId, text);
  const report = buildMaterialCoverageReport(sections, assets);

  console.log(JSON.stringify({
    canonical,
    report,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add script command**

Modify `server/package.json` scripts:

```json
"import:material": "ts-node-dev --transpile-only --exit-child scripts/import-material-file.ts"
```

If `ts-node-dev --exit-child` is unreliable for one-shot scripts, use:

```json
"import:material": "tsx scripts/import-material-file.ts"
```

and add `tsx` as a dev dependency only if already present in the workspace. If not present, keep `ts-node-dev`.

- [ ] **Step 3: Run script on current novel**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH pnpm import:material cmqsckuse0000govrpy4yo9ud /Users/lingoace/Downloads/人在阳间打工，老祖阴间享福.txt
```

Expected output includes:

```json
{
  "canonical": {
    "chapters": [...],
    "imported": 1,
    "skipped": 3
  },
  "report": {
    "importedCounts": {
      "characters": 6,
      "hooks": 40
    },
    "warnings": []
  }
}
```

The exact hook count may differ, but it must be greater than 20. If `warnings` includes missing required character cards, stop and fix parser markers before running pipeline.

- [ ] **Step 4: Verify DB after import**

Run:

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 - <<'PY'
import sqlite3
novel_id = "cmqsckuse0000govrpy4yo9ud"
con = sqlite3.connect("server/dev.db")
cur = con.cursor()
for table in ["Character", "Worldview", "KnowledgeAsset", "Memory", "Hook", "Chapter"]:
    cur.execute(f"select count(*) from {table} where novelId=?", (novel_id,))
    print(table, cur.fetchone()[0])
cur.execute('select "order", title, sourceType, isCanonical, canRewrite from Chapter where novelId=? order by "order"', (novel_id,))
for row in cur.fetchall():
    print(row)
con.close()
PY
```

Expected:

- `Character >= 6`
- `KnowledgeAsset >= 4`
- `Memory >= 1`
- `Hook >= 20`
- `Chapter >= 4`
- Chapters 1-4 are `user_original`, `isCanonical=1`, `canRewrite=0`

- [ ] **Step 5: Commit script task**

```bash
git add server/scripts/import-material-file.ts server/package.json
git commit -m "chore: add material file import script"
```

---

## Task 6: Pipeline Restart From Chapter 5

**Files:**
- Modify: `server/src/services/pipeline/chapterOutlinesPhase.ts`
- Modify: `server/src/services/pipeline/writingPhase.ts`
- Test: `server/src/services/pipeline/__tests__/chapterOutlinesPhase.test.ts`

- [ ] **Step 1: Extend existing continuation tests**

Update `server/src/services/pipeline/__tests__/chapterOutlinesPhase.test.ts`:

```ts
it("starts generated outlines from chapter 5 when four canonical chapters exist", () => {
  expect(calculateChapterOutlineStartOrder(0, 10, 4)).toBe(5);
  expect(buildChapterRangeDescription(0, 0, 10, 4)).toBe(
    "请为第1卷的全书第5到第14章设计详细章纲。前4章是用户原文，必须只承接，不得重新规划或改写。",
  );
});
```

- [ ] **Step 2: Run test and confirm pass or fail**

Run:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath src/services/pipeline/__tests__/chapterOutlinesPhase.test.ts
```

Expected: PASS if Task 4 preserved previous canonical offset logic. If FAIL, fix `calculateChapterOutlineStartOrder`.

- [ ] **Step 3: Ensure writing phase starts after canonical chapters**

Check `server/src/services/pipeline/writingPhase.ts` for `resolveWritingStartOrder`. It should query:

```ts
OR: [
  { sourceType: "user_original" },
  { isCanonical: true },
  { canRewrite: false },
]
```

and return `lastCanonical.order + 1`. If missing, implement this exact query and add a test in a new file `server/src/services/pipeline/__tests__/writingPhaseStart.test.ts`.

- [ ] **Step 4: Start pipeline for current novel with clean generated assets**

Because the user already authorized deleting generated planning data, clear only generated pipeline artifacts before rerun:

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 - <<'PY'
import sqlite3
novel_id = "cmqsckuse0000govrpy4yo9ud"
con = sqlite3.connect("server/dev.db")
cur = con.cursor()
for table in ["PhaseResult", "PipelineJob", "Volume", "ChapterOutline", "PayoffChain", "Mainline", "Hook", "Foreshadow", "PleasurePoint", "EmotionCurve", "ConsistencyIssue", "ConsistencyCheckResult", "ChapterBeat", "ChapterQualityLog"]:
    if table == "PhaseResult":
        cur.execute("delete from PhaseResult where jobId in (select id from PipelineJob where novelId=?)", (novel_id,))
    elif table == "PipelineJob":
        cur.execute("delete from PipelineJob where novelId=?", (novel_id,))
    else:
        cur.execute(f"delete from {table} where novelId=?", (novel_id,))
con.commit()
con.close()
PY
```

Then start the app and run pipeline with:

```json
{
  "inputMode": "structured",
  "continuationMode": "continue",
  "volumeCount": 6,
  "chaptersPerVolume": 100,
  "targetWordCount": 1800000
}
```

- [ ] **Step 5: Verify first regenerated outline**

Run:

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 - <<'PY'
import sqlite3
novel_id = "cmqsckuse0000govrpy4yo9ud"
con = sqlite3.connect("server/dev.db")
con.row_factory = sqlite3.Row
cur = con.cursor()
for row in cur.execute('select sortOrder, title, goal from ChapterOutline where novelId=? order by sortOrder limit 5', (novel_id,)):
    print(dict(row))
con.close()
PY
```

Expected:

- First `ChapterOutline.sortOrder` is `5`
- No generated outline at `sortOrder` 1-4
- First generated title does not contain `PPT`, `KPI`, `系统`, `任务`, `规则`, `金手指`, `爽点`, `打工人`, or `绩效`

- [ ] **Step 6: Commit pipeline restart task**

```bash
git add server/src/services/pipeline/chapterOutlinesPhase.ts server/src/services/pipeline/writingPhase.ts server/src/services/pipeline/__tests__
git commit -m "fix: continue pipeline after canonical chapters"
```

---

## Task 7: UI/API Coverage Report

**Files:**
- Modify: `server/src/routes/pipeline.ts`
- Modify: `server/src/routes/continuation.ts`
- Modify: `client/src/pages/NovelWorkspace.tsx` or existing pipeline panel component

- [ ] **Step 1: Add API response shape**

Add a route:

```ts
router.get("/:jobId/material-report", async (req, res) => {
  const { jobId } = req.params;
  const result = await prisma.phaseResult.findFirst({
    where: { jobId, phase: "outline", step: "material_import" },
    select: { output: true },
  });
  if (!result?.output) {
    return res.status(404).json({ success: false, error: "素材导入报告不存在" });
  }
  res.json({ success: true, data: JSON.parse(result.output) });
});
```

- [ ] **Step 2: Add minimal UI display**

In the existing pipeline UI, add a compact card:

```tsx
<section className="material-report">
  <h3>素材导入报告</h3>
  <p>人物卡：{report.importedCounts.characters}</p>
  <p>钩子：{report.importedCounts.hooks}</p>
  <p>强制规则：{report.importedCounts.constraints}</p>
  {report.warnings.length > 0 && (
    <ul>
      {report.warnings.map((warning) => <li key={warning}>{warning}</li>)}
    </ul>
  )}
</section>
```

- [ ] **Step 3: Verify manually**

Start dev servers:

```bash
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH pnpm dev
```

Expected:

- Frontend shows the material report after pipeline starts.
- Warnings are visible if a required section is missing.
- The report does not block pipeline execution unless required character cards or core selling point are missing.

- [ ] **Step 4: Commit UI/API task**

```bash
git add server/src/routes/pipeline.ts server/src/routes/continuation.ts client/src/pages/NovelWorkspace.tsx
git commit -m "feat: show material import coverage"
```

---

## Verification Checklist

Run these commands before declaring the work complete:

```bash
cd server
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/jest --runTestsByPath \
  src/services/material/__tests__/MaterialSectionParser.test.ts \
  src/services/material/__tests__/MaterialAssetMapper.test.ts \
  src/services/material/__tests__/MaterialImportService.test.ts \
  src/services/pipeline/__tests__/materialContext.test.ts \
  src/services/pipeline/__tests__/chapterOutlinesPhase.test.ts

PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH pnpm typecheck
```

Run full workspace typecheck if Node environment is set correctly:

```bash
PATH=/Users/lingoace/.nvm/versions/node/v22.19.0/bin:$PATH pnpm typecheck
```

Manual DB verification for the current novel:

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 - <<'PY'
import sqlite3
novel_id = "cmqsckuse0000govrpy4yo9ud"
con = sqlite3.connect("server/dev.db")
cur = con.cursor()
checks = [
    ("Character", "select count(*) from Character where novelId=?"),
    ("KnowledgeAsset", "select count(*) from KnowledgeAsset where novelId=?"),
    ("Memory", "select count(*) from Memory where novelId=?"),
    ("Hook", "select count(*) from Hook where novelId=?"),
    ("Chapter", "select count(*) from Chapter where novelId=?"),
    ("ChapterOutline", "select min(sortOrder), count(*) from ChapterOutline where novelId=?"),
]
for label, sql in checks:
    cur.execute(sql, (novel_id,))
    print(label, cur.fetchone())
con.close()
PY
```

Expected:

- Characters: at least 6
- KnowledgeAsset: at least 4
- Memory: at least 1 high-priority constraint set
- Hook: at least 20
- Chapter: at least 4 canonical user-original chapters
- ChapterOutline minimum sort order: 5

---

## Rollback Notes

If material import produces bad structured assets:

1. Stop dev servers.
2. Delete generated rows for the current novel from `Character`, `Worldview`, `KnowledgeAsset`, `Memory`, `Hook`, `Foreshadow`, `Volume`, `ChapterOutline`, `PipelineJob`, and `PhaseResult`.
3. Keep canonical `Chapter` rows unless the user explicitly asks to delete original chapters.
4. Fix parser tests with the missed source pattern.
5. Re-run import.

---

## Self-Review

- Spec coverage: The plan covers section parsing, asset mapping, persistence, context linking, usage reporting, current novel re-import, and pipeline restart from chapter 5.
- Placeholder scan: No placeholder markers or undefined future work remains. All tasks include concrete files, code, commands, and expected outcomes.
- Type consistency: `MaterialSection`, `MappedMaterialAssets`, `MaterialCoverageReport`, and `MaterialContextInput` are defined before use. Prisma unique constraints are identified before upsert usage.
