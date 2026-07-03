# AI 写作技能融入变更日志

## 变更原因
基于 GitHub AI 写作技能调研（write-good、proselint、textstat、stylometric-transfer 等项目），将 8 项核心 AI 写作技能融入系统，提升长篇小说生成的风格一致性、节奏控制、因果逻辑和文本质量。

## 实施的 AI 技能

### 1. 散文风格检查增强
- 新增弱化词表（19 词）、冗余模式（9 正则）、陈词滥调表（34 词）
- 新增 `detectWeakeningWords`、`detectRedundantPatterns`、`detectClichePhrases`、`scoreProseStyle` 函数
- 集成到 qualityCheck.ts，散文风格分 < 5 触发重试

### 2. 多阶段温度分化
- generateVolumeOutline: 0.7 → 0.65
- generateChapterBeats: 0.7 → 0.5
- generateEditorPolish: 0.4（新增）
- 温度梯度：大纲 0.7 > 章纲 0.7 > 正文 0.78 > 编辑 0.4 > 检测 0.3

### 3. 编辑 Agent 润色阶段
- 新增 `generateEditorPolish` 函数（temperature=0.4）
- 在写作阶段质量检测前自动调用
- 环境变量 `ENABLE_EDITOR_POLISH=false` 可关闭

### 4. 节奏规则引擎
- 新建 `pacingEngine.ts`，7 条节奏检测规则
- 无爽点检测、爽点密集检测、强度持续高/低、压抑无释放、类型单调、节奏断裂
- 集成到 postProcessing.ts，非阻塞执行

### 5. 章节快照机制
- 新增 ChapterSnapshot Prisma 模型（15 维快照）
- 新建 `snapshotService.ts`：captureSnapshot、getRecentSnapshots、buildSnapshotContext
- 后处理完成后自动写入快照，下章生成时注入上下文

### 6. 可读性评分维度
- 新增 `scoreReadability` 函数（7 维评分）
- 平均句长、段落长度、短/长句比例、词汇丰富度、对话/描写比例
- 集成到 qualityCheck.ts，权重 10%

### 7. 因果链管理
- 新增 CausalLink Prisma 模型
- 新建 `causalChainService.ts`：captureCausalLinks、buildCausalChainContext、checkCausalChainIntegrity
- 后处理中自动提取因果关系，续写时注入上下文

### 8. 风格指纹一致性
- 新建 `styleFingerprint.ts`：extractStyleFingerprint、fingerprintToPrompt、detectStyleDeviation
- 5 维风格指纹：句式、词汇、段落、语气、独特标记
- 前 3 章提取指纹，后续章节注入 Prompt 并检测偏离

## 文件列表

### 新增文件
- `server/src/services/pipeline/pacingEngine.ts` — 节奏规则引擎
- `server/src/services/pipeline/snapshotService.ts` — 章节快照服务
- `server/src/services/pipeline/causalChainService.ts` — 因果链服务
- `server/src/services/pipeline/styleFingerprint.ts` — 风格指纹服务

### 修改文件
- `server/prisma/schema.prisma` — 新增 ChapterSnapshot、CausalLink 模型，StyleProfile 新增 fingerprint 字段
- `server/src/services/pipeline/aiSmellWords.ts` — 散文风格检测 + 可读性评分
- `server/src/services/pipeline/qualityCheck.ts` — 集成散文风格、可读性、风格一致性评分
- `server/src/services/pipeline/generators.ts` — 温度调整 + generateEditorPolish
- `server/src/services/pipeline/writingPhase.ts` — 编辑润色集成
- `server/src/services/pipeline/postProcessing.ts` — 节奏检测、快照、因果链、风格偏离集成
- `server/src/services/pipeline/contextAssembler.ts` — 快照、因果链、风格指纹上下文注入

## 质量检测权重（最终）

| 维度 | 权重 | 来源 |
|------|------|------|
| 词汇 AI 味 | 40% | aiSmellWords |
| 句式模式 | 25% | aiSmellWords |
| 段落模式 | 15% | aiSmellWords |
| 结构模式 | 10% | aiSmellWords |
| 可读性 | 10% | scoreReadability |
| 散文风格 | 独立 | scoreProseStyle |
| 风格一致性 | 独立 | detectStyleDeviation |

## 验证情况
- [x] pnpm prisma:generate 成功
- [x] pnpm typecheck 全量通过（shared + server + client）
- [ ] 功能测试：创建 pipeline 任务验证各技能效果
