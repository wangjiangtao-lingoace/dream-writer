# 变更日志：散文风格检测增强

**时间**: 2026-07-03 00:40
**分支**: feat/lightweight-rebuild
**变更人**: wangjiangtao

## 变更原因

参考 write-good 项目的 8 类检测方法，扩展 Dream Writer 的 AI 味检测能力，新增散文风格维度检测，覆盖弱化词、冗余表达、陈词滥调三类问题。

## 修改点

### 1. 新增词表（aiSmellWords.ts）

- **WEAKENING_WORDS**：19 个中文弱化词（非常、真的、极其、十分、相当、比较、有点、稍微、略微、几乎、差不多、大约、或许、可能、大概、似乎、好像、仿佛、貌似），削弱语气使表达模糊。
- **REDUNDANT_PATTERNS**：9 个冗余表达正则模式（他心里想、用眼睛看、用手拿、开口说道、心中暗想、不禁不由得、突然之间、立刻马上、互相彼此），匹配后给出简化建议。
- **CLICHE_PHRASES**：34 个中文小说常见陈词滥调（不由自主、恍然大悟、心如刀割、怒火中烧等），检测被滥用的成语/短语。

### 2. 新增检测函数（aiSmellWords.ts）

- `detectWeakeningWords(content)`：检测弱化词密度（每千字不超过 5 个为佳）
- `detectRedundantPatterns(content)`：检测冗余表达，返回匹配位置及简化建议
- `detectClichePhrases(content)`：检测陈词滥调，返回命中列表
- `scoreProseStyle(content)`：综合散文风格评分（0-10 分，10 为最佳），基础分 10，弱化词超限扣分上限 3、冗余表达扣分上限 3、陈词滥调扣分上限 4

### 3. 集成到质量检测流程（qualityCheck.ts）

- 导入 `scoreProseStyle`
- `QualityScores` 接口新增 `proseStyle: number` 字段
- `validateChapterQuality` 中调用 `scoreProseStyle`，散文风格分 < 7 时生成 issue
- 散文风格分 < 5 时触发重试（`programShouldRetry`）

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/pipeline/aiSmellWords.ts` | 新增 3 类词表 + 4 个检测函数 + 4 个接口定义 |
| `server/src/services/pipeline/qualityCheck.ts` | 导入 scoreProseStyle，QualityScores 新增 proseStyle 字段，集成到质量检测和重试逻辑 |

## 风险说明

- **低风险**：新增检测维度为纯程序检测，无 LLM 调用，不影响生成流程性能。
- **重试触发**：散文风格分 < 5 会触发章节重写，可能增加 LLM 调用次数。阈值可通过后续调优。
- **陈词滥调误判**：部分成语在特定语境下是合理的（如角色台词），当前不做上下文区分，后续可细化。

## 验证情况

- [x] `pnpm typecheck` 通过，无类型错误
- [ ] 单元测试（待补充）
- [ ] 手动验证（待实际生成测试）
