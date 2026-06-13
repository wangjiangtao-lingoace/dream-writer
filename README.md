# Dream Writer -  AI 小说创作助手

> "墨香流传，笔耕不辍"

一个具有传统线装书风格的 AI 小说创作平台，为写作者提供沉浸式的古风创作体验。支持多种 LLM 提供商（DeepSeek、OpenAI、Qwen、Gemini、MiMo 等 12 种），覆盖从灵感生成到全书自动创作的完整工作流。

---

## 核心特性

### 创作方式
- **独立创作** — 从零开始，AI 全程陪伴引导
- **拆书仿写** — 搜索已有作品，8 维结构化拆解，生成仿写方案后自动创作

### AI 能力矩阵

| 能力 | 说明 | 实现状态 |
|------|------|----------|
| 灵感生成 | 输入一句话想法，AI 生成完整创作方案 | ✅ |
| 卷纲生成 | AI 自动规划分卷结构（目标、冲突、情绪、转折点） | ✅ |
| 章纲生成 | AI 批量生成章纲（目标、冲突、钩子、伏笔、爽点） | ✅ |
| 正文生成 | 基于章纲 + 记忆上下文的流式正文生成 | ✅ |
| 一致性校验 | 战力崩坏、人设崩坏、世界观冲突、时间线错误检测 | ✅ |
| 主线规划 | AI 生成多条主线（主线/支线/情感线/悬疑线） | ✅ |
| 钩子系统 | AI 批量预设钩子（悬念/伏笔/悬崖/反转/升级等 8 种类型） | ✅ |
| 风格学习 | 从参考文本提取写作风格，支持去 AI 味处理 | ✅ |
| 拆书分析 | 8 维结构化拆解（总览/剧情/时间线/人物/世界观/主题/文风/商业） | ✅ |
| 仿写方案 | 基于拆书结果生成仿写落点、创作蓝图、章节模板、样章草稿 | ✅ |
| 自动创作流水线 | 三阶段全自动：规划 → 结构化 → 正文生成，含 AI 自评与修复 | ✅ |
| 导演分析 | 剧情规划、读者模拟、综合创作建议 | ✅ |
| 记忆系统 | 四级分层记忆（永久/长期/短期/临时），自动衰减与整合 | ✅ |
| 节奏优化 | 全书节奏分析（爽点/情绪/章节长度），自动优化建议 | ✅ |
| 伏笔管理 | 伏笔埋设/回收/生命周期自动管理 | ✅ |

### 创作流水线（Pipeline）

Pipeline 是项目的核心自动化能力，将创作过程分为三个阶段：

```
阶段一：规划（Planning）
├── 生成大纲（灵感 + 核心设定）
├── 构建世界观（力量体系/地理势力/历史文化）
├── 设计人物卡（主角/反派/配角，含角色弧线）
└── 确定写作风格（叙事视角/节奏/语言风格）

阶段二：结构化（Structuring）
├── 生成卷纲（分卷目标/冲突/情绪/转折点）
├── 生成章纲（章节目标/冲突/钩子/伏笔/爽点）
├── 规划主线（主线/支线/情感线的起止与走向）
└── 预设钩子（悬念/反转/升级等类型分布）

阶段三：正文生成（Writing）
├── 逐章生成正文草稿（基于章纲 + 记忆上下文）
├── AI 自评质量（连贯性/人设一致性/节奏/文笔）
├── 自动修复问题（低分章节自动重写）
└── 记忆更新（自动提取新记忆、更新剧情状态）
```

每个阶段完成后支持：确认通过 / 重新生成 / 用户手动替换内容。

---

