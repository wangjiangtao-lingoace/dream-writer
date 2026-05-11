# 核心代码迁移计划
## 从 AI-Novel-Writing-Assistant 到 Dream Writer 的完整功能迁移

> "古法新用，功能完移"

---

## 📊 迁移现状分析

### ✅ 已完成项目初始化
- [x] 项目结构创建 (空的壳层)
- [x] 古风UI设计系统
- [x] 文档体系建立
- [x] Git仓库配置

### ⚠️ 核心功能缺失
- [ ] Agent运行时系统 (agents/)
- [ ] 提示词治理系统 (prompting/)
- [ ] 业务逻辑服务 (services/novel/)
- [ ] 数据库定义 (prisma schema)
- [ ] 共享类型定义 (shared/types/)
- [ ] API路由层 (routes/)

---

## 🎯 迁移策略

### 原则
1. **保持功能完整**: 100%迁移核心AI能力
2. **架构适配**: 适配新的Monorepo结构
3. **UI分离**: 业务逻辑和UI完全分离
4. **渐进迁移**: 按优先级分阶段迁移

### 技术方案
```typescript
// 迁移架构设计
const MIGRATION_ARCHITECTURE = {
  source: 'AI-Novel-Writing-Assistant',
  target: 'dream-writer',
  
  strategy: {
    backend: '直接复用 + 路径适配',
    frontend: '古风UI重写 + 逻辑复用',
    shared: '完整迁移 + 类型清理'
  },
  
  preservation: {
    ai_core: '100%保留',
    business_logic: '100%保留',
    database_schema: '完整迁移',
    type_definitions: '完整迁移'
  }
};
```

---

## 🚀 Phase 1: 基础架构迁移 (第1周)

### T1-1: 共享类型定义迁移
**来源**: `shared/types/*.ts`
**目标**: `dream-writer/shared/src/`
**复杂度**: 低
**预估工时**: 4h

**迁移清单**:
- [ ] title.ts - 标题相关类型
- [ ] novelFraming.ts - 小说定位类型
- [ ] novelExport.ts - 导出功能类型
- [ ] chapterLengthControl.ts - 章节长度控制类型
- [ ] image.ts - 图片相关类型
- [ ] knowledge.ts - 知识库类型
- [ ] chapterRuntime.ts - 章节运行时类型
- [ ] storyWorldSlice.ts - 故事世界切片类型
- [ ] pagination.ts - 分页类型
- [ ] payoffLedger.ts - 伏笔账本类型

### T1-2: 数据库Schema迁移
**来源**: `server/src/prisma/schema.prisma`
**目标**: `dream-writer/server/prisma/schema.prisma`
**复杂度**: 中
**预估工时**: 6h

**迁移内容**:
- [ ] 完整复制Prisma schema
- [ ] 数据库模型定义
- [ ] 关系定义
- [ ] 索引配置
- [ ] 枚举类型

### T1-3: 基础配置文件迁移
**来源**: 各package.json和配置文件
**目标**: dream-writer对应配置
**复杂度**: 低
**预估工时**: 2h

**迁移内容**:
- [ ] server/package.json (后端依赖)
- [ ] client/package.json (前端依赖)
- [ ] tsconfig配置文件
- [ ] 环境变量示例

---

## 🤖 Phase 2: AI核心能力迁移 (第2-3周)

### T2-1: Agent运行时系统
**来源**: `server/src/agents/`
**目标**: `dream-writer/server/src/agents/`
**复杂度**: 高
**预估工时**: 16h

**核心模块**:
- [ ] runtime/ - Agent运行时核心
- [ ] tools/ - 工具定义和实现
- [ ] graphs/ - LangGraph工作流定义
- [ ] state/ - Agent状态管理

**工具系统**:
- [ ] writeTools.ts - 写作工具
- [ ] novelReadTools.ts - 小说读取工具
- [ ] worldTools.ts - 世界观工具
- [ ] characterTools.ts - 角色工具
- [ ] knowledgeTools.ts - 知识库工具
- [ ] taskTools.ts - 任务工具

