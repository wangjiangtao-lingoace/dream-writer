# Dream Writer v3.0 创作流水线全面优化方案

## 变更原因

用户评审 v2.5 后提供完整优化文档，指出 6 个根因：用户原文不可降级、资产拆解丢细节、v2.5 字段未落库、P0 Prompt 不够强、Beat 抽象化、质量检测放水。

经代码探索确认断链，经用户评审修订 4 处关键问题后定稿。

---

## 一、当前核心断链

| 断链 | 文件 | 影响 |
|------|------|------|
| Character 缺 personality/behaviorRules/signatureLines | schema.prisma | 人物从"怂但嘴硬"变成"说话慢条斯理" |
| persistGeneratedAssets 丢 character 字段 | pipelineUtils.ts:369 | personality 被塞进 arcSummary，字段丢失 |
| persistVolumeChapterData 丢 v2.5 字段 | chapterOutlinesPhase.ts:198 | chapterType/readerPromise 等 7 个字段不落库 |
| buildLayer6ChapterTask 只用 5/20 字段 | layer6-chapter-task.ts | P0 缺场景/视角/冲突/爽点/承诺 |
| loadInvolvedCharacters 没加载 notes/personality | contextAssembler.ts:50 | layer4 的 canDo/cannotDo 永远为空 |
| Beat 模板缺场景动作 | writingPhase.ts:18 | AI 写"任务完成"而非具体演出 |
| qualityCheck 无叙事检测 | qualityCheck.ts | 垃圾章节也能通过 |
| Chapter 无 sourceType | schema.prisma | 无法保护用户原文 |
| 两个 persist 函数互补但不完整 | pipelineUtils.ts + chapterOutlinesPhase.ts | ChapterOutline 字段只落一半 |

---

## 二、第一阶段：止血修复（9 项）

### 2.1 schema.prisma — Chapter 原文保护字段

```prisma
model Chapter {
  // 新增字段
  sourceType      String?   // user_original / ai_generated / ai_rewritten / imported
  isCanonical     Boolean   @default(false)
  canRewrite      Boolean   @default(true)
  originalContent String?
  sourceHash      String?
}
```

### 2.2 schema.prisma — Character 扩展字段

```prisma
model Character {
  // 新增字段
  personality       String?
  abilities         String?
  behaviorRules     String?   // JSON
  forbiddenBehavior String?   // JSON
  signatureLines    String?   // JSON
  signatureScenes   String?   // JSON
  comedyMechanisms  String?   // JSON
  emotionalHooks    String?   // JSON
  rawProfile        String?
  sourceType        String?
  isCanonical       Boolean   @default(false)
}
```

**同步更新**：CharacterInfo interface、ContextAssembler select、layer4-characters.ts 入参类型、generateCharacters JSON schema

### 2.3 schema.prisma — ChapterBeat 扩展字段

```prisma
model ChapterBeat {
  // 新增字段
  visibleAction   String   @default("") // 角色具体做什么
  opposition      String   @default("") // 阻碍是什么
  turningMoment   String   @default("") // 转折点
  resultState     String   @default("") // 结束后状态变化
  emotionTarget   String   @default("") // 读者应产生什么情绪
}
```

**同步更新**：generateBeatTemplate 返回对象、generateChapterBeats LLM parser、ContextAssembler 加载 beats、P0 Prompt beats 格式

### 2.4 canonical chapter import — 用户原文章节导入

```typescript
// 1. 检测用户输入中的完整章节（按"第X章"/标题切分）
// 2. 直接写入 chapter 表
await prisma.chapter.create({
  data: {
    novelId, sortOrder, title, content: originalText,
    sourceType: "user_original",
    isCanonical: true,
    canRewrite: false,
    originalContent: originalText,
    sourceHash: md5(originalText),
    status: "completed",
    wordCount: countWords(originalText),
  }
});
// 3. 从原文反向提取 summary/style/outline
// 4. WritingPhase 从 lastCanonicalChapter + 1 开始
// 5. 第4章 Prompt 注入"前三章为用户原文，不可改写，只能承接"
```

### 2.4b canonical chapters 后处理

用户原文导入后，必须像 AI 生成章节一样执行后处理，否则第 4 章缺少承接上下文：

