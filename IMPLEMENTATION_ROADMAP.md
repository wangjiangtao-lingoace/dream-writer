# Dream Writer 实施路线图（轻量版）

> 一个轻量、可迭代的 AI 小说创作骨架。
> 以 **P0：骨架联通** 为基线，分阶段按需堆能力，每一步都可独立部署。

---

## 设计前提

- 不追求 AI-Novel 的全功能复刻（多导演、签节执行、状态版本、风格引擎等暂不纳入）
- 单用户本地优先，SQLite + Express + React，部署 = 一台机器
- 所有阶段以「能完整跑通最小闭环」为完成标准，禁止半成品合入主线

---

## 阶段总览

| 阶段 | 主题 | 状态 | 关键交付 |
| --- | --- | --- | --- |
| **P0** | 骨架联通 | ✅ 完成 | pnpm workspace + 8 表 schema + `/api/health` + 首页连通 |
| **P1** | 小说主线 | ✅ 完成（超额） | Novel/Chapter CRUD + 章节流式生成 + 单一 LLM 入口 + **Pipeline 三阶段全自动流水线** + **拆书分析** + **仿写方案** |
| **P2** | 世界观 / 人物 / 资料库 | ✅ 完成（超额） | Worldview/Character/KnowledgeAsset CRUD + 富文本 + **风格学习** + **记忆系统** + **一致性校验** + **伏笔管理** + **节奏优化** + **导演分析** |
| **P3** | 检索增强（RAG） | ✅ 完成 | Qdrant + hybrid（BM25 + 向量）+ RagChunk 写入 |
| **P4** | 打磨 | 🟡 部分完成 | ✅ 错误处理中间件 + Jest 测试（32 个用例）<br>⏳ 配额限制 / 结构化日志 / UI 细节统一 / E2E 测试 |
| **P5** | 可选迁移 | 待启动 | AI-Novel 旧库 → 新 schema 的导入工具 |

---

## P0 · 骨架联通（已完成）

**目标**：把仓库从 AI-Novel 重型副本，缩成最小可启动骨架，确认开发链路畅通。

**关键决策**
- 删除 `agents / services / routes / prompting` 整目录
- LLM 调用层只保留 9 个自洽文件（其余依赖已删模块，连带删除）
- Prisma schema 1997 行 → 140 行 / 8 表
- `dev.db` 全新初始化（不沿用旧业务数据）

**完成判据**：`pnpm dev` 起服 + `curl /api/health` 返回正确 JSON ✅

详见：`docs/change-logs/202605111000-change-log.md`

---

## P1 · 小说主线（✅ 已完成 - 超额交付）

**目标**：用户能创建一本小说、写章节、用 LLM 生成正文草稿。

**后端**
- `services/llm/LlmInvokeService`：统一的（非流式 / 流式）LLM 调用入口，支持 12 种 LLM 提供商
- `services/NovelService`、`services/ChapterService`：CRUD
- `routes/novel.ts`、`routes/chapter.ts`、`routes/generation.ts`（SSE 章节生成）
- **✨ 超额交付**：
  - `services/PipelineService` + `services/pipeline/*`（22 个阶段处理器）：三阶段全自动流水线
  - `services/BookAnalysisService`：8 维结构化拆书分析
  - `services/ImitationPlanService`：仿写方案生成

**前端**
- `pages/NovelList` / `pages/NovelEdit` / `pages/ChapterEdit`
- 章节编辑器：左侧 outline / 右侧正文 / 顶部「生成」按钮触发 SSE 流式追加
- **✨ 超额交付**：
  - `pages/PipelinePage`：全自动创作流水线监控页
  - `pages/AnalyzeCreate`：拆书创作流程
  - `pages/ImportContinue`：拆书结果导入续写

**完成判据**
- ✅ 创建小说 → 新建章节 → 触发 LLM 生成 → 正文实时流式落到编辑器 → 保存后能正确回读
- ✅ 支持 12 种 LLM provider（DeepSeek、OpenAI、Qwen、Gemini、MiMo 等）
- ✅ Pipeline 三阶段（规划 → 结构化 → 正文生成）全流程跑通
- ✅ 拆书分析 → 生成仿写方案 → 自动创建作品

**变更记录**：
- `docs/change-logs/202605111000-change-log.md` — P0 完成
- `docs/change-logs/202605140900-change-log.md` — P1 基础完成
- `docs/change-logs/202605141500-change-log.md` — Pipeline 全流程完成

---

## P2 · 世界观 / 人物 / 资料库（✅ 已完成 - 超额交付）

**目标**：把生成正文时可引用的「设定资料」管理起来。

**后端**
- `services/WorldviewService`、`services/CharacterService`、`services/KnowledgeAssetService`
- `routes/worldview.ts`、`routes/character.ts`、`routes/knowledge.ts`
- 资料库支持上传文本 / Markdown，存为 `KnowledgeAsset`
- **✨ 超额交付**：
  - `services/StyleService`：风格学习与去 AI 味处理
  - `services/MemoryService`：四级分层记忆系统（永久/长期/短期/临时）
  - `services/ConsistencyCheckService`：一致性校验（战力/人设/世界观/时间线）
  - `services/ForeshadowService`：伏笔埋设与回收管理
  - `services/EmotionService` + `services/RhythmService`：节奏优化
  - `services/DirectorService`：AI 导演分析
  - `services/CharacterImportService`：人物批量导入

