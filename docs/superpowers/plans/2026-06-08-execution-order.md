# P0 优化执行顺序

## 执行原则
- 每个任务只涉及1-2个文件
- 完成一个任务后再开始下一个
- 每个任务完成后提交代码

## 执行顺序

### 第一阶段：组件拆分（Task 1.x）
1. ✅ 1.1 创建WorkspaceHeader组件 (1个文件)
2. ✅ 1.2 创建WorkspaceWriteLayout组件 (1个文件)
3. ✅ 1.3 创建WorkspaceStandardLayout组件 (1个文件)
4. ✅ 1.4 重构NovelWorkspace主组件 (1个文件)

### 第二阶段：Tab精简（Task 2.x）
5. ⏳ 2.1 定义新的tab分组结构 (1个文件)
6. ⏳ 2.2 更新groupDefs配置 (1个文件)

### 第三阶段：Pipeline优化（Task 3.x）
7. ⏳ 3.1 修改PipelineService为异步执行 (1个文件)
8. ⏳ 3.2 添加Pipeline进度查询API (1个文件)

### 第四阶段：版本历史（Task 4.x）
9. ⏳ 4.1 添加ChapterRevision数据模型 (1个文件)
10. ⏳ 4.2 创建ChapterRevisionService (1个文件)
11. ⏳ 4.3 添加版本历史API路由 (1个文件)

### 第五阶段：数据优化（Task 5.x）
12. ⏳ 5.1 更新CharacterRelation数据模型 (1个文件)

## 当前状态
- ✅ 第一阶段（组件拆分）：全部完成
- 当前任务：2.1 定义新的tab分组结构
- 下一个任务：2.2 更新groupDefs配置
