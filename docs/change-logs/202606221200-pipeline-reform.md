# 变更记录

## 变更原因
流水线生成质量差：用户提供了详细的人物卡片、世界观和已有章节，但系统将其当作"灵感素材"从头生成，覆盖了原稿。风格约束是后验的而非前置的，导致生成内容与用户期望不符。

## 修改点

### 后端改造
1. **PipelineConfig 扩展** — 新增 `inputMode`（结构化/灵感）和 `continuationMode`（续写/重写）字段
2. **Analyze 阶段改造** — 结构化输入模式下跳过 LLM 分析和拆解，直接从 DB 加载用户提供的角色/世界观生成大纲
3. **新增大纲生成函数** — `generateOutlineFromStructured()` 基于已有角色和世界观构建大纲
4. **Assets 阶段补充** — `supplementMissingDetails()` 只填充用户留空的字段，不重写已有内容
5. **新增风格分析阶段** — `styleAnalysisPhase.ts` 从用户已有章节中提取写作风格和原文示例
6. **ContextAssembler 增强** — 写作上下文中注入用户原文风格示例段落
7. **批量人物 API** — `POST /api/characters/bulk/:novelId` 支持批量创建人物

### 前端改造
8. **NovelForm 分步向导** — 从单页表单改为 5 步向导：基本信息 → 人物卡片 → 世界观 → 已有章节 → 流水线配置
9. **续写/重写选择** — 有已有章节时显示明确的续写 vs 重写选择

## 文件列表

| 文件 | 变更说明 |
|------|---------|
| `server/src/services/PipelineService.ts` | PipelineConfig 接口扩展、continuationMode 映射、风格分析阶段集成 |
| `server/src/services/pipeline/analyzePhase.ts` | 结构化输入模式分支，跳过 analyze/decompose |
| `server/src/services/pipeline/generators.ts` | 新增 `generateOutlineFromStructured()` |
| `server/src/services/pipeline/assetsPhase.ts` | 新增 `supplementMissingDetails()`，风格分析阶段集成 |
| `server/src/services/pipeline/styleAnalysisPhase.ts` | 新文件：风格分析阶段 |
| `server/src/services/pipeline/contextAssembler.ts` | 加载并注入用户原文风格示例 |
| `server/src/routes/characters.ts` | 新增批量创建人物端点 |
| `client/src/pages/NovelForm.tsx` | 重构为 5 步分步向导 |
| `client/src/components/PipelineConfigModal.tsx` | 无实质变更 |

## 风险说明
- 所有新字段可选，未设置时行为与原有逻辑完全一致
- 风格分析阶段仅在结构化输入 + 有已有章节时运行，不影响其他模式
- 前端表单改造较大，但保持了原有的 API 调用结构

## 验证情况
- TypeScript 编译通过（server + client）
- 需要手动验证：创建新作品流程、结构化输入 → 流水线 → 生成质量