```typescript
// canonical chapters 导入后立即执行
for (const chapter of canonicalChapters) {
  // 1. 生成章节概要（ChapterSummary）
  await generateQuickSummary(chapter);
  // 2. 更新 StoryState（主角状态、情绪、任务进度）
  await updateStoryState(chapter);
  // 3. 提取角色口吻（CharacterVoice）
  await extractCharacterVoice(chapter);
  // 4. 提取钩子和伏笔
  await extractHooksAndForeshadows(chapter);
}

// WritingPhase 读取时：
// - loadPreviousChapterEnding(4) → 第3章结尾"窗外，天快亮了。"
// - storyState → 当前角色状态/情绪/任务进度
// - ChapterSummary(1-3) → 前三章概要
```

关键：第 4 章需要从第 3 章的 endingState 继续，而不是重新开局。
```

### 2.5 persistGeneratedAssets 补全字段

**文件**：`server/src/services/pipeline/pipelineUtils.ts`

character 分支 (line 369) 补全：
```typescript
create: {
  // 现有字段保留
  personality: character.personality,
  speechStyle: character.speechStyle,
  arcDetail: character.arcDetail || "",
  abilities: character.abilities || "",
  behaviorRules: JSON.stringify(character.behaviorRules || []),
  forbiddenBehavior: JSON.stringify(character.forbiddenBehavior || []),
  signatureLines: JSON.stringify(character.signatureLines || []),
  signatureScenes: JSON.stringify(character.signatureScenes || []),
  comedyMechanisms: JSON.stringify(character.comedyMechanisms || []),
  emotionalHooks: JSON.stringify(character.emotionalHooks || []),
  rawProfile: character.rawProfile || "",
  sourceType: character.sourceType || "ai_generated",
  isCanonical: character.isCanonical || false,
}
```

outline 分支 (line 275)：复用 Novel 已有字段，不新增
```typescript
await prisma.novel.update({
  where: { id: novelId },
  data: {
    genre: outline.genre,
    outline: formattedOutline,
    coreSellingPoint: outline.coreSellingPoint || "",
    corePayoffs: JSON.stringify(outline.corePayoffs || []),
    coreConflict: outline.coreConflict || "",
    readerExpectations: JSON.stringify(outline.readerExpectations || []),
  }
});
```

### 2.6 persistVolumeChapterData 补全 v2.5 字段

**文件**：`server/src/services/pipeline/chapterOutlinesPhase.ts`

ChapterOutline upsert (line 198) 补全：
```typescript
create: {
  // 现有字段保留
  chapterType: chapter.chapterType || "mission",
  readerPromise: chapter.readerPromise || "",
  chapterFunction: chapter.chapterFunction || "",
  requiredReaderEmotion: JSON.stringify(chapter.requiredReaderEmotion || []),
  payoffChainRefs: JSON.stringify(chapter.payoffChainRefs || []),
  comedyMechanism: chapter.comedyMechanism || "",
  endingQuestion: chapter.endingQuestion || "",
}
```

### 2.7 ContextAssembler 补全加载字段

**文件**：`server/src/services/pipeline/contextAssembler.ts`

loadInvolvedCharacters (line 50) select 增加：
```typescript
select: {
  name: true, role: true, identity: true, motivation: true,
  arcSummary: true, speechStyle: true,
  // 新增
  personality: true, appearance: true, background: true,
  notes: true, powerLevel: true, behaviorRules: true,
  forbiddenBehavior: true, signatureLines: true,
  comedyMechanisms: true, emotionalHooks: true,
}
```

loadWorldviewSummary (line 63)：按 chapterType 注入相关规则
```typescript
// 新增方法（使用 safeParseRules，不要 JSON.parse）
private getRelevantWorldRules(chapterType: string, worldview: any): string {
  const rules = safeParseRules(worldview.rules);
  switch (chapterType) {
    case "task_trigger":
    case "mission":
      return ["任务触发规则", "阴阳交互限制", "老祖不能直接出手", "奖励结算规则", ...rules].join("；");
    case "payoff":
      return ["晋升规则", "阴德收益规则", "旁观者反应规则", ...rules].join("；");
    case "relationship":
      return ["现实生活背景", "人物关系状态", "灵异秘密暴露边界", ...rules].join("；");
    default:
      return rules.slice(0, 5).join("；");
  }
}
```

### 2.8 buildLayer6ChapterTask 升级为章节导演

**文件**：`server/src/services/pipeline/prompts/layer6-chapter-task.ts`

```typescript
import { formatJsonArray, formatPleasurePoint, formatMaybeJson } from "./promptFormatters";

