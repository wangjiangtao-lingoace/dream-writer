# User Asset Bible Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable "novel bible" ingestion pipeline that imports all user-provided creative assets, preserves the original text, structures usable fields, and forces later outline/chapter generation to respect those assets.

**Architecture:** Treat the user document as a canonical asset bible. Ingestion has four layers: raw source snapshot, section-level knowledge assets, structured domain records, and high-priority runtime constraints. Generation then uses a material context policy plus post-generation conformance checks so imported assets are actually obeyed.

**Tech Stack:** TypeScript, Express, Prisma 7, SQLite, Jest, existing pipeline services under `server/src/services/pipeline`, existing material services under `server/src/services/material`.

---

## File Structure

- Modify: `server/src/services/material/MaterialSectionParser.ts`  
  Responsibility: split the full txt into stable sections and nested subsections without losing content.
- Create: `server/src/services/material/MaterialBibleTaxonomy.ts`  
  Responsibility: define asset categories, section types, and import priorities.
- Modify: `server/src/services/material/MaterialAssetMapper.ts`  
  Responsibility: convert parsed sections into structured Novel, Character, Hook, Memory, KnowledgeAsset, Volume, and ChapterOutline DTOs.
- Modify: `server/src/services/material/MaterialImportService.ts`  
  Responsibility: persist all mapped assets idempotently.
- Modify: `server/src/services/material/MaterialCoverageReport.ts`  
  Responsibility: report exactly what was recognized, imported, preserved raw-only, or missing.
- Modify: `server/src/services/pipeline/materialContext.ts`  
  Responsibility: load the right imported assets for outline/chapter generation.
- Create: `server/src/services/pipeline/materialConformance.ts`  
  Responsibility: check generated outlines and chapters against imported hard constraints.
- Modify: `server/src/services/pipeline/analyzePhase.ts`  
  Responsibility: run bible ingestion before LLM analysis and import canonical chapters only from the real正文区.
- Modify: `server/src/services/pipeline/chapterOutlinesPhase.ts`  
  Responsibility: inject asset bible context into volume/chapter planning.
- Modify: `server/src/services/pipeline/generators.ts`  
  Responsibility: include asset bible context and hard constraint text in generation prompts.
- Modify: `server/src/services/pipeline/contextAssembler.ts`  
  Responsibility: include character/world/constraint context during chapter drafting.
- Modify: `server/scripts/import-material-file.ts`  
  Responsibility: CLI path for importing a local txt into a chosen novel.
- Tests:
  - `server/src/services/material/__tests__/MaterialSectionParser.test.ts`
  - `server/src/services/material/__tests__/MaterialAssetMapper.test.ts`
  - `server/src/services/material/__tests__/MaterialImportService.test.ts`
  - `server/src/services/pipeline/__tests__/materialContext.test.ts`
  - `server/src/services/pipeline/__tests__/materialConformance.test.ts`

---

### Task 1: Define Asset Bible Taxonomy

**Files:**
- Create: `server/src/services/material/MaterialBibleTaxonomy.ts`
- Test: `server/src/services/material/__tests__/MaterialBibleTaxonomy.test.ts`

- [ ] **Step 1: Write taxonomy test**

```ts
import { getMaterialPriority, MATERIAL_ASSET_CATEGORIES } from "../MaterialBibleTaxonomy";

describe("MaterialBibleTaxonomy", () => {
  it("marks user hard constraints as highest priority", () => {
    expect(getMaterialPriority("writing_constraint")).toBe(100);
    expect(getMaterialPriority("character_card")).toBeGreaterThan(getMaterialPriority("creative_document"));
    expect(MATERIAL_ASSET_CATEGORIES).toContain("character_card");
    expect(MATERIAL_ASSET_CATEGORIES).toContain("canonical_chapter");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialBibleTaxonomy.test.ts
```

Expected: FAIL because `MaterialBibleTaxonomy.ts` does not exist.

