# 人物卡导入功能实现

## 变更时间
2026-06-07 12:30

## 变更原因
用户有一个 1039 行的人物卡文件，包含 5 个角色的详细设定（基础信息、品级系统、性格约束、成长线、人物关系等）。需要实现从文本文件导入人物卡的功能，避免手动逐个录入。

## 修改点

### 1. 后端服务层
- **新增文件**: `server/src/services/CharacterImportService.ts`
  - 核心类 `CharacterImportService`，提供 `importFromText(novelId, textContent)` 方法
  - 使用 LLM 解析文本内容，提取结构化人物数据
  - 支持解析：姓名、角色定位、标签、外貌、背景、动机、成长线、言语风格、知识范围、人物关系
  - 自动存储到 `Character` 表和 `CharacterRelation` 表
  - 使用 `upsert` 避免重复创建同名角色

### 2. 后端路由层
- **修改文件**: `server/src/routes/characters.ts`
  - 新增导入 `CharacterImportService`
  - 新增路由: `POST /api/characters/import/:novelId`
  - 接收 `{ text: string }` 请求体
  - 返回 `{ success: boolean, characters?: Character[], error?: string }`

### 3. 前端导入页面
- **新增文件**: `client/src/pages/CharacterImportPage.tsx`
  - 文件上传功能（支持 .txt 和 .md 格式）
  - 文本内容预览和编辑
  - 调用后端 API 进行 LLM 解析
  - 显示导入结果（卡片形式展示每个角色的基本信息）
  - 加载状态显示（"解析中..."）
  - 错误处理和 toast 提示

### 4. 前端路由配置
- **修改文件**: `client/src/router/index.tsx`
  - 新增路由: `/novel/:novelId/characters/import` → `CharacterImportPage`
  - 导入 `CharacterImportPage` 组件

### 5. 前端人物卡组件
- **修改文件**: `client/src/components/CharacterCard.tsx`
  - 新增 `useNavigate` hook
  - 在 "新建人物" 按钮旁边添加 "导入" 按钮
  - 点击导入按钮跳转到 `/novel/:novelId/characters/import` 页面

## 技术实现细节

### LLM Prompt 设计
- System Prompt: 定义解析任务和输出格式（严格 JSON）
- 识别结构: 人物卡标题、基础信息、核心人设约束、成长线、言语风格、知识范围、人物关系
- 输出格式: `{ characters: [{ name, role, tags, personality, arcDetail, speechStyle, knowledgeScope, relationships, ... }] }`
- 使用 `parseLlmJson` 工具函数提取 JSON（支持 markdown fence、直接 JSON、嵌入 JSON）

### 数据存储策略
- 基础字段直接映射到 `Character` 表
- 复杂数据（tags, personality, knowledgeScope）存储为 JSON 字符串
- 人物关系存储到 `CharacterRelation` 表，包含关系类型和阶段变化
- 使用 `prisma.character.upsert` 基于 `novelId_name` 唯一索引更新已有角色

### 错误处理
- 文件格式验证（仅允许 .txt, .md）
- 文本长度验证（至少 50 字符）
- LLM 解析失败时返回错误信息
- 前端显示具体错误提示（toast）

## 文件清单

### 新增文件
1. `server/src/services/CharacterImportService.ts` - 人物卡导入服务
2. `client/src/pages/CharacterImportPage.tsx` - 人物卡导入页面
3. `docs/change-logs/202606071230-character-import-feature.md` - 本变更记录

### 修改文件
1. `server/src/routes/characters.ts` - 新增导入路由
2. `client/src/router/index.tsx` - 新增导入页面路由
3. `client/src/components/CharacterCard.tsx` - 新增导入按钮

## 依赖关系
- 依赖现有 `LlmInvokeService` 进行 LLM 调用
- 依赖 `parseLlmJson` 工具函数解析 LLM 返回的 JSON
- 依赖 Prisma `Character` 和 `CharacterRelation` 表
- 前端依赖 `react-router-dom` 进行页面跳转

## 风险说明

### 已处理风险
1. **LLM 解析失败**: 使用 try-catch 捕获，返回明确错误信息
2. **重复角色**: 使用 `upsert` 基于 `novelId_name` 更新而非重复创建
3. **大文件处理**: 设置 `maxTokens: 12000` 支持长文本

### 潜在风险
1. **LLM 解析质量**: 复杂格式或非标准人物卡可能解析不准确
   - **缓解措施**: 提供详细的 prompt 示例，覆盖常见格式
2. **Token 消耗**: 长文本导入消耗较多 LLM tokens
   - **缓解措施**: 前端显示文本长度，用户可编辑后再导入
3. **关系提取准确性**: 动态关系（多阶段）可能部分丢失
   - **缓解措施**: 将完整 stages 信息存储在 description 字段

## 验证情况

### 待验证项
1. 使用实际文件 `/Users/lingoace/Downloads/人在阳间享福，祖先阴间打工-作品相关.txt` 测试
2. 验证能否正确解析出 5 个角色：林凡、林富贵、陆清菲、王德发、萧慕晴
3. 验证人物关系是否正确创建
4. 验证前端 UI 显示是否正常
5. 验证导入后在工作台人物卡列表中能否正常显示

### 测试步骤
1. 启动开发服务器: `pnpm dev`
2. 进入某个小说工作台
3. 点击"人物卡管理"标签
4. 点击"导入"按钮
5. 上传测试文件或粘贴文本
6. 点击"开始导入"
7. 检查解析结果和数据库记录

## 后续优化建议
1. 支持批量导入多个文件
2. 支持预览解析结果后再确认导入（当前直接导入）
3. 支持导入时选择性勾选要导入的角色
4. 支持导出人物卡为文本格式
5. 优化 LLM prompt，提高复杂格式的解析准确率
6. 添加导入历史记录功能

## 备注
- 本功能为首次实现，需要实际使用反馈后持续优化
- LLM 解析质量取决于文本格式的规范性
- 建议用户在导入前检查文本格式，确保人物卡结构清晰