## 技术架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (React 19 + Vite 7 + TypeScript)                       │
│  ├── 书架首页（书架视觉）                                 │
│  ├── 作品工作台（14 个功能标签页）                            │
│  ├── 创作流水线监控页                                         │
│  └── 通用知识库管理                                           │
├─────────────────────────────────────────────────────────────┤
│  API 层 (Express 5) — 31 个路由模块，所有端点挂载在 /api 下   │
├─────────────────────────────────────────────────────────────┤
│  服务层 — 26+ 个业务服务                                      │
│  ├── AIService（核心生成引擎）                                │
│  ├── PipelineService（自动创作流水线）                        │
│  ├── pipeline/（22 个阶段处理器）                             │
│  ├── BookAnalysisService（拆书分析）                          │
│  ├── LlmInvokeService（LLM 统一调用入口）                    │
│  └── ...（记忆/风格/伏笔/节奏/导演/导入等）                  │
├─────────────────────────────────────────────────────────────┤
│  LLM 层 — 10 个文件，支持 12 种提供商                         │
│  ├── providers.ts（提供商配置）                               │
│  ├── structuredOutput.ts（结构化输出策略）                    │
│  ├── streaming.ts（SSE 流式输出）                             │
│  └── reasoning.ts（推理标签处理）                             │
├─────────────────────────────────────────────────────────────┤
│  数据层 (Prisma 7 + SQLite via better-sqlite3)               │
│  └── 36 张表：Novel / Chapter / Character / Worldview / ...  │
└─────────────────────────────────────────────────────────────┘
```

### Monorepo 结构

```
dream-writer/
├── client/                # 前端应用
│   ├── src/
│   │   ├── pages/         # 11 个页面组件
│   │   ├── components/    # 18+ 业务组件 + 9 UI 组件 + workspace 子目录
│   │   ├── hooks/         # 自定义 Hooks
│   │   ├── lib/           # API 封装
│   │   ├── router/        # 路由配置（12 条路由）
│   │   └── styles/        # 样式文件（base/tokens/components + 页面/组件子目录）
│   └── vite.config.ts
├── server/                # 后端服务
│   ├── src/
│   │   ├── routes/        # 31 个路由模块
│   │   ├── services/      # 26+ 个业务服务
│   │   │   └── pipeline/  # 22 个流水线阶段处理器
│   │   ├── llm/           # 10 个 LLM 层文件
│   │   └── db/            # Prisma 客户端
│   └── prisma/
│       ├── schema.prisma  # 数据库 Schema（36 张表）
│       └── migrations/    # 8 次迁移
├── shared/                # 共享类型包
│   └── src/types/         # 20 个类型定义文件
├── docs/                  # 项目文档 + 变更记录
└── pnpm-workspace.yaml
```

### 前端页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | BookShelf | 古风书架首页，展示所有作品 |
| `/create` | CreateWork | 选择创作方式（独立/拆书） |
| `/create/new` | NovelForm | 创建新作品（标题/类型/灵感/封面） |
| `/create/analyze` | AnalyzeCreate | 拆书创作（搜索 → 拆解 → 创建） |
| `/create/import` | ImportContinue | 拆书结果导入续写 |
| `/novel/:id` | NovelWorkspace | 作品工作台（14 个标签页） |
| `/novel/:id/:tab` | NovelWorkspace | 工作台指定标签页 |
| `/novel/:id/pipeline` | PipelinePage | 创作流水线监控 |
| `/novel/:novelId/characters/import` | CharacterImportPage | 人物批量导入 |
| `/knowledge` | GeneralKnowledge | 通用知识库管理 |
| `/settings` | Settings | 系统设置 |
| `/guide` | GuidePage | 使用指南 |

### 作品工作台标签页（4 组 14 个）

**写作组**：写作台 | 总控台（Dashboard）| 拆书分析

**大纲组**：大纲 | 卷纲 | 主线 | 钩子

**资产组**：人物 | 关系图 | 世界观 | 风格 | 知识库

**质量组**：记忆 | 校验

### 数据库 Schema（36 张表）

**核心实体**：Novel → Chapter, ChapterRevision, ChapterSummary, Character, CharacterRelation, Worldview, KnowledgeAsset

**结构化创作**：Volume → ChapterOutline, Mainline, Hook, Foreshadow

**剧情引擎**：StoryState, StoryStateLog, PleasurePoint, EmotionCurve, ConsistencyIssue, ConsistencyCheckResult

**记忆与风格**：Memory, StyleProfile

**分析与流水线**：BookAnalysis → BookAnalysisSection, BookAnalysisBinding, ImitationPlan, PipelineJob → PhaseResult, AutoGenerateStatus, WritingSession

**基础设施**：RagChunk, AppSetting, AIConfig, GenerationLog, GeneralKnowledge, AssetUsageRecord, ChapterQualityLog

### LLM 提供商支持

| 提供商 | 环境变量前缀 | 默认模型 |
|--------|-------------|----------|
| DeepSeek | `DEEPSEEK_` | deepseek-chat |
| OpenAI | `OPENAI_` | gpt-5 |
| Anthropic | `ANTHROPIC_` | claude-3-5-sonnet-20241022 |
| Qwen（通义千问） | `QWEN_` | qwen-plus |
| GLM（智谱） | `GLM_` | glm-4.5-air |
| Kimi（月之暗面） | `KIMI_` | moonshot-v1-32k |
| Gemini | `GEMINI_` | gemini-2.5-flash |
| Grok | `XAI_` | grok-4 |
| MiniMax | `MINIMAX_` | MiniMax-M2.7 |
| SiliconFlow | `SILICONFLOW_` | Qwen/Qwen2.5-7B-Instruct |
| Ollama（本地） | `OLLAMA_` | llama3.2 |
| MiMo（小米） | `MIMO_` | mimo-v2.5-pro |

---

## 快速开始

### 环境要求

- Node.js ^20.19.0 || ^22.12.0 || >=24.0.0
- pnpm >= 10.6.0

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd dream-writer

# 安装依赖
pnpm install
```

