# Dream Writer 项目问题清单

> 基于全量代码审查（前端 7 页面 + 9 组件 + 25 路由 + 16 服务 + 9 LLM 文件 + 31 共享类型），按严重程度分类记录。

---

## 一、安全漏洞（P0 - 必须立即修复）

### 1.1 路径遍历漏洞
- **文件**: `server/src/routes/upload.ts` 第 109 行
- **问题**: `DELETE /file` 端点接受用户传入的 `path` 参数，直接拼接 `path.resolve(process.cwd(), filePath)` 后执行 `fs.unlinkSync`，攻击者可通过 `../../etc/passwd` 等路径删除任意文件
- **修复**: 校验 path 必须在 uploadDir 内，使用 `path.resolve` 后检查前缀

### 1.2 硬编码敏感数据
- **文件**: `server/src/routes/search.ts` 第 5-24 行
- **问题**: 硬编码了特定小说的标题别名和来源 URL（如"权宠天下"等），这些应该是配置或数据库驱动的
- **修复**: 移至配置文件或数据库

---

## 二、功能缺陷（P1 - 影响核心功能）

### 2.1 Anthropic 提供商不可用
- **文件**: `server/src/services/llm/LlmInvokeService.ts` 第 42-44 行
- **问题**: `resolveModelConfig()` 中 Anthropic 直接返回 `null`，配置了但无法使用
- **影响**: 用户配置 Anthropic API Key 后无法调用

### 2.2 正文生成非真正流式
- **文件**: `server/src/routes/ai.ts` 第 67-71 行
- **问题**: 正文生成使用"模拟流式"——先调用 LLM 生成完整内容，再分块发送给前端，不是真正的流式输出
- **影响**: 用户感知的"实时生成"有误导性，且长文本生成时首字节延迟高

### 2.3 大纲编辑按钮无功能
- **文件**: `client/src/pages/NovelWorkspace.tsx` 第 293 行
- **问题**: 大纲标签页的"编辑"按钮只有样式，没有绑定任何点击事件
- **影响**: 用户无法编辑大纲

### 2.4 保存按钮无功能
- **文件**: `client/src/pages/NovelWorkspace.tsx` 第 427 行
- **问题**: Header 的"保存"按钮未绑定任何事件处理器
- **影响**: 用户点击保存无任何反应

### 2.5 Toast 通知不可用
- **文件**: `client/src/components/ui/toast.tsx` 第 6 行
- **问题**: `Toaster` 函数返回 `null`，引入了 `sonner` 库但未渲染 `<Toaster />` 组件
- **影响**: 所有 toast 调用不会有任何视觉效果

### 2.6 世界观编辑丢失作品关联
- **文件**: `client/src/components/WorldviewEditor.tsx` 第 75 行
- **问题**: 编辑时 payload 没有包含 `novelId`，只有创建时传递，编辑保存后可能丢失作品关联
- **影响**: 编辑世界观后可能与作品解绑

### 2.7 通用知识库路由冲突
- **文件**: `server/src/routes/generalKnowledge.ts` 第 75 行 vs 第 125 行
- **问题**: `GET /stats/categories` 路由会被 `GET /:id` 路由抢先匹配（Express 按注册顺序），`stats` 会被当作 `id`
- **影响**: 分类统计 API 返回 404 或错误数据

### 2.8 角色操作越权风险
- **文件**: `server/src/routes/characters.ts` 第 76、88 行
- **问题**: 更新/删除操作没有验证 character 是否属于该 novelId，仅按 id 操作
- **影响**: 用户可通过构造请求修改/删除其他作品的人物

### 2.9 批量生成串行执行
- **文件**: `server/src/routes/batchGenerate.ts` 第 46 行
- **问题**: 批量生成章节使用 `for` 循环串行执行，每章需两次 LLM 调用（正文 + 去 AI 味）
- **影响**: 生成 20 章可能需要 40 次串行 LLM 调用，耗时极长

### 2.10 自动生成状态丢失
- **文件**: `server/src/services/AutoGenerateService.ts` 第 43 行
- **问题**: 全局状态存储在内存 Map `autoGenerateStatuses` 中，进程重启后丢失
- **影响**: 服务器重启后无法恢复自动生成进度

