# 变更日志：章节快照机制

**日期**: 2026-07-03 00:41
**分支**: feat/lightweight-rebuild
**作者**: wangjiangtao

## 变更原因

Pipeline 写作阶段需要更精确的上下文传递机制。原有的 `ChapterSummary` 只记录概要文本，缺少结构化的剧情状态快照（主角状态、伏笔/钩子计数、张力等级等），导致后续章节 Prompt 注入时无法精准承接前文状态。

新增 `ChapterSnapshot` 模型，在每章后处理完成后自动提取结构化快照，并在后续章节创作时注入 Prompt，提升剧情连贯性。

## 修改点

1. **Prisma Schema 新增 `ChapterSnapshot` 模型**
   - 记录主角状态（处境/情绪/位置）、配角状态、剧情阶段、张力等级
   - 记录伏笔/钩子活跃计数及本章回收情况
   - 记录章节元数据（字数/情绪类型/爽点类型）
   - 与 `Novel` 表关联，支持级联删除

2. **新建 `snapshotService.ts` 服务**
   - `captureSnapshot()`: 从 LLM 后处理结果中提取快照并持久化
   - `getRecentSnapshots()`: 获取最近 N 章快照
   - `buildSnapshotContext()`: 构建精简快照上下文文本（~300 tokens）

3. **集成到 `postProcessing.ts`**
   - 在 `mergedPostProcessing` 完成后调用 `captureSnapshot`（不阻塞主流程）

4. **集成到 `contextAssembler.ts`**
   - 在 `assembleForChapter` 中加载前 3 章快照上下文，注入写作 Prompt

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/prisma/schema.prisma` | 新增 `ChapterSnapshot` 模型，`Novel` 模型新增 `snapshots` 关系 |
| `server/src/services/pipeline/snapshotService.ts` | 新建：快照提取、查询、上下文构建服务 |
| `server/src/services/pipeline/postProcessing.ts` | 在后处理完成后调用 `captureSnapshot` |
| `server/src/services/pipeline/contextAssembler.ts` | 在上下文组装中加载快照并注入 Prompt |

## 风险说明

- **低风险**: 快照写入使用 `catch` 兜底，失败不影响主流程
- **无破坏性**: 新增模型和字段，不修改已有数据结构
- **回退方案**: 删除 `ChapterSnapshot` 模型即可回退，不影响现有功能

## 验证情况

- [x] `pnpm prisma:generate` 通过
- [x] `pnpm typecheck` 通过（server 包无新增类型错误）
- [ ] 手动验证：Pipeline 写作阶段后检查 `chapter_snapshots` 表数据