### T2-2: 提示词治理系统
**来源**: `server/src/prompting/`
**目标**: `dream-writer/server/src/prompting/`
**复杂度**: 中
**预估工时**: 12h

**核心模块**:
- [ ] registry.ts - 提示词注册表
- [ ] prompts/agent/ - Agent提示词
- [ ] prompts/novel/ - 小说提示词
- [ ] prompts/character/ - 角色提示词
- [ ] prompts/world/ - 世界观提示词

### T2-3: LLM调用层
**来源**: `server/src/llm/`
**目标**: `dream-writer/server/src/llm/`
**复杂度**: 中
**预估工时**: 8h

**核心模块**:
- [ ] structuredInvoke.ts - 结构化调用
- [ ] connectivity.ts - 连通性检查
- [ ] multiProvider.ts - 多供应商支持
- [ ] streamingResponse.ts - 流式响应

### T2-4: LangChain集成
**来源**: 现有项目依赖
**目标**: dream-writer依赖配置
**复杂度**: 中
**预估工时**: 6h

**迁移内容**:
- [ ] LangChain依赖配置
- [ ] LangGraph依赖配置
- [ ] Agent图编排集成
- [ ] 工具调用链路

---

## 🏗️ Phase 3: 业务逻辑层迁移 (第4-6周)

### T3-1: 小说核心服务
**来源**: `server/src/services/novel/`
**目标**: `dream-writer/server/src/services/novel/`
**复杂度**: 高
**预估工时**: 20h

**核心服务**:
- [ ] NovelCoreService.ts - 小说核心服务
- [ ] NovelContextService.ts - 上下文服务
- [ ] NovelGenerationService.ts - 生成服务
- [ ] NovelDraftOptimizeService.ts - 草稿优化服务
- [ ] NovelContinuationService.ts - 续写服务

### T3-2: 自动导演系统
**来源**: `server/src/services/novel/director/`
**目标**: `dream-writer/server/src/services/novel/director/`
**复杂度**: 高
**预估工时**: 16h

**核心服务**:
- [ ] DirectorService.ts - 导演服务
- [ ] DirectorProgressTracker.ts - 进度追踪
- [ ] DirectorPlanning.ts - 导演规划
- [ ] DirectorStateMachine.ts - 状态机

### T3-3: 章节执行系统
**来源**: `server/src/services/novel/chapter*/`
**目标**: `dream-writer/server/src/services/novel/chapter*/`
**复杂度**: 中
**预估工时**: 14h

**核心服务**:
- [ ] ChapterExecutionService.ts - 章节执行
- [ ] ChapterEditorService.ts - 章节编辑
- [ ] ChapterAuditService.ts - 章节审校
- [ ] QualityRepairService.ts - 质量修复

### T3-4: 角色和世界观
**来源**: `server/src/services/novel/character*`, `world*`
**目标**: `dream-writer/server/src/services/`
**复杂度**: 中
**预估工时**: 12h

**核心服务**:
- [ ] CharacterDynamicsService.ts - 角色动态
- [ ] CharacterDynamicsMutationService.ts - 角色变更
- [ ] CharacterDynamicsQueryService.ts - 角色查询
- [ ] WorldService.ts - 世界观服务

### T3-5: 知识库和RAG
**来源**: `server/src/services/knowledge/`, `rag*/`
**目标**: `dream-writer/server/src/services/`
**复杂度**: 高
**预估工时**: 14h

**核心服务**:
- [ ] KnowledgeService.ts - 知识服务
- [ ] RAGService.ts - RAG检索服务
- [ ] EmbeddingService.ts - 向量化服务
- [ ] Qdrant集成服务

### T3-6: 其他核心服务
**来源**: `server/src/services/` 其他目录
**目标**: `dream-writer/server/src/services/`
**复杂度**: 低
**预估工时**: 8h

**核心服务**:
- [ ] state/ - 状态管理服务
- [ ] styleEngine/ - 写法引擎
- [ ] bootstrap/ - 启动引导服务

---

## 🛣️ Phase 4: API路由层迁移 (第7周)

