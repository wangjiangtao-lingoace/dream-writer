# Temperature 精调变更日志

**变更时间**：2026-07-03 00:40
**变更类型**：配置优化
**分支**：feat/lightweight-rebuild

---

## 变更原因

为 Pipeline 不同阶段配置差异化的 LLM temperature，平衡创意性与结构稳定性：
- 大纲/创意类任务需要较高 temperature 保证多样性
- 结构化任务（Beat 蓝图、卷纲）需要较低 temperature 保证稳定性
- 检测/验证类任务需要最低 temperature 保证精确性

---

## 修改点

### 1. Temperature 调整

| 函数 | 修改前 | 修改后 | 理由 |
|------|--------|--------|------|
| `generateVolumeOutline` | 0.7 | 0.65 | 卷纲需要结构稳定性，降低随机性 |
| `generateChapterBeats` | 0.7 | 0.5 | Beat 蓝图是结构化指令，应更稳定可预测 |

### 2. 保持不变的配置

| 函数 | Temperature | 理由 |
|------|-------------|------|
| `generateOutline` | 0.7 | 大纲需要创意多样性 |
| `generateChapterOutlines` | 0.7 | 章纲需要创意 |
| `generateChapterDraft` | 0.78 | 正文需要丰富表达 |
| `generateConsistencyCheck` | 0.3 | 检测需要精确 |
| `generateEditorPolish` | 0.4 | 润色需要低随机性保持原意 |

### 3. `generateEditorPolish` 函数状态

函数已存在于 `generators.ts`（第 1276 行），无需新增。当前实现：
- 使用 `ctx: PhaseContext` 一致性接口（与其他函数统一）
- temperature 已设为 0.4
- 支持自定义 `targetMaxTokens`

---

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/pipeline/generators.ts` | 调整 `generateVolumeOutline` 和 `generateChapterBeats` 的 temperature |

---

## 风险说明

1. **低风险**：temperature 调整幅度小（0.7→0.65, 0.7→0.5），不会导致输出质量显著变化
2. **可回滚**：如发现生成质量下降，可快速恢复原值
3. **无副作用**：仅影响 LLM 采样参数，不改变业务逻辑

---

## 验证情况

- [x] TypeScript 类型检查通过（`qualityCheck.ts` 有预存错误，与本次修改无关）
- [x] 确认 `generateEditorPolish` 函数已存在且配置正确
- [x] 确认所有 temperature 值符合设计原则
