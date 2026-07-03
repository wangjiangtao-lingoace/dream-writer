# 变更日志：中文可读性评分维度

**时间**: 2026-07-03 00:40
**分支**: feat/lightweight-rebuild
**变更人**: wangjiangtao

## 变更原因

为 Dream Writer 质量检测体系新增中文可读性评分维度，从句长、段落、节奏、词汇丰富度、对话与描写比例等角度量化章节可读性，补充现有 AI 味检测的盲区。

## 修改点

### 1. 新增 scoreReadability 函数（aiSmellWords.ts）

新增 `ReadabilityResult` 接口和 `scoreReadability(content)` 函数（0-10 分，10 为最佳），覆盖 7 个检测维度：

| 维度 | 目标区间 | 扣分规则 |
|------|----------|----------|
| 平均句长 | 15-25 字 | <10 扣 1.5，<15 扣 0.5，>35 扣 1.5，>25 扣 0.5 |
| 段落长度 | 100-300 字 | <50 扣 1，>500 扣 1 |
| 短句比例 | 20-40% | >40% 扣 1，<20% 扣 0.5 |
| 长句比例 | <15% | >15% 扣 1 |
| 词汇丰富度 | >0.6 | <0.6 扣 1 |
| 对话比例 | 20-40% | <20% 扣 0.5，>40% 扣 0.5 |
| 描写比例 | 10-30% | 过低扣 0.5 |

分句规则：按 `。！？；…\n` 分句，按 `\n\n` 或连续空行分段。

### 2. 集成到质量检测流程（qualityCheck.ts）

- 导入 `scoreReadability`
- `QualityScores` 接口新增 `readability: number` 字段
- `validateChapterQuality` 中调用 `scoreReadability`，可读性分 < 7 时生成 issue
- 综合 AI 味权重调整：词汇 40% + 句式 25% + 段落 15% + 结构 10% + 可读性 10%

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/pipeline/aiSmellWords.ts` | 新增 ReadabilityResult 接口 + scoreReadability 函数（~150 行） |
| `server/src/services/pipeline/qualityCheck.ts` | 导入 scoreReadability，QualityScores 新增 readability 字段，调整综合评分权重，集成可读性检测 |

## 风险说明

- **低风险**：新增检测维度为纯程序检测（正则 + 统计），无 LLM 调用，不影响生成流程性能。
- **权重调整**：综合 AI 味评分权重从 40/30/20/10 调整为 40/25/15/10/10，原有维度权重略有下降，整体评分标准基本不变。
- **可读性误判**：描写比例检测基于关键词匹配，某些文风可能漏检。后续可通过扩展关键词表优化。

## 验证情况

- [x] `pnpm typecheck` 通过，无类型错误
- [ ] 单元测试（待补充）
- [ ] 手动验证（待实际生成测试）
