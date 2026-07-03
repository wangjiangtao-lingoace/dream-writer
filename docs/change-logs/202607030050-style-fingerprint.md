# 风格指纹（Stylometric Fingerprinting）机制

**变更日期**: 2026-07-03
**变更类型**: 新增功能
**分支**: feat/lightweight-rebuild

## 变更原因

为确保 AI 生成的长篇小说在全文中保持一致的写作风格，需要引入风格指纹机制。该机制从参考章节中提取可量化的风格信号，在生成时注入 Prompt 约束，在生成后检测偏离。

参考项目：ngpepin/stylometric-transfer 的 JSON 指纹方法。

## 修改点

### 1. 新增风格指纹提取服务
创建 `server/src/services/pipeline/styleFingerprint.ts`，包含：
- `extractStyleFingerprint()` - 从多章参考文本中提取风格指纹
- `fingerprintToPrompt()` - 将指纹转为 Prompt 注入文本
- `detectStyleDeviation()` - 检测生成文本与指纹的偏离度

### 2. 风格指纹维度
- **句式特征**：平均句长、短句/长句比例、疑问句/感叹句/对话句比例
- **词汇特征**：词汇丰富度、常用形容词/动词/描写词、口语化比例
- **段落特征**：平均段落长度、对话段/描写段比例、过渡方式
- **语气特征**：主导语气、情感波动、叙述视角、时态偏好
- **独特标记**：常用开头/过渡/结尾方式、应避免模式

### 3. 集成到上下文组装器
修改 `server/src/services/pipeline/contextAssembler.ts`：
- 新增 `loadStyleFingerprint()` 方法
- 前 3 章从已写章节中提取指纹并缓存到 StyleProfile
- 后续章节从缓存读取并注入 Prompt

### 4. 集成到后处理
修改 `server/src/services/pipeline/postProcessing.ts`：
- 新增 `checkStyleDeviation()` 函数
- 后处理完成后检测风格偏离，偏离度 > 5 时记录 warning 日志

### 5. 集成到质量检测
修改 `server/src/services/pipeline/qualityCheck.ts`：
- 新增 `styleConsistency` 评分维度（0-10）
- 偏离度 > 3 时扣分，< 3 时触发重试

### 6. 数据库模型更新
修改 `server/prisma/schema.prisma`：
- StyleProfile 模型新增 `fingerprint` 字段（String?，存储 JSON）

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/pipeline/styleFingerprint.ts` | 新增 - 风格指纹提取、Prompt 转换、偏离检测 |
| `server/src/services/pipeline/contextAssembler.ts` | 修改 - 集成风格指纹加载和注入 |
| `server/src/services/pipeline/postProcessing.ts` | 修改 - 添加风格偏离检测 |
| `server/src/services/pipeline/qualityCheck.ts` | 修改 - 添加风格一致性评分 |
| `server/prisma/schema.prisma` | 修改 - StyleProfile 添加 fingerprint 字段 |
| `docs/change-logs/202607030050-style-fingerprint.md` | 新增 - 变更日志 |

## 风险说明

1. **首次提取延迟**：前 3 章需要从已写章节提取指纹，可能增加少量延迟
2. **指纹缓存一致性**：如果用户手动修改了 StyleProfile，缓存的指纹可能过时
3. **简单分词**：当前使用简单的中文分词（按 2 字切分），可能不如专业分词准确

## 降级/回退方案

1. 如果指纹提取失败，不影响正常生成流程
2. 如果指纹缓存不存在，跳过风格一致性检测
3. 偏离检测仅记录日志和扣分，不阻断生成流程

## 验证情况

- [x] Prisma Client 生成成功
- [x] TypeScript 类型检查通过（styleFingerprint.ts 无错误）
- [ ] 手动验证：创建新作品，观察前 3 章风格指纹提取
- [ ] 手动验证：检查后续章节的风格偏离日志

## 使用示例

```typescript
// 提取风格指纹
const chapters = [
  { order: 1, content: "第一章内容..." },
  { order: 2, content: "第二章内容..." },
];
const fingerprint = extractStyleFingerprint(chapters);

// 转为 Prompt
const promptText = fingerprintToPrompt(fingerprint);

// 检测偏离
const deviation = detectStyleDeviation(fingerprint, generatedContent);
if (deviation.deviationScore > 5) {
  console.warn("风格偏离严重", deviation.deviations);
}
```
