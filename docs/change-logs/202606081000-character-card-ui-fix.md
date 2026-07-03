# 变更记录：角色卡 UI 修复

## 变更原因
用户反馈角色卡的"详情"按钮不明显，且 Pipeline 提取的人物内容过于简短（被压缩到100字以内）。

## 修改点

### 1. Pipeline 人物提取规则优化
- **文件**: `server/src/services/pipeline/analyzePhase.ts`
- **修改**: 移除"每个字段请精简描述，不要超过100字"的限制
- **改为**: "保留素材中的完整描述，不要压缩或精简"
- **效果**: 人物设定将保留原文的完整描述，不再被压缩

### 2. 角色卡按钮样式优化
- **文件**: `client/src/styles/components.css`
- **修改**: 为 `.card-actions button` 添加更明显的样式
- **新增**: `.btn-detail` 类名，用于"详情"按钮
- **效果**: 按钮有背景色和边框，更易识别

### 3. 角色卡组件优化
- **文件**: `client/src/components/CharacterCard.tsx`
- **修改**: 使用 CSS 类名替代内联样式
- **效果**: 按钮样式更统一，代码更简洁

## 文件列表
- `server/src/services/pipeline/analyzePhase.ts` - 修改人物提取 prompt
- `client/src/styles/components.css` - 优化按钮样式
- `client/src/components/CharacterCard.tsx` - 使用 CSS 类名

## 风险说明
- 低风险：纯 UI 优化和 prompt 调整
- 重新运行 Pipeline 后，人物数据将保留完整描述

## 验证情况
- TypeScript 编译通过
- 前端服务器正常运行
