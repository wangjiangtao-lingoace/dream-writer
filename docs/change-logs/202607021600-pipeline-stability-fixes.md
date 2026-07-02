# 流水线稳定性修复

## 变更原因

Pipeline 流水线在长时间运行过程中存在多个稳定性隐患，包括 config 对象被意外修改、stale job 无法检测、阶段确认时多个 if 块顺序执行产生副作用、错误被静默吞掉等问题。本次修复逐一消除这些隐患。

## 修改点

### 1. PipelineService.ts
- **config 深拷贝**：`startPipeline` 使用 `structuredClone(config)` 创建副本，避免修改调用者原始对象。
- **stale job 检测**：`startPipeline` 开头查询状态为 running 但 updatedAt 超过 10 分钟的 job，将其重置为 error 状态。
- **confirmPhase 提前返回**：v2 分支的 5 个 `if(allConfirmed)` 块改为 `if(!allConfirmed) return` + 每个分支末尾 `return result`，避免顺序执行产生副作用。

### 2. pipelineUtils.ts
- **safeJson 替代 JSON.parse**：`getPhaseOutput` 中使用 `safeJson(result.output, null)` 替代 `JSON.parse(result.output)`，避免非法 JSON 导致崩溃。
- **selfReview 错误区分**：catch 块中区分 Prisma DB 错误（code 以 "P" 开头）和 LLM 调用错误，DB 错误重新抛出，LLM 错误静默跳过并记录警告。
- **importance 梯度化**：`saveToKnowledgeBase` 中 importance 值按 category 梯度设置：outline/chapter_draft=8, character/worldview=7, style=6。
- **持久化错误不再吞掉**：`persistGeneratedAssets` 的 catch 块从 `console.warn` 改为 `console.error` 并重新抛出错误。

### 3. assetsPhase.ts
- **Promise.allSettled**：查询已有世界观/人物/风格的 Promise.all 改为 Promise.allSettled，失败时使用 fallback 默认值。
- **personality 字段修复**：角色映射中 `personality: c.arcSummary` 改为 `personality: c.personality || c.arcSummary`。
- **catch fallback 改为 null**：`.catch(() => ({}))` 改为 `.catch(() => null)`，下游调用时显式提供空对象 fallback。

### 4. planningPhase.ts
- **删除前备份**：删除旧卷/章纲前先查询保存到变量，生成失败时恢复备份数据。
- **截断日志**：灵感文本超过 3000 字时记录 `console.warn` 截断信息。

### 5. consistencyPhase.ts
- **validateCharacterAppearance 实际逻辑**：修复为实际检测 Character 表中有但章纲中从未出现的角色，输出 low 级别告警。

### 6. writingPhase.ts
- **暂停状态检查优化**：从每章查 DB 改为每 5 章检查一次（`index % 5 === 0`），减少 DB 查询开销。
- **重试退避延迟**：质量重试循环中添加延迟，第 1 次等 1 秒，第 2 次等 3 秒。

## 文件列表

| 文件 | 说明 |
|------|------|
| `server/src/services/PipelineService.ts` | config 深拷贝 + stale job 检测 + confirmPhase 提前返回 |
| `server/src/services/pipeline/pipelineUtils.ts` | safeJson + selfReview 错误区分 + importance 梯度 + 持久化错误抛出 |
| `server/src/services/pipeline/assetsPhase.ts` | Promise.allSettled + personality 修复 + catch fallback |
| `server/src/services/pipeline/planningPhase.ts` | 删除前备份 + 截断日志 |
| `server/src/services/pipeline/consistencyPhase.ts` | validateCharacterAppearance 实际逻辑 |
| `server/src/services/pipeline/writingPhase.ts` | 暂停检查优化 + 重试退避 |

## 风险说明

- **persistGeneratedAssets 错误抛出**：原来静默吞掉的错误现在会向上冒泡，可能影响调用方流程。但这些错误本身就是数据不一致的根源，应当被感知和处理。
- **confirmPhase 提前返回**：每个分支末尾增加了 `return result`，确保不会意外执行到后续分支。逻辑等价于原来的 if-else 链。
- **stale job 检测**：会将所有超过 10 分钟未更新的 running job 标记为 error，如果存在正常的长时间运行任务可能被误判。10 分钟阈值对当前 pipeline 足够宽裕。

## 验证情况

- TypeScript 类型检查通过（`pnpm typecheck:server`）