- [ ] **Step 3: Implement taxonomy**

```ts
export const MATERIAL_ASSET_CATEGORIES = [
  "source_snapshot",
  "character_card",
  "worldview",
  "core_selling_point",
  "overall_plan",
  "creative_document",
  "hook_table",
  "writing_constraint",
  "volume_plan",
  "chapter_unit_plan",
  "canonical_chapter",
  "relationship_map",
  "power_system",
  "growth_curve",
] as const;

export type MaterialAssetCategory = typeof MATERIAL_ASSET_CATEGORIES[number];

const PRIORITIES: Record<MaterialAssetCategory, number> = {
  source_snapshot: 60,
  character_card: 95,
  worldview: 90,
  core_selling_point: 100,
  overall_plan: 85,
  creative_document: 88,
  hook_table: 92,
  writing_constraint: 100,
  volume_plan: 88,
  chapter_unit_plan: 92,
  canonical_chapter: 100,
  relationship_map: 94,
  power_system: 96,
  growth_curve: 96,
};

export function getMaterialPriority(category: MaterialAssetCategory): number {
  return PRIORITIES[category];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialBibleTaxonomy.test.ts
```

Expected: PASS.

---

### Task 2: Parse Full User Document Without Dropping Sections

**Files:**
- Modify: `server/src/services/material/MaterialSectionParser.ts`
- Test: `server/src/services/material/__tests__/MaterialSectionParser.test.ts`

- [ ] **Step 1: Add parser coverage for the provided document shape**

Add tests that assert the parser recognizes:

```ts
import { parseMaterialSections } from "../MaterialSectionParser";

describe("parseMaterialSections full bible shape", () => {
  it("recognizes major bible sections and canonical chapters", () => {
    const text = [
      "男主-林凡设定",
      "人物卡：林凡（男主）",
      "姓名：林凡",
      "九、角色功能定位",
      "1. 养成系主角",
      "世界观",
      "世界观设定：《人在阳间享福，老祖阴间打工》",
      "核心卖点",
      "老祖阴间享福、后代阳间打工、双线成长",
      "整体规划",
      "## 卷章分配",
      "完整创作文档",
      "## 五、品级体系总表",
      "钩子预埋与回收全表",
      "| 1-01 | 老祖升职过程 | 第1章 | 第800章 | 整本书都在回答 |",
      "强制约束规则",
      "## 一、阴阳交互约束",
      "男配-钟少府",
      "# 人物卡：钟少府",
      "第1章 他们当时的嘲笑声好大呀",
      "林富贵晋升授印大典。",
      "第2章 上香",
      "林凡跪在老家祖坟前。",
    ].join("\n");

    const sections = parseMaterialSections(text);
    expect(sections.map(s => s.type)).toEqual(expect.arrayContaining([
      "character_card",
      "worldview",
      "core_selling_point",
      "overall_plan",
      "creative_document",
      "hook_table",
      "writing_constraints",
      "canonical_chapters",
    ]));
    expect(sections.filter(s => s.type === "character_card").length).toBe(2);
  });
});
```

