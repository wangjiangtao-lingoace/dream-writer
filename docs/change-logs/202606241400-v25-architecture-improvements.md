# v2.5 架构改进（4 项关键优化）

## 变更原因
用户（资深架构师）评审 v2.5 架构后指出 4 个长篇稳定性问题：
1. "每章必须推进至少一条爽点链"太硬，缺少生活感
2. Beat 蓝图每章 LLM 生成成本高且不稳定
3. P0 过重、P3 过轻，都市脑洞文依赖"风格惯性"
4. 缺少"章节类型 chapterType"，Beat 只是局部节奏

## 修改点

### 1. ChapterOutline 增加 chapterType 等新字段
- `chapterType`: 章节类型（task_trigger/mission/payoff/comedy_daily/relationship/danger_escalation/info_reveal/transition）
- `readerPromise`: 读者承诺（本章让读者看到什么）
- `chapterFunction`: 章节功能（兑现什么+开启什么）
- `requiredReaderEmotion`: 读者应感受到的情绪
- `payoffChainRefs`: 关联的爽点链阶段
- `comedyMechanism`: 喜剧机制
- `endingQuestion`: 章末悬念问题

### 2. Beat 蓝图混合模式
- **普通章节**：使用程序模板生成 Beat（8 种 chapterType 对应 8 套模板）
  - task_trigger: hook → reveal → dialogue → conflict → hook_end
  - mission: hook → conflict → dialogue → twist → payoff → hook_end
  - payoff: pressure → reversal → payoff → emotional → hook_end
  - comedy_daily: hook → dialogue → reveal → emotional → hook_end
  - relationship: hook → dialogue → conflict → emotional → hook_end
  - danger_escalation: hook → conflict → reveal → dialogue → hook_end
  - info_reveal: hook → reveal → dialogue → reveal → hook_end
  - transition: hook → emotional → dialogue → reveal → hook_end
- **关键章节**（payoff/danger_escalation/info_reveal + 高潮章/转折章）：使用 LLM 生成

### 3. P3 层增加"本书固定口味"
StyleDna 新增：
- `fixedTaste`: 读者主要来看什么、喜剧来源、核心矛盾/反差、标志性桥段
- `chapterRhythm`: 每 N 章的节奏规则（爽点闭环/喜剧桥段/主线升级）

### 4. 章纲生成增加新字段
generateEnrichedChapterOutlines 输出增加 chapterType、readerPromise、chapterFunction、requiredReaderEmotion、payoffChainRefs、comedyMechanism、endingQuestion

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| server/prisma/schema.prisma | ChapterOutline 增加 7 个新字段 |
| server/src/services/pipeline/generators.ts | 章纲输出增加新字段 + chapterType 说明 |
| server/src/services/pipeline/pipelineUtils.ts | 持久化新字段 |
| server/src/services/pipeline/writingPhase.ts | Beat 蓝图混合模式（模板+LLM） |
| server/src/services/pipeline/prompts/layer2-style.ts | P3 增加固定口味和章节节奏规则 |
| server/src/routes/workspace.ts | 工作台 API 返回新字段 |

## 风险说明
- 需执行 prisma push 同步数据库
- Beat 模板需要在实际使用中验证效果
- 固定口味字段需要在风格生成时自动填充

## 验证情况
- [x] pnpm typecheck:server 通过
- [ ] 需执行 prisma push 同步数据库
- [ ] 需跑流水线验证完整流程
