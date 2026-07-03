# 变更记录 - RAG 索引扩展（P1 #10）

## 变更原因

审计发现 RAG 索引不完整：仅索引 KnowledgeAsset 和 Memory，未索引 Worldview、Character、Chapter 内容。导致查询如"主角的身世是什么"无法从世界观文档或角色档案中检索到答案。

## 修改点

1. 扩展 `RagIngestService` 的 `ownerType` 类型，新增 `"worldview" | "character" | "chapter"`
2. 新增 4 个批量索引方法：`upsertWorldviewChunks`、`upsertCharacterChunks`、`upsertKnowledgeAssetChunks`、`upsertChapterChunks`
3. 新增 `reindexAll` 便捷方法，一次性重建作品的全部 RAG 索引
4. 更新 `/api/rag/reindex/:novelId` 路由，使用 `reindexAll` 替代手动迭代

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/RagIngestService.ts` | 扩展 ownerType 类型，新增 4 个索引方法 + reindexAll |
| `server/src/routes/rag.ts` | reindex 路由改用 reindexAll，返回更详细的统计信息 |

## 风险说明

- **无破坏性变更**：未修改现有 `upsertChapterChunks`（旧逻辑由 pipeline 调用）和 `deleteChunks` 方法
- **检索兼容**：`RagRetrieveService` 的检索方法按 `novelId` 查询，不按 `ownerType` 过滤，新 sourceType 自动被覆盖
- **schema 无需变更**：`RagChunk.ownerType` 是纯字符串字段，可接受任意值
- **回退方案**：如需回退，revert 上述两个文件即可，数据库中的 chunks 可通过 reindex 清理

## 验证情况

- `pnpm typecheck:server` 通过，无类型错误