- [ ] **Step 2: Run parser tests**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialSectionParser.test.ts
```

Expected: FAIL until all section markers are recognized.

- [ ] **Step 3: Update parser rules**

Update `MaterialSectionParser.ts` so it recognizes these section starts:

```ts
const CHARACTER_HEADER = /^(?:#\s*)?(?:人物卡[:：].+|男主-.+设定|女主-.+设定|男配-.+设定|女配-.+设定)$/;
const SECTION_HEADERS: Array<{ type: MaterialSectionType; pattern: RegExp }> = [
  { type: "worldview", pattern: /^世界观\s*$/ },
  { type: "core_selling_point", pattern: /^核心卖点\s*$/ },
  { type: "overall_plan", pattern: /^整体规划\s*$/ },
  { type: "creative_document", pattern: /^完整创作文档\s*$/ },
  { type: "hook_table", pattern: /^钩子预埋与回收全表\s*$/ },
  { type: "writing_constraints", pattern: /^强制约束规则\s*$/ },
  { type: "canonical_chapters", pattern: /^第\s*[一二三四五六七八九十百千万零〇\d]+\s*章\s*.*$/ },
];
```

Keep the canonical chapter guard that checks the following text looks like正文, so planning lines like `第1章：接任务` are not misread as novel chapters.

- [ ] **Step 4: Run parser tests again**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialSectionParser.test.ts
```

Expected: PASS.

---

### Task 3: Map Character Cards Into Full Structured Fields

**Files:**
- Modify: `server/src/services/material/MaterialAssetMapper.ts`
- Modify: `server/src/services/material/MaterialImportService.ts`
- Test: `server/src/services/material/__tests__/MaterialAssetMapper.test.ts`

- [ ] **Step 1: Add mapper test for deep character fields**

```ts
import { mapMaterialSections } from "../MaterialAssetMapper";
import { MaterialSection } from "../MaterialSectionParser";

describe("mapMaterialSections character bible mapping", () => {
  it("maps role function, special setting, personality detail, red lines, scenes, and raw profile", () => {
    const section: MaterialSection = {
      type: "character_card",
      title: "人物卡：林富贵（老祖）",
      startLine: 1,
      endLine: 30,
      content: [
        "人物卡：林富贵（老祖）",
        "姓名：林富贵",
        "阳间身份：林凡的八代老祖",
        "林富贵的本质是：怂但不坏，阴但不毒，装但不崩。",
        "他会做的事：",
        "- 托梦派发任务",
        "他不会做的事：",
        "- 正面硬刚",
        "成长红线：",
        "林富贵永远不会成为正面硬刚型强者。",
        "五、性格细描",
        "- 狗仗人势：林凡一完成大任务，他立马在阴间抖起来",
        "六、特殊设定：背景音乐癖（BGM癖）",
        "这是林富贵最重要的角色怪癖之一。",
        "八、角色功能定位",
        "2. 任务发布器：通过托梦给林凡派发因果任务",
        "场景一：老祖要求放BGM",
        "林凡无奈打开手机。",
      ].join("\n"),
    };

    const assets = mapMaterialSections([section]);
    expect(assets.characters[0]).toMatchObject({
      name: "林富贵",
      role: "老祖",
      identity: "林凡的八代老祖",
      personality: expect.stringContaining("怂但不坏"),
      abilities: expect.stringContaining("托梦派发任务"),
      arcDetail: expect.stringContaining("永远不会成为正面硬刚型强者"),
      comedyMechanisms: expect.arrayContaining([expect.stringContaining("背景音乐癖")]),
      signatureScenes: expect.arrayContaining([expect.stringContaining("老祖要求放BGM")]),
      rawProfile: expect.stringContaining("人物卡：林富贵"),
    });
    expect(assets.knowledgeAssets.some(a => a.title === "人物素材：林富贵")).toBe(true);
  });
});
```

- [ ] **Step 2: Run mapper test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialAssetMapper.test.ts
```

Expected: FAIL until the mapper supports the deeper fields.

- [ ] **Step 3: Extend DTO and mapper**

Extend `MaterialCharacterDto`:

```ts
export interface MaterialCharacterDto {
  name: string;
  role: string;
  identity?: string;
  motivation?: string;
  appearance?: string;
  background?: string;
  notes?: string;
  tags?: string[];
  personality: string;
  abilities?: string;
  arcSummary?: string;
  arcDetail?: string;
  speechStyle?: string;
  behaviorRules: string[];
  forbiddenBehavior: string[];
  signatureLines: string[];
  signatureScenes: string[];
  comedyMechanisms: string[];
  emotionalHooks: string[];
  rawProfile: string;
  sourceType: "user_original";
  isCanonical: true;
}
```

Add helpers:

```ts
function extractBlock(content: string, headings: string[]): string {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(line => headings.some(h => line.includes(h)));
  if (start < 0) return "";
  const result: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^[一二三四五六七八九十]+、|^##\s|^###\s|^━━━━━━━━/.test(line) && result.length > 0) break;
    if (line) result.push(line);
  }
  return result.join("\n").trim();
}

