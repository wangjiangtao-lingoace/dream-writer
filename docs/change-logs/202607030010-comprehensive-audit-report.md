# Dream Writer 系统综合审计报告

## 审计概述

基于 6 个维度的并行深度分析，覆盖安全、性能、API 设计、AI Pipeline、前端架构、数据完整性。

## 审计维度与方法论

| # | 维度 | 方法论 | Agent |
|---|------|--------|-------|
| 1 | 安全审计 | OWASP ASVS v5.0 | Agent-1 |
| 2 | 性能与数据库 | Prisma 最佳实践 + SQLite 优化 | Agent-2 |
| 3 | API 设计 | Express 架构规范 + RESTful | Agent-3 |
| 4 | AI Pipeline | LLM 应用架构 + Prompt 工程 | Agent-4 |
| 5 | 前端架构与 UX | React 最佳实践 + Accessibility | Agent-5 |
| 6 | 数据完整性 | 数据库设计规范 + 事务管理 | Agent-6 |

---

## P0 级问题汇总（必须立即修复）

### 安全类
1. **路径遍历漏洞** — `upload.ts:140-156`，`DELETE /api/upload/file?path=../../etc/passwd` 可删除任意文件
2. **完全无认证** — 所有 API 端点公开，任何人可删除数据/消耗 AI 配额/获取 API Key
3. **API Key 明文暴露** — `GET /api/ai-config/default` 返回解密后的 API Key

### Pipeline 类
4. **LAYER1 全局不变量占位符未替换** — `contextAssembler.ts` 拼接时 `{{genre}}` 等占位符未被替换，LLM 看到字面文本
5. **LLM fetch 无超时** — `LlmInvokeService.doCompleteText` 未设置 `AbortSignal.timeout()`，可无限等待
6. **AI 味词表过度激进** — 包含大量正常中文词汇（"不禁"、"仿佛"、"于是"等），1% 阈值导致频繁误判重试

### 数据类
7. **全项目零事务** — 6 个多表操作场景无 `$transaction` 保护（deleteChapter、publishToKnowledge、startPipeline 等）
8. **Memory.importance 衰减失效** — Float 运算写入 Int 字段，小数被截断，衰减逻辑不生效
9. **PipelineService 竞态条件** — findUnique 检查 + upsert 之间无原子性，两个并发请求可同时通过检查

### 前端类
10. **顶层无 ErrorBoundary** — `main.tsx` 未包裹 ErrorBoundary，组件崩溃导致白屏

---

## P1 级问题汇总（应该修复）

### 安全类
11. **输入验证缺失** — 30+ 个 POST/PUT 路由无 Zod 验证（ai.ts、pipeline.ts、mainlines.ts、hooks.ts 等）
12. **错误信息泄露** — 多个路由直接 `res.status(500).json({ error: error.message })` 返回内部错误
13. **无 CSRF 防护** — 无 CSRF Token、无 SameSite Cookie、无 Origin 检查
14. **无 API 限流** — API 端点无速率限制，攻击者可暴力请求

### 性能类
15. **MaterialImportService N+1 查询** — 循环内 upsert，10 个 hooks + 10 assets + 10 constraints = 90 次 DB 调用
16. **MemoryCompressionService 三重全量扫描** — 每写一章触发 3 次 Memory 全量加载
17. **SQLite 未启用 WAL** — 读写不能并发，Pipeline 运行期间 API 响应变慢
18. **缺失索引** — Chapter 缺 `(novelId, source)`、`(novelId, sourceType)` 索引

### API 类
19. **错误响应格式不一致** — 3 种格式混用（errorHandler / 直接 catch / 自定义 ZodError）
20. **DELETE 响应不一致** — 有的返回 `data: null`，有的返回 `message: "已删除"`
21. **POST 创建状态码不一致** — 大部分 201，但 mainlines/hooks/pipeline 返回 200

### Pipeline 类
22. **伏笔回收检测不一致** — `consistencyPhase.ts` 用 `includes`，`postProcessing.ts` 用模糊匹配
23. **completeText 吞掉所有错误** — catch 中返回 null，丢失错误信息
24. **伏笔过期逻辑过于简单** — 统一 50 章过期，不区分重要度
25. **StoryState 状态流转过于简化** — 只有 3 条线性规则，无回退机制

### 前端类
26. **状态管理混乱** — BookShelf/NovelWorkspace/PipelinePage 大量 useState 应改用 TanStack Query
27. **PipelinePage 超大组件** — 1225 行，应拆分为 5+ 子组件
28. **海量内联样式** — PipelinePage 800+ 行内联 style，无法复用/响应式

### 数据类
29. **多个外键缺失** — GenerationLog、ConsistencyIssue、Hook、Memory 的 chapterId 无外键约束
30. **ConsistencyIssue.chapterId 无外键** — 删除 Chapter 后产生悬空引用

---

## P2 级问题汇总（建议改进）

### 安全类
31. 加密算法应从 AES-256-CBC 升级为 AES-256-GCM
32. JSON Body 限制 10MB 过大，应降至合理值
33. Helmet 应显式配置 CSP、HSTS

### 性能类
34. Character.knowledgeScope JSON 应建表
35. Hook.relatedForeshadow 应改外键
36. SSE 轮询应优化（非 writing 阶段跳过 chapter 查询）
37. 前端路由懒加载（NovelWorkspace、PipelinePage）

### API 类
38. 路由文件过大（novels.ts 953行、workspace.ts 616行）应拆分
39. 统一子资源路径设计
40. novels.ts 流式生成端点应改为标准 SSE

### Pipeline 类
41. ContextAssembler 无 token 预算硬限制
42. 记忆加载无章节相关性过滤
43. Anthropic provider API 兼容性确认
44. Prompt 注入防护

### 前端类
45. PROVIDERS 常量重复定义
46. Modal 缺少 focus trap 和 aria 属性
47. 全项目仅 5 处 aria 属性，无障碍几乎为零
48. 无 404 页面

### 数据类
49. 状态字段应改用 Prisma enum
50. WritingSession.date 应改为 DateTime
51. 迁移策略应从 db push 改为正式 migrate

---

## 修复优先级建议

### 立即修复（安全+数据一致性）
- 修复路径遍历漏洞（upload.ts）
- 添加基础认证中间件
- 关键多表操作添加事务（deleteChapter、startPipeline）
- 修复 LAYER1 占位符替换
- 添加 LLM fetch 超时
- 精简 AI 味词表

### 短期修复（1-2天）
- 统一错误响应格式
- 补充关键路由的 Zod 验证
- 修复伏笔回收检测一致性
- MemoryCompressionService 合并查询
- SQLite 启用 WAL
- 顶层添加 ErrorBoundary
- 添加缺失索引

### 中期优化（1周）
- PipelinePage 组件拆分
- 前端状态管理迁移到 TanStack Query
- 内联样式迁移为 CSS
- 路由文件拆分
- 完善 StoryState 状态机
