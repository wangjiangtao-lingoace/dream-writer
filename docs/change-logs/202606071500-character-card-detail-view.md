# 变更记录：角色卡详情查看功能

## 变更原因
用户反馈点击角色卡无法查看详情，只能看到截断的50字预览，无法查看完整的人物设定信息。

## 修改点
1. **CharacterCard 组件增强**
   - 新增 `expandedId` 状态变量，用于追踪当前展开的角色卡
   - 点击角色卡头部可展开/收起详情视图
   - 简略视图：显示截断的字段预览（50字以内）
   - 详情视图：显示完整字段内容，包括：
     - 身份背景、核心动机、外貌描述、人物背景、人物关系
     - 角色弧线（arcDetail）
     - 言语风格（speechStyle）
     - 战力等级（powerLevel）
     - 备注
     - 出场统计（首次出场、最后出场、出场次数）
     - 标签（JSON 数组解析显示）

2. **Character 接口扩展**
   - 新增字段：`powerLevel`, `firstAppear`, `arcSummary`, `arcDetail`, `speechStyle`, `lastAppear`, `appearanceCount`, `knowledgeScope`, `tags`

## 文件列表
- `client/src/components/CharacterCard.tsx` - 角色卡组件，新增展开/收起功能和详情视图

## 风险说明
- 低风险：纯前端 UI 增强，不影响后端逻辑
- 标签字段（tags）使用 JSON.parse 解析，已添加 try-catch 容错

## 验证情况
- TypeScript 编译通过，无类型错误
- 后端 API 已返回所有字段（无 select 限制）