**前端**
- `pages/WorldviewEdit`：富文本（tiptap or markdown）
- `pages/CharacterCardList` + `pages/CharacterEdit`：人物卡 + 头像
- `pages/Library`：资料库列表 / 上传 / 预览
- **✨ 超额交付**：
  - `components/CharacterRelationGraph`：人物关系图可视化
  - `pages/CharacterImportPage`：人物批量导入页
  - 工作台标签页：风格/记忆/校验/关系图

**完成判据**
- ✅ 小说可关联世界观 / 多个人物卡 / 多份资料
- ✅ 章节生成 prompt 可手选注入哪些设定
- ✅ 风格学习与去 AI 味自动处理
- ✅ 四级记忆系统自动衰减与整合
- ✅ 一致性校验覆盖 4 个维度
- ✅ 伏笔生命周期自动管理

**变更记录**：
- `docs/change-logs/202605141700-change-log.md` — P2 基础完成
- `docs/change-logs/202605142100-change-log.md` — 风格/记忆/校验完成
- `docs/change-logs/202606071230-character-import-feature.md` — 人物批量导入
- `docs/change-logs/202606071230-character-relation-graph.md` — 关系图可视化

---

## P3 · 检索增强（RAG）（✅ 已完成）

**目标**：资料库规模上来后，自动检索最相关片段注入 prompt。

**后端**
- ✅ 引入 Qdrant（本地 docker）
- ✅ `services/RagIngestService`：资料库文档切片 → embedding → 写 Qdrant + `RagChunk`
- ✅ `services/RagRetrieveService`：hybrid 检索（BM25 倒排 + 向量召回 → RRF 融合）
- ✅ 章节生成前自动拉 top-k 片段拼入 prompt

**前端**
- ✅ 资料库页面增加「构建索引」按钮、「重建」按钮
- ✅ 章节生成结果展示「本次引用的片段」可折叠卡片

**完成判据**
- ✅ 资料库 ≥10 篇文档时，章节生成能稳定命中相关内容
- ✅ 检索耗时 P95 < 500ms

**变更记录**：
- `docs/change-logs/202605150900-change-log.md` — P3 完成
- 移除了 `KnowledgeSearchService`（被 RAG 替代）

---

## P4 · 打磨（🟡 部分完成）

**目标**：从「能用」推进到「敢长期用」。

**清单**
- ✅ 全局错误处理 / 用户可见的错误提示（`errorHandler.ts` 中间件）
- ✅ Jest 测试框架 + 32 个单元测试用例（覆盖率 61.5%）
- ✅ 类型安全：TypeScript 0 错误
- ✅ UI 视觉统一：主题切换（indigo）、CSS 变量系统、字体统一（Inter）
- ⏳ LLM 调用配额与速率限制（按 provider）
- ⏳ 结构化日志（pino / winston），关键事件落 `GenerationLog`
- ⏳ 端到端 happy path 测试（playwright）

**完成判据**：一台机器连续创作 7 天无需手工重启 / 清理。

**变更记录**：
- `docs/change-logs/202606121500-change-log.md` — 错误处理 + Jest 测试完成
- `docs/change-logs/202606081000-character-card-ui-fix.md` — UI 修复
- Git commit `869533f` — 主题切换到 indigo + 字体统一
- Git commit `cc659ff` — CSS 变量系统统一颜色

---

## P5 · 可选迁移

**目标**：把 AI-Novel 旧库里有价值的小说搬过来。

**思路**
- 单次脚本 `scripts/migrate-from-ai-novel.ts`：旧 schema → 新 schema 字段映射
- 只迁移：Novel、Chapter、Character、Worldview、KnowledgeAsset
- 其他（状态版本 / 任务 / 风格规则 / 自动导演产物）一律丢弃
- 输出 dry-run 报告 → 用户确认后 commit

**完成判据**：单本小说迁移后，正文 / 章节顺序 / 人物卡完整无丢失。

---

## 不做的事

为避免重蹈 AI-Novel 重负累：

- ❌ 多 Agent 编排 / Planner / 工具注册中心
- ❌ 自动导演 / 章节签节执行 / 自动审校
- ❌ 风格引擎 / 反 AI 规则 / 风格特征提取
- ❌ 任务中心 / 任务令牌 / 任务可视化
- ❌ 状态机 / Canonical State / Open Conflicts

如未来确有强诉求，单独立项重新评估，**不在本路线图内悄悄加塞**。

---

---

## 项目当前状态（2026-06-12）

- **分支**：`feat/lightweight-rebuild`
- **阶段**：P4 部分完成（70 分 Beta 状态）
- **数据库**：36 张表，8 次迁移
- **TypeScript**：0 错误
- **测试覆盖率**：61.5%（32 个单元测试）
- **LLM 提供商**：12 种（DeepSeek、OpenAI、Qwen、Gemini、MiMo 等）
- **核心功能**：✅ 独立创作 + ✅ 拆书仿写 + ✅ Pipeline 全自动流水线

**最近变更**：
- `docs/change-logs/202606121500-change-log.md` — P0/P1 级问题修复，升级到 Beta 70 分
- `docs/change-logs/202606111000-readme-sync.md` — README.md 全面同步
- Git commit `ffee9e2` — v2.2 版本发布

*基线快照：`aa17b24` · 路线图版本：2026-06-12*