---

## 三、用户体验问题（P2 - 影响使用体验）

### 3.1 多处使用原生弹窗
- **涉及文件**:
  - `NovelForm.tsx`: `alert()` 错误提示
  - `VolumeEditor.tsx`: `prompt()` 输入数量
  - `GeneralKnowledge.tsx`: `alert()` 输入验证
  - `Home.tsx`: `prompt()` 输入章节标题
- **问题**: 与整体古风 UI 风格严重不一致
- **修复**: 统一使用自定义 Modal/Dialog 组件

### 3.2 书架窗口 Resize 后布局不更新
- **文件**: `client/src/pages/BookShelf.tsx`
- **问题**: `booksPerRow` 在每次渲染时通过 `window.innerWidth` 计算，但没有 `resize` 事件监听
- **影响**: 用户调整窗口大小后书架布局错乱

### 3.3 拆书轮询阻塞 UI
- **文件**: `client/src/pages/AnalyzeCreate.tsx` 第 69-75 行
- **问题**: 轮询等待拆书完成使用 `while` 循环 + `setTimeout`，阻塞了 UI 且没有取消机制
- **影响**: 用户无法中途停止拆书操作

### 3.4 一致性校验结果存储在 localStorage
- **文件**: `client/src/components/ConsistencyPanel.tsx`
- **问题**: 校验结果持久化到 `localStorage`，换浏览器或清除缓存会丢失
- **影响**: 用户的校验历史不可靠

### 3.5 人物标签无过滤功能
- **文件**: `client/src/components/CharacterCard.tsx`
- **问题**: 角色标签区域只做展示效果（显示计数），点击标签并没有实际过滤功能
- **影响**: 用户期望点击标签能筛选对应角色

### 3.6 记忆重要程度显示截断
- **文件**: `client/src/components/MemoryPanel.tsx`
- **问题**: 重要程度用星号显示（`"★".repeat(Math.min(memory.importance, 5))`），但 `importance` 范围是 1-10，5 星以上信息丢失
- **影响**: 无法区分重要程度 6-10 的记忆

### 3.7 知识条目内容截断无展开
- **文件**: `client/src/pages/GeneralKnowledge.tsx`
- **问题**: 知识条目内容截断为 200 字符，没有展开/收起功能
- **影响**: 用户无法查看完整内容

### 3.8 风格提取结果未翻译
- **文件**: `client/src/components/StylePanel.tsx`
- **问题**: 从文本学习风格后，`narrativePov`、`tense` 等字段直接显示英文值（如 "third_person"），没有翻译为中文
- **影响**: 用户看到英文枚举值而非中文标签

---

## 四、死代码（P2 - 增加维护负担）

### 4.1 未使用的页面
- **文件**: `client/src/pages/Home.tsx`
- **问题**: 旧版首页/工作台，未被路由引用，是死页面
- **关联**: `workbench.css` 也被此页面引用，同为废弃样式

### 4.2 未使用的组件
- **文件**: `client/src/components/AncientPaper.tsx`
- **问题**: 导出的 5 个组件（AncientPaper、AncientCard、SealStamp、AncientButton、AncientInput）未被任何页面使用
- **关联**: `ancient-theme.css` 被此组件引入，同为废弃样式

### 4.3 未使用的通用组件
- **文件**: `client/src/components/ui/CommonComponents.tsx`
- **问题**: 6 个组件（LoadingSpinner、ProgressBar、StatusBadge、Tooltip、ConfirmDialog、EmptyState）全部未被引用

### 4.4 未使用的 Hooks
- **文件**: `client/src/hooks/useCommon.ts`
- **问题**: 4 个 Hook（useLoading、useList、useNotification、useForm）全部未被使用

### 4.5 未使用的共享类型
- **文件**: `shared/src/types/` 下 31 个类型文件
- **问题**: 客户端未通过 `@dream-writer/shared` 导入任何共享类型，大量业务类型（AgentRun、CreativeHubThread、UnifiedTaskSummary 等）在 Prisma 中无对应模型

---

## 五、架构问题（P3 - 影响可维护性）

