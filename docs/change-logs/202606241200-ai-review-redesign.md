# AI 评审系统重新设计 + 章节润色功能

## 变更原因
1. 用户反馈"本章评分也没有"，要求将评分系统升级为"商业编辑 + 番茄/起点读者模拟器 + 连载运营分析师"的综合评审体系
2. 用户要求增加章节润色功能，支持根据评审报告润色和自定义润色要求两种模式

## 修改点

### 1. 后端评审 API 重新设计
- **GET 端点**：改为读取已存储的评审结果，支持新版 `chapter_review` 格式和旧版 `chapter_score` 兼容
- **POST 端点**：新增 LLM 评审生成端点，使用综合评审 prompt
  - 加载章节内容、前后章节上下文、大纲、章纲、角色信息
  - 使用"商业编辑 + 读者模拟 + 运营分析"三重视角
  - 返回结构化评审数据：综合评分、五维评分、读者反馈、商业潜力、优缺点、具体建议

### 2. 评审 Prompt 设计
综合评审 prompt 包含：
- **五维评分**：钩子效果、剧情推进、人物塑造、文笔质量、爽感指数
- **三类读者反馈**：快节奏党、角色党、设定党
- **商业潜力评估**：留存率预估、付费转化分析
- **具体建议**：问题类型、严重程度、修改建议

### 3. 前端展示升级
- **AIReview 类型**：从 `{score, suggestions}` 扩展为完整评审结构
- **AssetPanel 组件**：
  - 显示综合评分和五维评分雷达
  - 显示三类读者的真实反馈
  - 显示优缺点分析
  - 显示商业潜力评估
  - 显示具体修改建议（按严重程度分级）
  - 新增"生成评审"和"重新评审"按钮

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| server/src/routes/workspace.ts | 重写 ai-review 端点，新增 POST LLM 评审生成，新增章节润色端点 |
| client/src/components/workspace/types.ts | 更新 AIReview 类型定义 |
| client/src/components/workspace/AssetPanel.tsx | 更新评审展示 UI，新增生成按钮 |
| client/src/components/workspace/WorkspaceWriteLayout.tsx | 传递新 props，新增润色工具栏和预览功能 |
| client/src/components/workspace/PolishDialog.tsx | 新增润色对话框组件 |
| client/src/pages/NovelWorkspace.tsx | 新增 handleGenerateReview 和 handlePolish 函数 |

## 风险说明
- POST 端点会调用 LLM，增加 token 消耗
- 评审结果存储在 Memory 表，需定期清理旧数据
- 润色功能每章会增加 1 次 LLM 调用

## 验证情况
- [x] pnpm typecheck:server 通过
- [x] pnpm typecheck:client 通过
- [ ] 需启动服务验证 API 响应格式
- [ ] 需验证前端评审展示和润色功能效果
