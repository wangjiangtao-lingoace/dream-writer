# 变更记录 202606201600

## 变更原因
系统全方位审核发现 Pipeline 各阶段生成质量存在三大系统性问题：Token 预算不足、上下文传递断裂、关键维度缺失。本次变更针对性优化，提升长篇小说创作质量。

## 修改点

### 1. 卷纲增强（P1）
- `generateVolumeOutline` prompt 修复内部矛盾（keyEvents 数量统一为至少 5 个）
- JSON 模板新增 `foreshadowsPlanned`（伏笔规划）、`characterArcs`（角色弧线）、`targetWordCount`（字数分配）字段
- Volume 模型新增对应 3 个字段

### 2. 故事弧线增强（P1）
- `generateStoryArcs` maxTokens 从 3000 提升至 5000
- 章纲摘要从 3 字段扩展到 10 字段（增加 conflict/emotion/characters/hooks/foreshadow）
- 里程碑结构增强：新增 type/characters/causeEffect 字段
- 副线规划增强：要求 startChapter/endChapter/交汇点/自身冲突
- 跨卷钩子与章纲钩子交叉引用

### 3. 一致性校验增强（P2）
- 新增 5 个程序化校验函数：钩子范围、伏笔范围、爽点间隔、情绪覆盖、角色出场
- planSummary 增加 description 字段
- generateConsistencyCheck maxTokens 从 2000 提升至 4000
- 新增 `attemptAutoFix` 自动修复闭环（fire-and-forget，最多 1 轮）

### 4. 章纲系统重构（P0+P1）
- `generateEnrichedChapterOutlines` maxTokens 从 6000 提升至 8000
- 分批生成：每卷 30 章改为每批 10 章，每批携带前批摘要保证连贯
- JSON 模板新增 `scene`（场景）、`pov`（视角）、`targetWordCount`（目标字数）
- ChapterOutline 模型新增对应 3 个字段
- `persistVolumeChapterData` 适配新字段持久化

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/prisma/schema.prisma` | Volume 增加 3 字段，ChapterOutline 增加 3 字段 |
| `server/dev.db` | SQLite 表结构同步 |
| `server/src/services/pipeline/generators.ts` | 4 个函数优化（VolumeOutline/StoryArcs/ConsistencyCheck/ChapterOutlines） |
| `server/src/services/pipeline/chapterOutlinesPhase.ts` | 分批生成逻辑 + 新字段持久化 + buildChapterSummaryForArcs |
| `server/src/services/pipeline/consistencyPhase.ts` | 5 个程序化校验 + 自动修复闭环 |

## 优化效果对比

| 环节 | 优化前评分 | 优化后预期 | 关键改进 |
|------|-----------|-----------|----------|
| 卷纲设计 | 6.5/10 | 8/10 | +伏笔规划 +角色弧线 +字数分配 |
| 故事弧线 | 5.5/10 | 7.5/10 | +完整摘要 +副线规划 +token 提升 |
| 一致性校验 | 6/10 | 8/10 | +5 项程序化校验 +自动修复闭环 |
| 章纲细化 | 7.5/10 | 9/10 | +分批生成 +场景/视角/字数 +token 提升 |

## 风险说明

- **分批连贯性**：每批生成时传递前一批最近 3 章摘要，保证章节间逻辑衔接，但可能丢失更远章节的伏笔关联
- **maxTokens 提升**：从 6000→8000 会增加 LLM 调用成本约 30%，但对输出质量提升显著
- **Prisma db push 失败**：已通过直接 SQL ALTER TABLE 绕过，schema 与数据库一致
- **向后兼容**：所有新增函数参数均为可选，不影响现有调用链

## 验证情况

- [x] Server TypeScript 类型检查：0 错误
- [x] SQLite 表结构验证：Volume 3 新字段 + ChapterOutline 3 新字段已生效
- [x] Prisma Client 重新生成成功