function collectListBlock(content: string, headings: string[]): string[] {
  return extractBlock(content, headings)
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*\d.、\s]+/, "").trim())
    .filter(Boolean);
}
```

In `mapCharacter`, fill these fields:

```ts
const roleFunction = extractBlock(section.content, ["角色功能定位"]);
const personalityDetail = extractBlock(section.content, ["性格细描"]);
const specialSetting = extractBlock(section.content, ["特殊设定"]);
const relationshipDynamics = extractBlock(section.content, ["关系动态", "与林凡的关系", "与林富贵的关系"]);
const redLine = extractBlock(section.content, ["成长红线", "全书红线约束"]);
const sceneExamples = extractBlock(section.content, ["关键场景示例"]);

return {
  name,
  role,
  identity: firstMatch(section.content, /(?:身份|阳间身份|阴间身份|职业)[:：]\s*([^\n]+)/),
  background: firstMatch(section.content, /(?:家庭背景|背景)[:：]\s*([^\n]+)/),
  tags: firstMatch(section.content, /标签[:：]\s*([^\n]+)/).split(/[·、,，]/).map(s => s.trim()).filter(Boolean),
  personality: firstMatch(section.content, /(?:核心定位|本质是)[:：]?\s*([^\n]+)/) || personalityDetail.slice(0, 300),
  abilities: extractBlock(section.content, ["能力", "当前属性", "养成体系", "品级"]),
  arcSummary: redLine.split(/\n/).find(Boolean) || "",
  arcDetail: redLine,
  behaviorRules: collectBulletsAfter(section.content, "会做的事"),
  forbiddenBehavior: collectBulletsAfter(section.content, "不会做的事"),
  signatureLines: collectListBlock(section.content, ["台词", "口癖"]),
  signatureScenes: sceneExamples ? [sceneExamples] : [],
  comedyMechanisms: specialSetting ? [specialSetting] : collectListBlock(section.content, ["喜剧"]),
  emotionalHooks: [roleFunction, relationshipDynamics].filter(Boolean),
  notes: [roleFunction, personalityDetail, specialSetting, relationshipDynamics].filter(Boolean).join("\n\n"),
  rawProfile: section.content,
  sourceType: "user_original",
  isCanonical: true,
};
```

- [ ] **Step 4: Persist all character fields**

Update `MaterialImportService.ts` character upsert `data`:

```ts
const data = {
  role: character.role,
  identity: character.identity,
  motivation: character.motivation,
  appearance: character.appearance,
  background: character.background,
  notes: character.notes,
  tags: json(character.tags || []),
  personality: character.personality,
  abilities: character.abilities,
  arcSummary: character.arcSummary,
  arcDetail: character.arcDetail,
  speechStyle: character.speechStyle,
  behaviorRules: json(character.behaviorRules),
  forbiddenBehavior: json(character.forbiddenBehavior),
  signatureLines: json(character.signatureLines),
  signatureScenes: json(character.signatureScenes),
  comedyMechanisms: json(character.comedyMechanisms),
  emotionalHooks: json(character.emotionalHooks),
  rawProfile: character.rawProfile,
  sourceType: character.sourceType,
  isCanonical: character.isCanonical,
};
```

- [ ] **Step 5: Add per-character KnowledgeAsset**

When mapping a character, also push:

```ts
assets.knowledgeAssets.push({
  title: `人物素材：${character.name}`,
  category: "character_card",
  content: section.content,
  tags: ["material", "character", character.name, character.role].filter(Boolean),
});
```

- [ ] **Step 6: Run mapper/import tests**

Run:

```bash
cd server
pnpm test --runTestsByPath \
  src/services/material/__tests__/MaterialAssetMapper.test.ts \
  src/services/material/__tests__/MaterialImportService.test.ts
