# 网文创作能力升级 — 第一批改造

## 变更原因
用户反馈：系统"太会规划"但"不够会写网文"。工程架构 8.5/10，网文创作能力只有 6.5/10。核心问题是风格约束太抽象、缺少爽点链规划、章纲到正文跨度太大、上下文没有优先级。

## 修改点

### 1. Style DNA（风格 DNA）
将风格从"抽象描述"转为"可执行约束"。
- StyleProfile 新增 `styleDna` JSON 字段
- generateStyle() 输出增加 styleDna 结构（readerEmotion、payoffMechanisms、rhythmRules、languageRules、forbiddenPatterns、requiredPatterns）
- styleAnalysisPhase 从用户原文中提取 styleDna
- layer2-style.ts 优先使用 styleDna 的可执行约束，回退到传统抽象风格
- pipelineUtils persistGeneratedAssets 保存 styleDna

### 2. 上下文优先级重组
将 7 层平铺架构重组为 P0-P3 优先级架构。
- P0（最高优先级）：章节任务 + 核心卖点 → 模型必须完成
- P1（角色驱动）：角色约束 + 关系状态 → 人物行为驱动剧情
- P2（剧情状态）：世界观 + 读者期待 → 连续性保障
- P3（世界背景）：风格 DNA → 背景支撑
- 优先级标记注入 system prompt，确保模型优先关注最重要的内容

### 3. Beat 级写作蓝图
在章纲和正文之间增加 Beat 层。
- 新增 ChapterBeat Prisma 模型
- 新增 generateChapterBeats() 函数，将章纲拆解为节奏单元列表
- 写作前自动生成 Beat 蓝图，注入写作 prompt
- Beat 类型：hook/conflict/dialogue/payoff/twist/transition/reveal/emotional/hook_end
- 每个 Beat 有明确的功能和目标字数

### 4. 爽点链引擎
新增跨章节的爽点节奏链规划。
- 新增 PayoffChain Prisma 模型（name、description、stages JSON）
- 新增 payoffChainPhase.ts，在卷纲生成后、章纲生成前运行
- generatePayoffChains() 基于大纲和卷纲生成 2-3 条爽点链
- 写作阶段自动加载当前章节应推进的爽点链阶段，注入 prompt
- 确保每章必须推进至少一条爽点链

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| server/prisma/schema.prisma | 新增 styleDna 字段、PayoffChain 模型、ChapterBeat 模型 |
| server/src/services/pipeline/generators.ts | generateStyle() 增加 styleDna 输出；新增 generateChapterBeats()、generatePayoffChains() |
| server/src/services/pipeline/styleAnalysisPhase.ts | 增加 styleDna 提取和保存 |
| server/src/services/pipeline/prompts/layer2-style.ts | 重写，优先使用 styleDna 可执行约束 |
| server/src/services/pipeline/prompts/index.ts | 重组为 P0-P3 优先级架构 |
| server/src/services/pipeline/contextAssembler.ts | 加载 styleDna |
| server/src/services/pipeline/pipelineUtils.ts | persistGeneratedAssets 保存 styleDna |
| server/src/services/pipeline/planningPhase.ts | 调用爽点链生成阶段 |
| server/src/services/pipeline/payoffChainPhase.ts | 新文件，爽点链生成阶段 |
| server/src/services/pipeline/writingPhase.ts | 注入 Beat 蓝图和爽点链推进要求 |

## 风险说明
- 新增 2 个 DB 模型（PayoffChain、ChapterBeat），需执行 prisma push
- 写作阶段每章增加 1 次 Beat 生成 LLM 调用，会增加 token 消耗
- 爽点链在卷纲生成后运行，依赖卷纲数据的可用性

## 验证情况
- [x] pnpm typecheck:server 通过
- [x] prisma generate 成功
- [ ] 需执行 prisma push 同步数据库
- [ ] 需跑流水线验证完整流程