### T4-1: API路由迁移
**来源**: `server/src/routes/*.ts`
**目标**: `dream-writer/server/src/routes/`
**复杂度**: 中
**预估工时**: 12h

**路由模块**:
- [ ] novel*.ts - 小说相关路由 (约15个文件)
- [ ] character.ts - 角色路由
- [ ] world*.ts - 世界观路由
- [ ] knowledge.ts - 知识库路由
- [ ] agent*.ts - Agent相关路由
- [ ] settings路由 - 设置相关路由

---

## 🎨 Phase 5: 古风化适配层 (第8周)

### T5-1: 古风化组件包装层
**目标**: 为迁移的业务逻辑创建古风UI适配
**复杂度**: 中
**预估工时**: 16h

**适配内容**:
- [ ] 创建古风化包装组件
- [ ] 设计组件古风样式映射
- [ ] 实现古风反馈系统
- [ ] 适配古风动画效果

### T5-2: 古风化AI交互
**目标**: 将AI响应和交互古风化
**复杂度**: 中
**预估工时**: 10h

**古风化内容**:
- [ ] AI提示词古风化
- [ ] 错误信息诗意化
- [ ] 成功消息古文化
- [ ] 进度描述典雅化

---

## 📊 迁移工作量评估

### 总体统计
- **总文件数**: 约200+个核心文件
- **总代码行数**: 约15,000+行
- **总模块数**: 20+个主要服务模块
- **预估总工时**: 约180小时 (约23个工作日)

### 分阶段工作量
- **Phase 1**: 12小时 (基础架构)
- **Phase 2**: 42小时 (AI核心)
- **Phase 3**: 82小时 (业务逻辑)
- **Phase 4**: 12小时 (API路由)
- **Phase 5**: 26小时 (古风化)

---

## 🎯 迁移策略详解

### 复用策略
```typescript
// 核心原则：100%复用原代码
const REUSE_STRATEGY = {
  backend: {
    services: '直接复制，路径适配',
    routes: '直接复制，路径适配',
    agents: '直接复制，路径适配',
    prompting: '直接复制，路径适配'
  },
  
  shared: {
    types: '直接复制，清理无用引用',
    index: '重新导出，适配新结构'
  },
  
  adaptation: '古风UI层完全重写，业务逻辑保持不变'
};
```

### 路径适配
```typescript
// 路径映射规则
const PATH_MAPPING = {
  // 原路径 -> 新路径
  'shared/types': 'shared/src/types',
  'server/src/services': 'server/src/services',
  'server/src/routes': 'server/src/routes',
  'server/src/agents': 'server/src/agents',
  'server/src/prompting': 'server/src/prompting',
  'server/src/llm': 'server/src/llm',
  'server/src/prisma': 'server/prisma'
};
```

---

## 🚀 立即开始迁移

### 第一批迁移任务 (建议现在开始)
1. **T1-1**: 共享类型定义迁移 (4h)
2. **T1-2**: 数据库Schema迁移 (6h)
3. **T2-1**: Agent运行时系统 (16h)

### 迁移执行方式
```bash
# 开始迁移工作
cd /Users/lingoace/IdeaProjects/dream-writer

# 创建迁移脚本 (可以半自动化)
# 我可以帮你创建迁移脚本和执行
```

---

## 📋 质量保证

### 迁移质量标准
- **功能完整**: 100%迁移核心AI能力
- **代码质量**: 保持原代码质量水平
- **架构适配**: 正确适配新Monorepo结构
- **古风分离**: UI和业务逻辑完全分离

### 验证标准
- [ ] 编译通过 (TypeScript无错误)
- [ ] 功能验证 (核心功能正常工作)
- [ ] 集成测试 (各模块集成正常)
- [ ] 性能验证 (无明显性能下降)

---

**迁移目标**: 从"空壳"到"完整功能"的AI小说创作平台  
**预计时间**: 8周完成完整迁移  
**当前状态**: 计划制定完成，等待开始执行

需要我现在开始执行实际的代码迁移吗？ 🚀
