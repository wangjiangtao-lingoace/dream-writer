# 卷纲生成注入素材上下文

## 变更原因

卷纲生成阶段（planningPhase）不会读取 KnowledgeAsset 中的素材数据（整体规划、完整创作文档、钩子表、约束规则），导致 AI 会忽略用户导入的 6 卷 800 章详细规划，自行凭空生成卷结构。

## 修改点

1. **`server/src/services/pipeline/planningPhase.ts`**
   - 导入 `loadMaterialContextForNovel`
   - 在生成卷纲前调用 `loadMaterialContextForNovel(novelId, jobId)` 加载素材上下文
   - 将 `materialContext` 传入 `generateVolumeOutline`

2. **`server/src/services/pipeline/generators.ts`**
   - `generateVolumeOutline` 函数新增 `materialContext?: string` 参数
   - prompt 中在写作风格之后注入素材上下文内容

3. **`server/src/services/pipeline/materialContext.ts`**
   - `limitText` 默认截断上限从 1600 字符提升到 4000 字符
   - 避免完整创作文档等长素材被过度截断

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/pipeline/planningPhase.ts` | 加载素材上下文并传入卷纲生成 |
| `server/src/services/pipeline/generators.ts` | 卷纲生成函数接受 materialContext 参数 |
| `server/src/services/pipeline/materialContext.ts` | limitText 上限 1600→4000 |

## 影响范围

- 卷纲生成：现在会包含用户导入的整体规划（6卷结构）、完整创作文档、钩子表、约束规则
- 章纲/正文生成：无变化（原本就已注入素材上下文）

## 验证情况

- [x] `pnpm typecheck` 通过
