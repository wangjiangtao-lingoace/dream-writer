# Changelog

## [v2.3] - 2026-06-12

### 修复

- **P0-1**: 修复 17 处 TypeScript 类型错误 — `CharacterRelation` 的 `charA`/`charB` 关系字段查询全部改为 Prisma 关系过滤器语法，同步迁移数据库 Schema
- **P0-2**: 移除 `server/.env.example` 中硬编码的真实 MIMO API Key，替换为占位符并添加安全警告
- **P0-3**: 同步 CLAUDE.md 路线图状态，与 README.md 保持一致（P0-P3 完成）
- **P1-1**: 新增统一错误处理中间件 `errorHandler.ts`，`AppError`/`ZodError`/`LlmError` 分层处理，LLM 错误返回友好中文提示

### 新增

- **Jest 测试框架**: 配置 ts-jest，新增 `pnpm test` / `pnpm test:coverage` 命令
- **单元测试**: 32 个测试用例，覆盖 crypto（100%）、errorHandler（91%）、StyleService（60%）、retry（71%）、LlmInvokeService
- **Pipeline 断点续传**: `pausePipeline` / `resumePipeline` 已就绪，支持从失败阶段恢复
- **Settings 页面**: 图形化 LLM 配置，支持 12 种提供商、API Key 加密存储、测试连接

### 验证

- `pnpm typecheck` — 0 错误（shared + server + client）
- `pnpm build` — 构建成功
- `pnpm test` — 32/32 通过
- `pnpm test:coverage` — 函数覆盖率 61.5%
- E2E API 测试 — Novel/Character CRUD、AI Config、Health Check、错误处理全部通过
- characterConstraints 运行时测试 — 9/9 通过

---

## [v2.2] - 2026-06-07

### 功能

- 人物关系图可视化组件
- 人物批量导入功能
- 章节修订历史
- 工作台布局重构（Standard/Write 两种模式）
- WorkspaceHeader 组件

### 修复

- CharacterCard UI 优化
- AssetPanel 类型修复
- CSS 变量统一替换硬编码颜色

---

## [v2.1] - 2026-06-01

### 功能

- BYOK（Bring Your Own Key）支持
- AI 模型配置页面
- API Key 加密存储
- LLM Provider 优先级机制

---

## [v2.0] - 2026-05-14

### 功能

- 轻量重建骨架（Monorepo + 36 张表）
- Novel/Chapter CRUD + LLM 生成
- Pipeline 自动创作流水线
- 世界观/人物/资料库管理
- RAG 检索增强
- 记忆系统、风格配置、一致性校验
- 拆书分析 + 仿写方案