```

Expected: PASS.

---

### Task 4: Persist World, Plan, Growth, Constraint, Hook, and Canonical Chapter Assets

**Files:**
- Modify: `server/src/services/material/MaterialAssetMapper.ts`
- Modify: `server/src/services/material/MaterialImportService.ts`
- Modify: `server/src/services/pipeline/analyzePhase.ts`
- Test: `server/src/services/material/__tests__/MaterialImportService.test.ts`

- [ ] **Step 1: Add import service test for all asset classes**

```ts
it("persists knowledge assets, hard constraints, hooks, and novel plan numbers", async () => {
  const assets = mapMaterialSections([
    { type: "core_selling_point", title: "核心卖点", content: "核心卖点\n老祖阴间享福、后代阳间打工、双线成长", startLine: 1, endLine: 2 },
    { type: "worldview", title: "世界观", content: "世界观\n阴阳两界双向内卷。", startLine: 3, endLine: 4 },
    { type: "overall_plan", title: "整体规划", content: "整体规划\n总字数：150万 - 200万字\n总章数：600 - 800章\n总卷数：6卷", startLine: 5, endLine: 8 },
    { type: "writing_constraints", title: "强制约束规则", content: "强制约束规则\n林凡不能跳级变强。", startLine: 9, endLine: 10 },
    { type: "hook_table", title: "钩子预埋与回收全表", content: "| 1-01 | 老祖升职过程 | 第1章 | 第800章 | 整本书都在回答 |", startLine: 11, endLine: 11 },
  ]);

  await importMaterialAssets(novelId, assets);

  const novel = await prisma.novel.findUniqueOrThrow({ where: { id: novelId } });
  expect(novel.coreSellingPoint).toBe("老祖阴间享福、后代阳间打工、双线成长");
  expect(novel.volumeCount).toBe(6);
  expect(novel.chaptersPerVol).toBe(134);
  await expect(prisma.knowledgeAsset.count({ where: { novelId } })).resolves.toBeGreaterThanOrEqual(2);
  await expect(prisma.memory.count({ where: { novelId, type: "constraint" } })).resolves.toBeGreaterThanOrEqual(1);
  await expect(prisma.hook.count({ where: { novelId } })).resolves.toBe(1);
});
```

- [ ] **Step 2: Run test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialImportService.test.ts
```

Expected: FAIL until mapping/persistence covers all asset classes.

- [ ] **Step 3: Map all non-character sections as KnowledgeAsset**

For every recognized section, create one source-preserving `KnowledgeAsset`:

```ts
assets.knowledgeAssets.push({
  title: `素材原文：${section.title}`,
  category: section.type,
  content: section.content,
  tags: ["material", section.type, "source_preserved"],
});
```

Do this once per section to guarantee no recognized content is lost.

- [ ] **Step 4: Map hard constraints into Memory**

For `writing_constraints`, split subsection lines containing `必须`, `不能`, `不可`, `禁止`, `每章`, `每卷`, `每单元` into individual constraint memories:

```ts
assets.constraints.push({
  title: `强制约束：${line.slice(0, 30)}`,
  content: line,
  priority: /绝对|禁止|不能|不可/.test(line) ? 10 : 8,
  scope: line.includes("每章") ? "chapter" : line.includes("每卷") ? "volume" : "global",
});
```

- [ ] **Step 5: Map plan numbers robustly**

Support both `总字数：150万 - 200万字` and `总字数规划：150-200万字`:

