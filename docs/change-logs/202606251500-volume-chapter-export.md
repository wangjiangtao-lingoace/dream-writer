# 工作台卷纲/章纲导出功能

## 变更原因

用户需要在工作台的卷纲/章纲编辑器中增加独立的"卷纲导出"和"章纲导出"功能，方便将卷纲和章纲数据导出为文本文件。

## 修改点

1. **服务端：新增两个导出端点** (`server/src/routes/export.ts`)
   - `GET /api/export/:novelId/volumes` — 卷纲导出
     - 查询 Volume 表，按 sortOrder 排序
     - 输出：卷号、卷标题、目标、冲突、情绪、地图、结尾钩子、关键事件、转折点、新角色
     - 支持 `?format=markdown` 参数
   - `GET /api/export/:novelId/chapter-outlines` — 章纲导出
     - 查询 ChapterOutline 表，按 sortOrder 排序，关联 Volume 获取卷名
     - 输出：章节序号、标题、目标、冲突、情绪、钩子、爽点、伏笔回收
     - 支持 `?format=markdown` 参数

2. **前端：VolumeEditor 添加导出按钮** (`client/src/components/VolumeEditor.tsx`)
   - 添加 `showExportMenu` 状态管理导出菜单显示
   - 添加 `handleExport` 函数，复用现有 `window.open()` 模式触发下载
   - 在头部 `desk-actions` 区域添加"导出"下拉菜单按钮
   - 菜单项：卷纲导出、章纲导出
   - 添加点击外部关闭菜单的逻辑

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/routes/export.ts` | 新增 `/volumes` 和 `/chapter-outlines` 两个导出端点 |
| `client/src/components/VolumeEditor.tsx` | 添加导出下拉菜单和相关状态管理 |

## 验证情况

- [x] `pnpm typecheck` 通过
- [ ] 启动 dev server，进入工作台 → 大纲 → 卷纲 tab
- [ ] 点击"导出"按钮，分别测试"卷纲导出"和"章纲导出"
- [ ] 验证下载的文件内容正确
- [ ] 测试 markdown 格式参数