interface ChapterOutlineInfo {
  title?: string;
  goal?: string;
  conflict?: string;
  emotion?: string;
  hook?: string;
  mustDo?: string;
  mustNotDo?: string;
  // v3.0 新增
  chapterType?: string;
  scene?: string;
  pov?: string;
  pleasurePoint?: string;
  readerPromise?: string;
  chapterFunction?: string;
  requiredReaderEmotion?: string;
  comedyMechanism?: string;
  endingQuestion?: string;
  targetWordCount?: number;
}

export function buildLayer6ChapterTask(outline?: ChapterOutlineInfo | null): string {
  if (!outline) {
    return `【★★★ P0 最高优先级 — 章节任务 ★★★】
本章没有章纲数据。请严格承接上一章结尾，保持人物口吻、世界规则和当前剧情状态，不得跳跃。`;
  }

  const chapterType = outline.chapterType || "mission";
  const targetWordCount = outline.targetWordCount || 2500;
  const mustDo = formatJsonArray(outline.mustDo);
  const mustNotDo = formatJsonArray(outline.mustNotDo);
  const pleasurePoint = formatPleasurePoint(outline.pleasurePoint);
  const readerEmotion = formatJsonArray(outline.requiredReaderEmotion) || outline.emotion || "";

  return `【★★★ P0 最高优先级 — 章节导演 ★★★】
【章节类型】${chapterType}
【本章唯一核心任务】${outline.goal || ""}
【场景与视角】场景：${outline.scene || ""} / 视角：${outline.pov || ""}
【核心冲突】${outline.conflict || ""}
【读者承诺】本章必须让读者看到：${outline.readerPromise || ""}
【章节功能】本章负责：${outline.chapterFunction || ""}
【主爽点】${pleasurePoint}
【喜剧机制】${outline.comedyMechanism || ""}
【目标情绪】${readerEmotion}
${mustDo ? `【必须完成】\n${mustDo}` : ""}
${mustNotDo ? `【禁止事项】\n${mustNotDo}` : ""}
【章末悬念问题】${outline.endingQuestion || outline.hook || ""}
【硬性要求】
1. 不得用旁白总结代替具体场景
2. 不得跳过冲突过程直接给结果
3. 不得把爽点写成一句说明
4. 主爽点必须有具体动作、旁观者反应、角色心理变化
5. 本章结尾必须留下明确的新问题或期待
【字数硬性要求】目标：${targetWordCount}字，最低：${Math.floor(targetWordCount * 0.9)}字`;
}
```

### 2.9 writingPhase 跳过 canonical + 使用单章 targetWordCount

**文件**：`server/src/services/pipeline/writingPhase.ts`

跳过逻辑 (line 345)：
```typescript
if (existing?.sourceType === "user_original" ||
    existing?.isCanonical === true ||
    existing?.canRewrite === false) {
  console.log(`第${chapterOrder}章为用户原文章节，跳过 AI 生成`);
  continue;
}
```

targetWordCount (line 397)：
```typescript
const targetWordCount =
  chapterOutlineForBeat?.targetWordCount ||
  card?.targetWordCount ||
  config.chapterWordMax ||
  config.chapterWordMin ||
  2500;
