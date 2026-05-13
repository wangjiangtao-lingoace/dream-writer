# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Dream Writer 是一个具有传统线装书风格的 AI 小说创作平台。当前处于轻量重建阶段（`feat/lightweight-rebuild` 分支），从 AI-Novel 重型架构精简为最小可迭代骨架。

## 常用命令

```bash
# 开发（同时启动 client + server）
pnpm dev

# 单独启动
pnpm dev:client    # Vite dev server (localhost:5173)
pnpm dev:server    # Express server (localhost:3000)

# 构建（必须按顺序：shared → server → client）
pnpm build

# 类型检查（全部三个包）
pnpm typecheck

# 单包类型检查
pnpm typecheck:shared
pnpm typecheck:server
pnpm typecheck:client

# Prisma 相关（在 server 目录下执行）
pnpm prisma:generate   # 生成 Prisma Client
pnpm prisma:push       # 推送 schema 到数据库
pnpm prisma:migrate    # 创建迁移
pnpm db:studio         # 打开 Prisma Studio
```

## 架构

### Monorepo 结构（pnpm workspace）

```
dream-writer/
├── client/          # 前端 (React 19 + Vite 7 + TypeScript)
├── server/          # 后端 (Express 5 + Prisma 7 + SQLite)
├── shared/          # 共享类型定义 (Zod schemas + TS types)
└── pnpm-workspace.yaml
```

### 前端 (client/)

- **路由**: React Router v7，定义在 `src/router/index.tsx`
- **状态管理**: TanStack Query (React Query)
- **编辑器**: Plate.js 富文本编辑器
- **AI 对话**: assistant-ui + LangGraph SDK
- **样式**: 古风主题系统，CSS 变量驱动
- **API 代理**: Vite dev server 代理 `/api` 到后端

主要页面：BookShelf（书架）→ CreateWork（创建）→ NovelWorkspace（工作台，含多个 tab）→ PipelinePage（流水线）

### 后端 (server/)

- **入口**: `src/app.ts` - Express 应用，注册所有路由
- **数据库**: Prisma + SQLite（`server/prisma/schema.prisma`），开发用 `dev.db`
- **LLM 层**: `src/llm/` 目录，支持多 provider（deepseek, openai, anthropic, qwen, glm, kimi, gemini, mimo 等）
- **服务层**: `src/services/` - 业务逻辑，核心为 `LlmInvokeService`
- **路由层**: `src/routes/` - REST API，所有路由挂载在 `/api` 下

关键路由：`/api/novels`, `/api/characters`, `/api/worldviews`, `/api/knowledge-assets`, `/api/volumes`, `/api/ai`, `/api/pipeline`, `/api/book-analysis`

### 共享包 (shared/)

- 导出 LLM provider 类型、API 响应类型、SSE 帧类型
- 通过 `@dream-writer/workspace:*` 被 client 和 server 引用
- 构建产物在 `dist/`，必须先构建 shared 再构建其他包

### 数据库 Schema（23 个表）

核心表：Novel → Chapter, Character, Worldview, KnowledgeAsset, Volume → ChapterOutline

增强表：Memory（记忆系统）, StyleProfile（风格配置）, StoryState（剧情状态机）, PleasurePoint（爽点）, EmotionCurve（情绪曲线）, Mainline（主线）, Hook（钩子）, Foreshadow（伏笔）, ConsistencyIssue（一致性问题）

分析表：BookAnalysis → BookAnalysisSection, ImitationPlan, PipelineJob → PhaseResult

## 开发注意事项

- **开发阶段**: 当前处于 P0（骨架联通）已完成，P1（小说主线）待启动状态，见 `IMPLEMENTATION_ROADMAP.md`
- **环境变量**: server 需要 `.env` 文件（参考 `.env.example`），至少配置一个 LLM provider 的 API Key
- **数据库初始化**: `pnpm dev:server` 会自动检查并生成 Prisma Client；首次需执行 `pnpm prisma:push`
- **构建顺序**: shared 必须先构建，因为 server 和 client 都依赖它
- **Node 版本**: 要求 ^20.19.0 || ^22.12.0 || >=24.0.0
- **包管理器**: pnpm >= 10.6.0

## 路线图阶段

| 阶段 | 主题 | 状态 |
|------|------|------|
| P0 | 骨架联通 | ✅ 完成 |
| P1 | 小说主线（Novel/Chapter CRUD + LLM 生成） | 待启动 |
| P2 | 世界观/人物/资料库 | 待启动 |
| P3 | 检索增强（RAG） | 待启动 |
| P4 | 打磨（错误处理/配额/日志） | 待启动 |
| P5 | 可选迁移（AI-Novel 旧库导入） | 待启动 |

详细路线图见 `IMPLEMENTATION_ROADMAP.md`。

## 变更记录

每次变更需在 `docs/change-logs/` 下创建 `YYYYMMDDHHMM-change-log.md`，格式参考已有文件。
