# Dream Writer 项目描述

## 项目定位

Dream Writer 是一个 **AI 驱动的小说创作平台**，支持"拆书仿写"和"独立创作"两种模式，帮助作者从参考作品分析到完整小说生成的全流程自动化。

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React 19 + Vite 7)              │
│  BookShelf → CreateWork → AnalyzeCreate → NovelWorkspace    │
│  PipelinePage | GeneralKnowledge | Settings | GuidePage     │
└─────────────────────────────────────────────────────────────┘
                              │ HTTP/SSE
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express 5 + Prisma 7)            │
│  25 API Routes │ 16 Services │ 9 LLM Providers │ SQLite     │
└─────────────────────────────────────────────────────────────┘
```

## 核心功能模块

### 1. 拆书仿写流程
```
标题输入 → 多源搜索 → 内容提取 → 8维分析 → 仿写计划 → 自动创作
    │           │           │           │           │           │
    ▼           ▼           ▼           ▼           ▼           ▼
AnalyzeCreate  search.ts  extractContent  BookAnalysis  Imitation  Pipeline
               (5站点+Sogou)              Service       PlanService  Service
```

### 2. 独立创作流程
```
参数配置 → 大纲生成 → 卷章规划 → 一致性检查 → 批量写作
    │           │           │           │           │
    ▼           ▼           ▼           ▼           ▼
NovelForm   AIService   VolumeEditor  DirectorService  AutoGenerate
```

### 3. 知识管理系统
- **知识资产** (KnowledgeAsset): 小说级结构化知识
- **通用知识库** (GeneralKnowledge): 全局共享知识
- **记忆系统** (Memory): 上下文记忆压缩
- **风格档案** (StyleProfile): 写作风格配置

### 4. 自动化流水线 (PipelineService)
```
Phase 1: 大纲生成 → 用户审阅
Phase 2: 资产构建 → 用户审阅
Phase 3: 章节规划 → 用户审阅
Phase 4: 一致性检查 → 用户审阅
Phase 5: 批量写作 → 最终输出
```

## 数据库模型 (23 表)

| 分类 | 表名 | 说明 |
|------|------|------|
| 核心 | Novel, Chapter, Volume | 小说主体结构 |
| 核心 | Character, Worldview | 人物世界观 |
| 核心 | KnowledgeAsset, GeneralKnowledge | 知识资产 |
| 创作 | Mainline, Hook, Foreshadow | 主线/钩子/伏笔 |
| 创作 | Memory, StyleProfile, StoryState | 记忆/风格/状态 |
| 创作 | PleasurePoint, EmotionCurve | 爽点/情绪曲线 |
| 分析 | BookAnalysis, BookAnalysisSection | 拆书分析 |
| 分析 | ImitationPlan, BookAnalysisBinding | 仿写计划 |
| 运维 | PipelineJob, PhaseResult, ConsistencyIssue | 流水线/一致性 |
| 配置 | AppSetting, GenerationLog, RagChunk | 系统配置 |

## 当前状态 (2026-05-15)

| 模块 | 完成度 | 说明 |
|------|--------|------|
| 骨架联通 (P0) | ✅ 100% | pnpm workspace + Schema + health check |
| 小说主线 (P1) | ✅ 120% | CRUD + LLM 生成 + 流水线 |
| 世界观/人物 (P2) | ✅ 100% | 完整支持 |
| 拆书仿写 | ✅ 90% | 搜索数据源是瓶颈 |
| RAG 检索 (P3) | ❌ 0% | 仅有关键词匹配 |
| 错误处理 (P4) | ❌ 0% | 基础错误处理 |

## 关键技术决策

1. **LLM 多 Provider**: 支持 12 个 Provider (deepseek/openai/anthropic/qwen/glm/kimi/gemini/mimo 等)
2. **BYOK 模式**: 用户可配置自己的 API Key
3. **SQLite**: 轻量级，适合单机部署
4. **SSE 流式**: AI 生成采用 Server-Sent Events
5. **CSS 变量主题**: 古风主题系统，易于定制

## 已知瓶颈

1. **数据源依赖硬编码**: 搜索只覆盖 5 个小说站点
2. **网页抓取不可靠**: 反爬机制导致高失败率
3. **RAG 未实现**: 知识检索仅关键词匹配
4. **无文件导入**: 不支持 PDF/EPUB 上传

## 下一步方向

1. **突破数据源**: 接入通用搜索 API + 支持文本粘贴
2. **实现 RAG**: 向量数据库 + 嵌入模型 + 语义检索
3. **增强创作**: 多轮迭代 + 风格校验 + 反馈模拟