```

---

## 三、第二阶段：质量提升（4 项）

### 3.1 generateStyle 补 fixedTaste / chapterRhythm

**文件**：`server/src/services/pipeline/generators.ts` (line 316-417)

Prompt 约束：fixedTaste 每项必须"角色+行为+读者情绪"，禁止通用词。

```json
{
  "styleDna": {
    "fixedTaste": {
      "readerComeFor": ["看老祖明明怂却在任务结束后疯狂邀功", "..."],
      "comedySource": ["老祖古风做派和现代职场黑话混用", "..."],
      "coreContradiction": ["阳间人替阴间老祖打工", "..."],
      "signatureScenes": ["老祖升职大典配BGM", "..."]
    },
    "chapterRhythm": {
      "payoffEveryN": 5,
      "comedyEveryN": 3,
      "upgradeEveryN": 10
    }
  }
}
```

### 3.2 Beat 场景动作模型

ChapterBeat schema（已在 2.3 完成）。writingPhase.ts + generators.ts 同步更新。

Beat 注入 Prompt 格式：
```
Beat {index} [{type}] {wordTarget}字
目标：{goal}
具体动作：{visibleAction}
阻碍：{opposition}
转折点：{turningMoment}
结果状态：{resultState}
读者情绪：{emotionTarget}
必须包含：{mustInclude}
必须避免：{mustAvoid}
```

### 3.3 关键章强制 LLM Beat（修正判定）

```typescript
function isKeyChapter(outline: ChapterOutline) {
  const pleasure = parsePleasurePoint(outline.pleasurePoint);
  const emotionData = parseEmotionData(outline.emotionData);
  return (
    outline.sortOrder <= 3 ||
    ["payoff", "danger_escalation", "info_reveal"].includes(outline.chapterType || "") ||
    emotionData?.isClimax === true ||
    emotionData?.isTurningPoint === true ||
    Number(pleasure?.intensity || 0) >= 7 ||
    Boolean(outline.comedyMechanism && outline.chapterType === "comedy_daily")
  );
}
```

### 3.4 NarrativeQualityCheck — 条件启用

```typescript
// 程序检测先跑
const basicQuality = await validateChapterQuality(content, targetWordCount, previousEnding, novel);
// LLM 检测条件
const shouldRunNarrativeLLM =
  isKeyChapter(outline) ||
  basicQuality.scores.wordCount < 8 ||
  basicQuality.issues.length > 0 ||
  retryCount > 0;

if (shouldRunNarrativeLLM) {
  const narrative = await validateNarrativeQuality(content, outline);
  // 检测维度：sceneConcrete/readerPromiseFulfilled/payoffVisible/comedyEffective/characterVoice/emotionCurve/stateChanged/summaryInsteadOfScene
}
```

---

## 四、第三阶段：长篇稳定（暂不实施）

- 新增 EmotionAsset 表
- 新增 TaskLibrary / EventLibrary
- 新增 ReaderPromiseTracker
- 新增 BadOutputDiagnosis
- 新增 RepetitionDetector

---

## 五、实施顺序

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | schema: Chapter + Character + ChapterBeat 字段 | schema.prisma |
| 2 | 新增 promptFormatters.ts 统一格式化工具 | 新文件 |
| 3 | canonical import: 用户原文导入 + 后处理 | analyzePhase.ts 或新文件 |
| 4 | persistGeneratedAssets 补全 | pipelineUtils.ts |
| 5 | persistVolumeChapterData 补全 | chapterOutlinesPhase.ts |
| 6 | ContextAssembler 补全加载 + getRelevantWorldRules | contextAssembler.ts |
| 7 | buildLayer6ChapterTask 章节导演 | layer6-chapter-task.ts |
| 8 | writingPhase 跳过 canonical + targetWordCount | writingPhase.ts |
| 9 | generateStyle fixedTaste/chapterRhythm | generators.ts |
| 10 | Beat 场景动作模型 | writingPhase.ts + generators.ts |
| 11 | isKeyChapter 修正 | writingPhase.ts |
| 12 | NarrativeQualityCheck 条件启用 | qualityCheck.ts |
| 13 | prisma push + typecheck + 验收 | — |

---

## 六、验收标准

| # | 验收项 | 判定方式 |
|---|--------|----------|
| 1 | chapter 表第1-3章 sourceType=user_original | DB 查询 |
| 2 | chapter 表第1-3章 canRewrite=false | DB 查询 |
| 3 | chapter 表第1-3章 content 与用户原文一致 | hash 对比 |
| 4 | writingPhase 日志显示 skip chapter 1/2/3 | 日志 |
| 5 | 第4章 Prompt 包含"前三章为用户原文" | Prompt 检查 |
| 6 | Character 的 personality/behaviorRules 落库 | DB 查询 |
| 7 | ChapterOutline v2.5 字段全部落库 | DB 查询 |
| 8 | P0 Prompt 包含章节导演信息 | Prompt 检查 |
| 9 | Beat 蓝图包含 visibleAction/opposition | DB 查询 |
| 10 | NarrativeQualityCheck 仅对关键章/风险章启用 | 日志 |
| 11 | pnpm typecheck:server 通过 | 构建 |
| 12 | pnpm prisma:push 成功 | 构建 |

---

## 七、风险说明

- schema.prisma 新增 18 个字段，需 prisma push 同步数据库
- canonical import 需要章节切分逻辑，边界情况多（无标题、连续正文等）
- NarrativeQualityCheck 使用 LLM，会增加 API 调用成本
- ContextAssembler 加载更多字段会增加 prompt 长度，需控制 token 预算
- Beat 场景动作模型需 LLM 生成，模板 fallback 需适配新字段

---

## 八、实施微调（5 项）

### 8.1 统一 Prompt 格式化工具

以下字段都可能是 JSON 字符串，进入 Prompt 前必须格式化：
`mustDo`、`mustNotDo`、`requiredReaderEmotion`、`payoffChainRefs`、`signatureLines`、`signatureScenes`、`comedyMechanisms`、`emotionalHooks`、`behaviorRules`、`forbiddenBehavior`、`corePayoffs`、`readerExpectations`

**新增文件**：`server/src/services/pipeline/promptFormatters.ts`

```typescript
// 安全 JSON 解析
export function safeParseJson<T>(value: unknown, fallback: T): T { ... }