```ts
const wordRange = content.match(/总字数(?:规划)?[:：]\s*(\d+)\s*万?\s*[-—]\s*(\d+)\s*万字/);
const chapterRange = content.match(/总章数(?:规划)?[:：]\s*(\d+)\s*[-—]\s*(\d+)\s*章/);
const volumeCount = content.match(/总卷数(?:规划)?[:：]\s*(\d+)卷/);
```

Use max values for target planning:

```ts
if (wordRange) patch.targetWordCount = Number(wordRange[2]) * 10000;
if (volumeCount) patch.volumeCount = Number(volumeCount[1]);
if (chapterRange) patch.chaptersPerVol = Math.ceil(Number(chapterRange[2]) / (patch.volumeCount || 6));
```

- [ ] **Step 6: Run import service test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialImportService.test.ts
```

Expected: PASS.

---

### Task 5: Build Runtime Material Context Policy

**Files:**
- Modify: `server/src/services/pipeline/materialContext.ts`
- Test: `server/src/services/pipeline/__tests__/materialContext.test.ts`

- [ ] **Step 1: Write material context test**

```ts
import { buildMaterialContextText } from "../materialContext";

describe("buildMaterialContextText", () => {
  it("orders hard constraints and relevant character assets before broad reference material", () => {
    const text = buildMaterialContextText([
      { assetType: "knowledge_asset", assetId: "plan", title: "整体规划", content: "六卷规划", priority: 85 },
      { assetType: "memory", assetId: "constraint", title: "强制约束", content: "林凡不能跳级变强", priority: 100 },
      { assetType: "character", assetId: "linfan", title: "人物素材：林凡", content: "养成系主角", priority: 95 },
    ]);

    expect(text.indexOf("林凡不能跳级变强")).toBeLessThan(text.indexOf("养成系主角"));
    expect(text.indexOf("养成系主角")).toBeLessThan(text.indexOf("六卷规划"));
  });
});
```

- [ ] **Step 2: Run test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/pipeline/__tests__/materialContext.test.ts
```

Expected: FAIL until priority ordering is implemented.

- [ ] **Step 3: Extend MaterialContextItem**

```ts
export interface MaterialContextItem {
  assetType: string;
  assetId: string;
  title: string;
  content: string;
  priority: number;
}
```

- [ ] **Step 4: Sort and cap context**

```ts
export function buildMaterialContextText(items: MaterialContextItem[]): string {
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const selected = sorted.slice(0, 24);
  if (selected.length === 0) return "";
  return [
    "【作者原始素材资产】以下内容优先级高于自动生成内容，必须遵守；若与自动生成大纲冲突，以本节为准。",
    ...selected.map(item => `\n## ${item.title}\n${limitText(item.content, item.priority >= 95 ? 2200 : 1200)}`),
  ].join("\n");
}
```

- [ ] **Step 5: Load context by generation stage**

In `loadMaterialContextForNovel(novelId, pipelineJobId)`, always load:

- Novel core selling point.
- All `Memory(type="constraint")` with importance >= 8.
- Character cards for involved chapter characters when available.
- Current volume/chapter unit plan when chapter order is known.
- Hook rows whose `plannedChapter` or `resolvedChapter` is near the current generation range.
- Worldview and power system knowledge assets.

Expose overload:

```ts
export async function loadMaterialContextForNovel(
  novelId: string,
  pipelineJobId?: string,
  options?: { chapterOrder?: number; volumeIndex?: number; characterNames?: string[]; stage?: "outline" | "chapter" | "quality" },
): Promise<string>
```

- [ ] **Step 6: Run context test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/pipeline/__tests__/materialContext.test.ts
```

Expected: PASS.

---

### Task 6: Enforce Asset Compliance During Generation

**Files:**
- Create: `server/src/services/pipeline/materialConformance.ts`
- Modify: `server/src/services/pipeline/chapterOutlinesPhase.ts`
- Modify: `server/src/services/pipeline/writingPhase.ts`
- Test: `server/src/services/pipeline/__tests__/materialConformance.test.ts`

- [ ] **Step 1: Write conformance tests**