### 5.1 超大文件
| 文件 | 行数 | 建议 |
|------|------|------|
| `NovelWorkspace.tsx` | 2353 | 拆分为 5 个独立子组件文件 |
| `PipelineService.ts` | 1491 | 按阶段拆分为独立 service |
| `novel.ts`（shared） | 979 | 按职责拆分类型文件 |
| `chapterRuntime.ts`（shared） | 758 | 拆分 Zod schema |
| `AIService.ts` | 817 | 按功能拆分 |
| `novelDirector.ts`（shared） | 568 | 拆分常量和接口 |
| `worldWizard.ts`（shared） | 463 | 拆分种子类型和工具函数 |

### 5.2 样式系统混乱
- **问题**: 存在三套并行样式系统
  - `variables.css` + `workbench-modern.css`（现代风格）
  - `ancient-theme.css` + `layout.css`（古风主题）
  - `workbench.css`（旧版工作台）
- **影响**: CSS 变量命名不统一（`--bg-primary` vs `--paper-warm` vs `--paper`），全局重置重复 3 次，组件定义重复
- **修复**: 统一为一套变量系统，废弃旧版样式

### 5.3 样式方案不统一
- **问题**: 有的页面用 CSS 类（GeneralKnowledge），有的全内联（BookShelf 660 行内联样式）
- **影响**: 样式无法复用，修改困难

### 5.4 重复代码
- `AnalyzeCreate.tsx` 和 `NovelWorkspace` 中的 `AnalysisPanel` 功能高度重叠
- 每个页面自行管理 loading/notice/form 状态，`CommonComponents.tsx` 和 `useCommon.ts` 完全未使用
- `parseJson` 容错函数在 PipelineService、ImitationPlanService、AnalysisToNovelService 中各有一份

### 5.5 共享类型与 Prisma Schema 不一致
- Prisma `Novel` 有 `inspiration`、`genre`、`coverImage`；共享类型没有
- Prisma `Character` 结构简单；共享类型有完整角色弧线和心理模型
- Prisma 没有独立的 `World` 模型；共享类型有完整的 World 实体
- 大量共享类型（AgentRun、CreativeHubThread 等）在 Prisma 中无对应表

### 5.6 前端未使用共享类型包
- **问题**: 客户端没有通过 `@dream-writer/shared` 导入任何类型，所有类型在前端自行定义或使用 `any`
- **影响**: 前后端类型不同步，修改 shared 后前端无感知

---

## 六、代码质量问题（P3）

### 6.1 `any` 类型泛滥
- **涉及文件**: NovelWorkspace（`chapters: any[]`、`mainlines: any[]`）、mainlines.ts、hooks.ts、analysisToNovel.ts 等
- **影响**: TypeScript 类型检查形同虚设

### 6.2 JSON 解析依赖正则
- **涉及文件**: AIService.ts、novels.ts、BookAnalysisService.ts 等
- **问题**: 大量使用 `result.match(/\{[\s\S]*\}/)` 或 `result.match(/\[[\s\S]*\]/)` 提取 JSON
- **影响**: 正则匹配可能误中，且不处理嵌套括号

### 6.3 错误静默吞掉
- **涉及文件**:
  - `novels.ts` 第 433 行: 标题生成失败 `catch(e) {}`
  - `novels.ts` 第 554 行: 知识库保存失败静默
  - `PipelineService.ts` 第 1175 行: 持久化失败 `console.warn`
  - `AutoGenerateService.ts` 第 201 行: JSON 解析失败 `console.error`

### 6.4 输入校验不一致
- **有 Zod 校验**: novels.ts、characters.ts、volumes.ts
- **无校验**: mainlines.ts、hooks.ts、generalKnowledge.ts、ai.ts、aiEnhanced.ts、pipeline.ts
- **影响**: 部分 API 端点可接受任意格式输入

### 6.5 兜底内容硬编码
- **涉及文件**:
  - `PipelineService.ts`: `buildFallbackWorldview` 硬编码古言悬疑世界观
  - `AnalysisToNovelService.ts`: `getDefaultData` 返回都市玄幻默认数据
  - `BookAnalysisService.ts`: `fallbackSection` 泛化兜底内容
- **影响**: AI 生成失败时返回与用户作品类型不匹配的默认内容

