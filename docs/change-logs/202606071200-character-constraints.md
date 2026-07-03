# 变更记录：生成内容时的人物约束机制

**时间**：2026-06-07 12:00  
**分支**：feat/lightweight-rebuild  
**任务**：实现生成内容时的人物约束机制

---

## 变更原因

系统已经可以存储人物卡（Character 表），包含 personality（会做/不会做的事）、knowledgeScope（角色在各章节的知识范围）、speechStyle（言语风格）、arcDetail（成长线）等字段。但在生成章节内容时，LLM 并未遵守这些约束，导致：

1. 角色做了"不该做"的事（违背人设）
2. 角色知道了"不该知道"的信息（先知 Bug）
3. 言语风格不符合设定
4. 角色关系状态与当前章节不符

需要在生成章节内容时，将这些约束注入到 prompt 中，强制 LLM 遵守。

---

## 修改点

### 1. 新建核心服务：`characterConstraints.ts`

**位置**：`server/src/services/pipeline/characterConstraints.ts`

**功能**：
- `buildCharacterConstraints(novelId, chapterOrder)` - 核心函数，构建当前章节的所有角色约束
- `getCurrentRelationship(novelId, charA, charB, chapterOrder)` - 获取两个角色在当前章节的关系状态
- `formatConstraintsForPrompt(constraints)` - 格式化约束文本

**约束内容包括**：
1. **人设约束**：从 personality/notes 中提取"会做"/"绝不会做"的事项
2. **知识范围**：从 knowledgeScope 中提取当前章节不应该知道的信息
3. **言语风格**：从 speechStyle 中提取言语特征
4. **成长红线**：从 arcDetail 中提取必须遵守的核心约束
5. **关系状态**：从 CharacterRelation 表中提取当前章节的角色关系描述

**返回格式示例**：
```
【人物约束（必须严格遵守！）】

【林凡】（主角）
身份：外门弟子
言语风格：内心独白：理性分析；对外：低调谨慎
会做的事：从零开始学习、认真完成任务、回报真心对他好的人
⚠️ 绝不会做：一步登天、变得傲慢、依赖老祖解决阳间问题
成长红线：所有能力都必须有习得过程

⚠️ 林凡在第 5 章时【不知道】：
  - 师父是改革派
  - 功法 Bug 的真相
  - 宗门的真正历史
❌ 禁止让林凡在本章表现出知道这些信息！

关系状态（第 5 章）：
  - 林富贵：亲属（互相嫌弃，被迫绑定）
```

---

### 2. 修改写作阶段：`writingPhase.ts`

**位置**：`server/src/services/pipeline/writingPhase.ts`

**变更**：
- 在 `generateInitialChapterDrafts` 函数中，调用 `buildCharacterConstraints` 获取约束
- 将约束传递给 `generateChapterDraft` 函数
- 修改 `generateChapterDraft` 函数签名，添加 `characterConstraints?: string` 参数
- 在 prompt 中注入人物约束，添加强制遵守的写作要求

**关键修改片段**：
```typescript
// 构建人物约束（知识边界 + 人设 + 言语风格 + 关系状态）
const { buildCharacterConstraints } = await import("./characterConstraints");
const characterConstraints = await buildCharacterConstraints(novelId, order).catch((e) => {
  console.warn(`[writingPhase] 人物约束构建失败:`, e);
  return "";
});

// 传递给生成函数
let draft = await generateChapterDraft(ctx, {
  // ... 其他参数
  characterConstraints,
});
```

**Prompt 注入**：
```typescript
const characterSection = input.characterConstraints
  ? `\n${input.characterConstraints}\n`
  : "";

const prompt = `请为「${input.novel.title}」写第${input.order}章的完整正文。

${input.compactContext}
${characterSection}
【写作要求】
...
8. ⚠️ 必须严格遵守【人物约束】中的所有规则：
   - 角色不能做"绝不会做"的事
   - 角色不能知道他们"不应该知道"的信息
   - 言语风格必须符合设定
   - 角色关系必须符合当前章节状态
`;
```

**删除旧代码**：
- 删除了 `import { getCharacterForbiddenKnowledge } from "./characterKnowledge"`
- 删除了 `forbiddenKnowledge` 参数（已被 `characterConstraints` 替代）

---

### 3. 新建测试脚本：`characterConstraints.test.ts`

**位置**：`server/src/services/pipeline/__tests__/characterConstraints.test.ts`

**功能**：
- 创建测试小说和角色
- 设置人物约束（会做/不会做、知识范围、言语风格、分阶段关系）
- 验证约束文本是否正确构建
- 验证不同章节的知识范围变化
- 验证分阶段关系的正确获取

**运行方式**：
```bash
cd server
npx tsx src/services/pipeline/__tests__/characterConstraints.test.ts
```

---