```ts
import { checkMaterialConformance } from "../materialConformance";

describe("checkMaterialConformance", () => {
  it("flags violations of hard constraints", () => {
    const issues = checkMaterialConformance({
      content: "林凡一夜之间精通道法，陆清菲主动冲进灵异核心战场。",
      constraints: [
        { title: "成长不可跳级", content: "林凡不能跳级变强。", scope: "global" },
        { title: "陆清菲不直接参战", content: "陆清菲从不直接参与灵异任务。", scope: "character" },
      ],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "error", title: "成长不可跳级" }),
      expect.objectContaining({ severity: "error", title: "陆清菲不直接参战" }),
    ]));
  });
});
```

- [ ] **Step 2: Run test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/pipeline/__tests__/materialConformance.test.ts
```

Expected: FAIL because `materialConformance.ts` does not exist.

- [ ] **Step 3: Implement deterministic conformance checks**

```ts
export interface MaterialConstraint {
  title: string;
  content: string;
  scope: string;
}

export interface MaterialConformanceIssue {
  severity: "warning" | "error";
  title: string;
  message: string;
}

export function checkMaterialConformance(input: {
  content: string;
  constraints: MaterialConstraint[];
}): MaterialConformanceIssue[] {
  const issues: MaterialConformanceIssue[] = [];
  const content = input.content;

  for (const constraint of input.constraints) {
    if (/不能跳级|不可解释的变强/.test(constraint.content) && /一夜之间|突然精通|瞬间掌握|直接突破/.test(content)) {
      issues.push({ severity: "error", title: constraint.title, message: "疑似违反成长不可跳级约束。" });
    }
    if (/陆清菲.*不直接|陆清菲从不直接参与/.test(constraint.content) && /陆清菲.*冲进|陆清菲.*抓鬼|陆清菲.*施法|陆清菲.*战斗/.test(content)) {
      issues.push({ severity: "error", title: constraint.title, message: "疑似让陆清菲直接参与灵异战斗。" });
    }
    if (/王德发.*不能知道|王德发不能知道/.test(constraint.content) && /王德发.*知道.*老祖|王德发.*知道.*灵异真相/.test(content)) {
      issues.push({ severity: "error", title: constraint.title, message: "疑似让王德发知道核心秘密。" });
    }
  }

  return issues;
}
```

- [ ] **Step 4: Save conformance issues into phase results**

After outline/chapter generation, load constraint memories and call `checkMaterialConformance`. Save issues into existing result metadata:

```ts
const constraints = await prisma.memory.findMany({
  where: { novelId, type: "constraint", importance: { gte: 8 } },
  select: { title: true, content: true, category: true },
});
const conformanceIssues = checkMaterialConformance({
  content: JSON.stringify(generatedResult),
  constraints: constraints.map(c => ({ title: c.title, content: c.content, scope: c.category })),
});
```

If any issue has `severity === "error"`, set result status to completed but include issues in `selfComment` or output field so the UI can show the violation instead of silently accepting it.

- [ ] **Step 5: Run conformance tests**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/pipeline/__tests__/materialConformance.test.ts
```

Expected: PASS.

---

### Task 7: Import Script and Coverage Report Must Prove Full Persistence

**Files:**
- Modify: `server/scripts/import-material-file.ts`
- Modify: `server/src/services/material/MaterialCoverageReport.ts`
- Modify: `server/src/routes/pipeline.ts`
- Test: `server/src/services/material/__tests__/MaterialCoverageReport.test.ts`

- [ ] **Step 1: Add report test**