// JSON 数组 → "紧张、期待"
export function formatJsonArray(value: unknown): string { ... }

// pleasurePoint 对象/字符串 → 人类可读文本
export function formatPleasurePoint(value: unknown): string { ... }

// JSON 对象 → 人类可读文本
export function formatJsonObject(value: unknown): string { ... }

// 通用：可能是 JSON 也可能是纯文本，统一输出可读文本
export function formatMaybeJson(value: unknown): string { ... }
```

ContextAssembler、Layer4、Layer6、Beat Prompt 全部复用此文件，不各自实现。

### 8.2 worldview.rules 安全解析

worldview.rules 可能是普通文本（如"因果任务系统+绑定命运机制"），不能直接 JSON.parse：

```typescript
function safeParseRules(rules: string | null | undefined): string[] {
  if (!rules) return [];
  try {
    const parsed = JSON.parse(rules);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string") return [parsed];
    return [JSON.stringify(parsed)];
  } catch {
    return rules.split(/[；;。\n]/).map(s => s.trim()).filter(Boolean);
  }
}
```

### 8.3 canonical import 章节切分增强

支持多种网文章节格式，带 fallback：

```typescript
const chapterRegex =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(第\s*[一二三四五六七八九十百千万\d零〇]+\s*章[^\n]*|Chapter\s+\d+[^\n]*|\d+[\.、]\s*[^\n]{2,40})/g;

// fallback: 检测不到章节标题但文本超过一定长度，作为单章保存，不丢弃
```

### 8.4 Chapter 表字段确认

Chapter 已有 `status`（默认"planned"）和 `wordCount`（默认 0），canonical import 可直接使用。文档示例代码无需动态判断。

### 8.5 Novel 表字段确认

Novel 表已有 `coreSellingPoint`、`corePayoffs`、`coreConflict`、`readerExpectations` 字段（schema.prisma line 28-31），persistGeneratedAssets 的 outline 分支可直接写入。

---

## 九、实施注意事项

1. **所有 JSON 字符串字段进入 Prompt 前必须格式化成人类可读文本**，使用 `formatJsonArray`、`formatPleasurePoint` 等工具函数。
2. **所有 JSON.parse 必须使用 safeParse**，避免普通文本字段导致运行时报错。
3. **canonical import 必须先于 Writing Phase 执行**，否则用户原文仍可能被重写。
4. **新增字段后必须同步更新**：Prisma 类型、TypeScript interface、upsert create/update、ContextAssembler select、Prompt builder。
5. **NarrativeQualityCheck 首期只对关键章/风险章启用**，避免成本失控。
6. **第一次上线验证**：先用《人在阳间打工》验证第1-3章是否被完整保护，再验证第4章续写质量。