### 配置

#### 方式一：图形化配置（推荐）

1. 启动项目后访问 http://localhost:5173/settings
2. 选择 LLM 提供商（DeepSeek、OpenAI、Qwen 等 12 种）
3. 填写 API Key 并测试连接
4. API Key 会加密存储到数据库

#### 方式二：环境变量配置

```bash
# 复制环境变量模板
cp server/.env.example server/.env

# 编辑 server/.env，至少配置一个 LLM 提供商的 API Key
# 例如使用 DeepSeek：
# DEEPSEEK_API_KEY=sk-xxx
# DEFAULT_LLM_PROVIDER=deepseek
```

### 初始化数据库

```bash
# 生成 Prisma Client
cd server && pnpm prisma:generate

# 同步数据库 Schema
pnpm prisma:push
```

### 启动开发服务器

```bash
# 回到项目根目录
cd ..

# 同时启动前端和后端
pnpm dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000
- 健康检查：http://localhost:3000/api/health

### 常用命令

```bash
# 开发
pnpm dev              # 同时启动 client + server
pnpm dev:client       # 仅启动前端
pnpm dev:server       # 仅启动后端

# 构建（必须按顺序）
pnpm build            # shared → server → client

# 类型检查
pnpm typecheck        # 检查全部三个包
pnpm typecheck:client # 仅检查前端
pnpm typecheck:server # 仅检查后端

# 数据库
cd server
pnpm prisma:generate  # 生成 Prisma Client
pnpm prisma:push      # 推送 Schema 到数据库
pnpm prisma:migrate   # 创建迁移
pnpm db:studio        # 打开 Prisma Studio（可视化数据库管理）
```

---

## 使用流程

### 独立创作

1. 在书架页点击"创建新书"
2. 选择"独立创作"，填写标题、类型、灵感
3. 进入作品工作台，可选择：
   - **手动创作**：直接在"写作"标签页创建章节、编写内容
   - **AI 辅助**：先用"卷纲"和"章纲"功能规划结构，再生成正文
   - **全自动**：进入 Pipeline 页，启动自动创作流水线

### 拆书仿写

1. 在创建页选择"拆书创作"
2. 输入要参考的作品标题，系统自动搜索
3. 确认搜索结果后，AI 进行 8 维结构化拆解
4. 拆解完成后生成仿写方案
5. 自动创建新作品并落库世界观、人物、主线等设定
6. 可启动 Pipeline 自动创作，或手动在工作台中创作

### Pipeline 自动创作

1. 在作品工作台进入 Pipeline 页
2. 配置参数（卷数、每卷章数、目标字数等）
3. 启动流水线，系统自动执行三个阶段
4. 每个阶段完成后可查看结果：
   - **确认**：接受当前结果，进入下一阶段
   - **重新生成**：不满意则让 AI 重新生成
   - **手动替换**：用自己的内容替换 AI 生成的结果
5. 全部完成后，可在"写作"标签页查看和编辑生成的章节

---

## 项目状态

当前处于 **轻量重建阶段**（`feat/lightweight-rebuild` 分支），从 AI-Novel 重型架构精简为最小可迭代骨架。

| 阶段 | 主题 | 状态 |
|------|------|------|
| P0 | 骨架联通（pnpm workspace + Schema + 健康检查） | ✅ 完成 |
| P1 | 小说主线（Novel/Chapter CRUD + LLM 生成 + Pipeline） | ✅ 完成（已超额） |
| P2 | 世界观/人物/资料库/风格/记忆/一致性校验 | ✅ 完成（已超额） |
| P3 | 检索增强（RAG） | ✅ 完成 |
| P4 | 打磨（错误处理/配额/日志） | 待启动 |
| P5 | 可选迁移（AI-Novel 旧库导入） | 待启动 |

> 详细路线图见 `IMPLEMENTATION_ROADMAP.md`

---

## 设计理念

> "古为今用，艺为工器"

- **视觉风格**：米黄色宣纸背景、线装书边框、古典印章、水墨色调
- **交互风格**：沉浸式创作体验，减少现代 UI 元素干扰
- **技术栈**：现代前端（React 19 + Vite 7）+ 成熟后端（Express 5 + Prisma 7）
- **AI 策略**：多提供商支持，结构化输出，四级记忆系统，AI 自评与修复

---

## 文档

- `IMPLEMENTATION_ROADMAP.md` — 分阶段实施路线图
- `docs/architecture-design.md` — 产品架构设计文档
- `docs/features-and-flow.md` — 功能与流程说明
- `docs/change-logs/` — 变更记录（YYYYMMDDHHMM 格式）

---

*"墨香纸贵，笔耕不辍，以 AI 为笔，以古风为墨，助君成书"*