```ts
import { buildMaterialCoverageReport } from "../MaterialCoverageReport";

it("reports imported, raw-preserved, and missing assets", () => {
  const report = buildMaterialCoverageReport(
    [
      { type: "character_card", title: "人物卡：林凡", content: "人物卡：林凡", startLine: 1, endLine: 10 },
      { type: "worldview", title: "世界观", content: "世界观", startLine: 11, endLine: 20 },
      { type: "canonical_chapters", title: "第1章", content: "第1章\n正文", startLine: 21, endLine: 40 },
    ],
    {
      novelPatch: { coreSellingPoint: "老祖阴间享福、后代阳间打工、双线成长" },
      characters: [{ name: "林凡" } as any],
      hooks: [],
      constraints: [],
      knowledgeAssets: [{ title: "人物素材：林凡", category: "character_card", content: "人物卡：林凡", tags: [] }],
    },
  );

  expect(report.importedCounts.characters).toBe(1);
  expect(report.recognizedSections.some(s => s.type === "canonical_chapters")).toBe(true);
  expect(report.rawPreservedTitles).toContain("人物素材：林凡");
});
```

- [ ] **Step 2: Run report test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialCoverageReport.test.ts
```

Expected: FAIL until report includes `rawPreservedTitles`.

- [ ] **Step 3: Extend coverage report**

```ts
export interface MaterialCoverageReport {
  recognizedSections: Array<{ type: string; title: string; startLine: number; endLine: number }>;
  importedCounts: Record<string, number>;
  rawPreservedTitles: string[];
  warnings: string[];
}
```

Add:

```ts
rawPreservedTitles: assets.knowledgeAssets.map(asset => asset.title),
```

- [ ] **Step 4: Update CLI output**

`server/scripts/import-material-file.ts` should print:

```ts
console.log(JSON.stringify({
  source: absolutePath,
  report,
  canonicalChapters: {
    detected: canonicalResult.chapters.length,
    imported: canonicalResult.imported,
    skipped: canonicalResult.skipped,
  },
}, null, 2));
```

- [ ] **Step 5: Run report test**

Run:

```bash
cd server
pnpm test --runTestsByPath src/services/material/__tests__/MaterialCoverageReport.test.ts
```

Expected: PASS.

---

## Execution Order

1. Taxonomy first, so all later code uses stable category names.
2. Parser second, so no source content is lost.
3. Deep character mapping third, because character cards are the largest and most important assets.
4. World/plan/hook/constraint persistence fourth.
5. Runtime context policy fifth, so generation can use imported assets.
6. Conformance checks sixth, so generation cannot silently violate assets.
7. Coverage report and CLI last, so import results are inspectable.

## Verification Commands

Run targeted tests after each task. Final verification:

```bash
cd server
pnpm test --runTestsByPath \
  src/services/material/__tests__/MaterialBibleTaxonomy.test.ts \
  src/services/material/__tests__/MaterialSectionParser.test.ts \
  src/services/material/__tests__/MaterialAssetMapper.test.ts \
  src/services/material/__tests__/MaterialImportService.test.ts \
  src/services/material/__tests__/MaterialCoverageReport.test.ts \
  src/services/pipeline/__tests__/materialContext.test.ts \
  src/services/pipeline/__tests__/materialConformance.test.ts
pnpm typecheck
```

Manual import smoke test:

```bash
cd /Users/lingoace/IdeaProjects/dream-writer
pnpm --filter @dream-writer/server import:material <novelId> "/Users/lingoace/Downloads/人在阳间打工，老祖阴间享福.txt"
```

Expected import report:

- Recognized sections include character cards, worldview, core selling point, overall plan, creative document, hook table, writing constraints, canonical chapters.
- Imported character count includes 林凡、林富贵、陆清菲、王德发、萧慕晴、钟少府.
- Raw preserved titles include every major section and every full character card.
- Canonical chapters detect and import chapters 1-4 only.
- Warnings list only genuinely missing optional assets.

## Self-Review

- Spec coverage: The plan covers full preservation, structured persistence, hard constraints, canonical chapters, context usage, and conformance checks.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: `MaterialCharacterDto`, `MaterialContextItem`, and `MaterialCoverageReport` are defined before later tasks use them.