### 6.6 缺少全局错误边界
- **问题**: 前端没有 React Error Boundary，任何组件渲染错误会导致整个页面白屏
- **修复**: 在 AppLayout 或路由层级添加 ErrorBoundary

### 6.7 API 封装缺少关键能力
- **文件**: `client/src/lib/api.ts`
- **问题**:
  - 没有 baseURL 配置（依赖开发代理）
  - 没有认证/鉴权机制
  - 没有请求拦截器
  - 不支持 FormData（文件上传绕过封装）
  - 没有 AbortController 支持
  - 没有重试机制

---

## 七、性能问题（P3）

### 7.1 N+1 查询
- **文件**: `server/src/services/NovelService.ts` 第 140-145 行
- **问题**: `deleteChapter` 删除后逐个更新后续章节序号，O(n) 数据库操作

### 7.2 同步文件操作
- **文件**: `server/src/routes/upload.ts` 第 138 行
- **问题**: `fs.readdirSync` 同步读取目录，大量文件时阻塞事件循环

### 7.3 记忆上下文频繁查询
- **文件**: `server/src/services/StoryStateService.ts` 第 262 行
- **问题**: `buildStoryContext` 每次调用都查询数据库并分析，无缓存

### 7.4 知识库模糊查询
- **文件**: `server/src/services/KnowledgeSearchService.ts` 第 10、29 行
- **问题**: 使用 `contains` 做模糊查询，大数据量时全表扫描

### 7.5 Pipeline 轮询频繁重建定时器
- **文件**: `client/src/pages/PipelinePage.tsx`
- **问题**: `setInterval` 依赖 `pipeline?.status`，每次数据更新导致定时器清除/重建

---

## 八、类型与 Prisma Schema 同步问题

### 8.1 共享类型是"理想化领域模型"
共享类型（`shared/src/types/`）定义了丰富的领域模型（Agent、CreativeHub、UnifiedTask 等），但 Prisma schema 只有 23 张轻量表。两者之间存在显著差距：

| 共享类型 | Prisma 对应 | 差距 |
|----------|------------|------|
| Novel（979 行类型文件） | Novel（~15 字段） | 共享类型有商业标签、写作模式等 |
| Character（完整弧线） | Character（基础字段） | 共享类型有心理模型、成长线 |
| World（6 层结构） | Worldview（扁平字段） | Prisma 无独立 World 模型 |
| AgentRun/AgentStep | 无对应表 | 纯前端类型 |
| CreativeHubThread | 无对应表 | 纯前端类型 |
| StyleProfile（丰富） | StyleProfile（简化） | 字段数量差距大 |

### 8.2 建议
- 明确 shared 类型的定位：是"数据库映射层"还是"前端展示层"
- 如果是展示层，应在 API 响应时做 DTO 转换
- 如果是映射层，应同步更新 Prisma schema

---

## 九、问题统计

| 类别 | P0 | P1 | P2 | P3 | 总计 |
|------|----|----|----|----|------|
| 安全漏洞 | 2 | - | - | - | 2 |
| 功能缺陷 | - | 10 | - | - | 10 |
| 用户体验 | - | - | 8 | - | 8 |
| 死代码 | - | - | 5 | - | 5 |
| 架构问题 | - | - | - | 6 | 6 |
| 代码质量 | - | - | - | 7 | 7 |
| 性能问题 | - | - | - | 5 | 5 |
| **总计** | **2** | **10** | **13** | **18** | **43** |

---

## 十、优先修复建议

### 立即修复（P0）
1. `upload.ts` 路径遍历漏洞 — 添加路径校验
2. `search.ts` 移除硬编码数据

### 近期修复（P1）
1. 启用 Anthropic 提供商（或从配置中移除）
2. 修复大纲编辑和保存按钮
3. 启用 sonner Toast 或移除依赖
4. 修复世界观编辑丢失 novelId
5. 修复 generalKnowledge 路由顺序
6. 修复角色操作越权

### 持续优化（P2-P3）
1. 清理死代码（Home.tsx、AncientPaper.tsx、CommonComponents.tsx、useCommon.ts）
2. 统一样式系统
3. 拆分超大文件
4. 统一输入校验（全部使用 Zod）
5. 前端接入共享类型包
6. 添加 Error Boundary