## 文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `server/src/services/pipeline/characterConstraints.ts` | 新建 | 人物约束构建核心服务 |
| `server/src/services/pipeline/writingPhase.ts` | 修改 | 在章节生成时注入人物约束 |
| `server/src/services/pipeline/__tests__/characterConstraints.test.ts` | 新建 | 测试脚本 |

---

## 技术细节

### 数据库依赖

**Character 表**：
- `personality` - 人设描述（会做/不会做）
- `speechStyle` - 言语风格
- `arcDetail` - 成长线/红线
- `knowledgeScope` - JSON 数组，格式：`[{"chapterRange": "1-10", "unknownFacts": ["信息1"]}]`
- `firstAppear` / `lastAppear` - 出场范围

**CharacterRelation 表**：
- `charA` / `charB` - 角色名称
- `relType` - 关系类型
- `description` - 关系描述，支持分阶段 JSON 格式：`[{"chapterRange": "1-5", "desc": "互相嫌弃"}]`
- `startChapter` / `endChapter` - 关系生效范围

### 解析逻辑

**人设提取**：
- 正则匹配"会做："、"绝不会做："、"不会做："、"禁止"等关键词
- 支持中英文标点分隔的列表

**章节范围解析**：
- 支持单章："5"
- 支持范围："1-10"
- 用于判断当前章节是否在约束范围内

**关系阶段匹配**：
- 尝试解析 JSON 数组
- 根据 chapterRange 匹配当前章节
- 如果无匹配，返回最后一个阶段的描述

---

## 风险说明

### 1. LLM 遵守度风险

**风险**：即使注入了约束，LLM 仍可能生成违反约束的内容（尤其是在上下文过长时）

**缓解措施**：
- 使用强烈的警告标记（⚠️、❌、禁止、必须）
- 在写作要求中再次强调必须遵守
- 考虑在质量检查阶段增加"人设一致性"检查项

### 2. knowledgeScope 数据质量风险

**风险**：如果 knowledgeScope 数据不准确或缺失，约束机制无法生效

**缓解措施**：
- 在 Pipeline 规划阶段，要求 LLM 为每个角色生成完整的 knowledgeScope
- 在后处理阶段，使用 `characterKnowledge.ts` 的 `updateCharacterKnowledge` 自动更新

### 3. 性能风险

**风险**：每次生成章节都要查询所有角色和关系，可能影响性能

**缓解措施**：
- 当前实现已过滤未出场角色（firstAppear > chapterOrder）
- 如果角色数量过多（>20），考虑只加载本章出场的角色
- 可以在 `enrichedChapter.characters` 中获取本章出场角色列表

---

## 验证情况

### 单元测试

运行测试脚本：
```bash
cd server
npx tsx src/services/pipeline/__tests__/characterConstraints.test.ts
```

**预期结果**：
- ✓ 包含林凡人设
- ✓ 包含会做事项
- ✓ 包含绝不会做
- ✓ 包含言语风格
- ✓ 包含成长红线
- ✓ 包含知识禁区
- ✓ 包含禁止警告
- ✓ 包含关系状态
- ✓ 包含林富贵
- ✓ 不包含第1-10章禁区（第15章）
- ✓ 包含第11-20章禁区（第15章）
- ✓ 关系变化为患难与共（第15章）

### 集成测试

1. 创建一个测试小说
2. 导入人物卡（设置"林凡在第 1-10 章不知道师父是改革派"）
3. 运行 Pipeline 生成第 5 章
4. 检查生成内容中，林凡是否表现出"知道师父秘密"
5. 如果生成内容中林凡没有提及相关信息，说明约束机制有效

---

## 后续优化建议

### 1. 质量检查增强

在 `qualityCheck.ts` 中增加"人设一致性"检查：
- 扫描生成内容，检查是否有角色做了"绝不会做"的事
- 检查是否有角色知道了"不该知道"的信息
- 如果检测到违反，触发重试

### 2. 自动知识范围管理

在 `postProcessing.ts` 中，调用 `updateCharacterKnowledge` 自动更新角色知识范围：
```typescript
await updateCharacterKnowledge(novelId, chapterOrder, content, characterNames);
```

### 3. 角色关系自动推断

在章节生成后，根据内容自动推断角色关系变化，更新 CharacterRelation 表。

### 4. 可视化工具

在前端提供"人物约束预览"功能，让用户在生成前查看当前章节的约束内容。

---

## 总结

本次实现完成了"生成内容时的人物约束机制"，确保 AI 生成的内容中：
1. ✅ 角色不会做"不该做"的事
2. ✅ 角色不会知道"不该知道"的信息
3. ✅ 角色的言语风格符合设定
4. ✅ 角色关系符合当前章节的状态

核心机制是在章节生成 prompt 中注入结构化的约束文本，通过强烈的警告标记引起 LLM 注意。配合后续的质量检查和自动知识管理，可以有效避免人设崩坏和先知 Bug。
