# Prompt 架构升级 - 7 层动态组装架构

## 变更原因

现有 Prompt 体系存在核心问题：
- **规则堆砌**：16 条"禁止"规则，AI 知道不能怎么写，却不知道应该写成什么样
- **目标缺失**：缺少核心卖点、读者期待、章节任务等目标驱动信息
- **结构分散**：45 个 Prompt 定义散落在 9 个文件中，无统一管理

用户提出 **7 层 Prompt 架构**，从"禁令驱动"改为"目标驱动"。

## 修改点

### 1. 新建 7 层 Prompt 模板系统

创建 `server/src/services/pipeline/prompts/` 目录，包含 8 个文件：

- `index.ts` - Prompt 模板系统入口，定义 PromptLayers 接口和 assembleSystemPrompt 函数
- `layer1-engine.ts` - 基础写作引擎（固定），所有小说共用
- `layer2-style.ts` - 作品风格模板（动态），从 Novel + StyleProfile 生成
- `layer3-selling-points.ts` - 本书核心约束（动态），核心卖点/爽点/矛盾
- `layer4-characters.ts` - 角色约束（动态），行为规则而非传记
- `layer5-worldview.ts` - 世界观约束（动态），规则限制
- `layer6-chapter-task.ts` - 章节任务（动态），必须完成/禁止完成
- `layer7-reader-expect.ts` - 读者期待约束（动态），读者为什么追这本书

### 2. 扩展数据库 Schema

在 `Novel` 表新增字段：
- `coreSellingPoint` TEXT - 核心卖点
- `corePayoffs` TEXT (JSON array) - 核心爽点列表
- `coreConflict` TEXT - 核心矛盾
- `readerExpectations` TEXT (JSON array) - 读者期待列表

在 `ChapterOutline` 表新增字段：
- `mustDo` TEXT (JSON array) - 必须完成的事项
- `mustNotDo` TEXT (JSON array) - 禁止完成的事项

### 3. 改造 ContextAssembler

重构 `contextAssembler.ts`，使用新的 7 层 Prompt 架构：
- `assembleForChapter()` 方法现在调用 `buildFullSystemPrompt()` 组装 7 层 Prompt
- `loadNovelMeta()` 方法新增加载 coreSellingPoint/corePayoffs/coreConflict/readerExpectations 字段

### 4. 改造 WritingPhase

修改 `generateChapterDraft()` 函数：
- 使用 `compactContext`（7 层 Prompt）作为 System Prompt
- User Prompt 只包含章节内容要求
- 移除对 `WRITING_SYSTEM_PROMPT` 的依赖

### 5. 增强章纲生成

修改 `generateEnrichedChapterOutlines()` 的 Prompt：
- 新增 `mustDo` 和 `mustNotDo` 字段要求
- 更新 `persistVolumeChapterData()` 保存新字段到数据库

### 6. 改造前端表单

在 `NovelForm.tsx` 新增：
- 核心卖点输入框
- 核心爽点标签输入（回车添加）
- 核心矛盾输入框
- 读者期待标签输入（回车添加）

提交时调用 `PUT /api/novels/:id` 保存新增字段。

### 7. 后端 API 支持

- 更新 `novelUpdateSchema` 支持新增字段
- 更新 `UpdateNovelInput` 接口

## 文件列表

### 新建文件
- `server/src/services/pipeline/prompts/index.ts`
- `server/src/services/pipeline/prompts/layer1-engine.ts`
- `server/src/services/pipeline/prompts/layer2-style.ts`
- `server/src/services/pipeline/prompts/layer3-selling-points.ts`
- `server/src/services/pipeline/prompts/layer4-characters.ts`
- `server/src/services/pipeline/prompts/layer5-worldview.ts`
- `server/src/services/pipeline/prompts/layer6-chapter-task.ts`
- `server/src/services/pipeline/prompts/layer7-reader-expect.ts`

### 修改文件
- `server/prisma/schema.prisma` - Novel 和 ChapterOutline 新增字段
- `server/src/services/pipeline/contextAssembler.ts` - 使用 7 层 Prompt 架构
- `server/src/services/pipeline/writingPhase.ts` - 使用新 Prompt
- `server/src/services/pipeline/generators.ts` - 增强章纲生成
- `server/src/services/pipeline/chapterOutlinesPhase.ts` - 保存 mustDo/mustNotDo
- `server/src/routes/novels.ts` - 更新 novelUpdateSchema
- `server/src/services/NovelService.ts` - 更新 UpdateNovelInput 接口
- `client/src/pages/NovelForm.tsx` - 新增输入项

## 风险说明

1. **向后兼容**：所有新增字段都是可选的，不影响现有流水线
2. **数据库迁移**：使用 ALTER TABLE 直接添加字段，现有数据无需迁移
3. **Prompt 长度**：7 层 Prompt 总 token 控制在 2000 以内，不会超出上下文限制

## 验证情况

1. ✅ TypeScript 类型检查通过（server + client）
2. ✅ Prisma Client 生成成功
3. ✅ 数据库字段添加成功
4. ⏳ 需要重启 dev server 测试完整流程

## 预期效果

**改造前：**
```
System: 你是一位顶级中文网络小说作家...
1. 禁止使用任何 AI 味词汇
2. 禁止用「他心想」开头
...（16 条禁令）
```

**改造后：**
```
System: 你是一位职业中文网络小说作者...
核心原则：剧情优先于文笔、冲突优先于描写...

【作品定位】
作品名称：人在阳间享福，老祖阴间打工
类型：都市脑洞

【本书核心卖点】
核心卖点：老祖阴间打工，后代阳间享福
核心爽点：祖宗奋斗、后代躺赢
读者期待：看老祖爆金币、看主角捡好处

【角色约束】
陈默：懒、现实、怕麻烦，绝不会主动英雄救美

【本章任务】
必须完成：老祖获得新岗位、主角获得意外收益
禁止完成：老祖升职、主角暴富
章末钩子：老祖发现考核名单上出现了自己的名字
```

AI 始终知道：**这本书最大的爽点是什么、读者为什么追更、这一章必须完成什么任务**。
