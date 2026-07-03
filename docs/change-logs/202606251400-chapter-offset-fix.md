# 章节偏移量 bug 修复

## 变更原因

第4章生成了第7章的章纲内容（"夜探废医院"而非"鬼才信你"），根因是 `enrichedChaptersMap` 构建时未考虑 canonical 偏移量。

## 根因分析

`chapterOutlinesPhase` 生成章纲时使用 `canonicalOffset=3`（前3章是用户原文），AI 从第4章开始生成。但 `writingPhase.ts` 中 `enrichedChaptersMap` 从 `globalOrder=1` 开始构建，导致：

- map key 1 → "鬼才信你"（实际应是第4章）
- map key 4 → "夜探废医院"（实际是第7章）
- 偏移量差 = 3

## 修改点

1. **enrichedChaptersMap 构建修正** (`writingPhase.ts`)
   - 查询最后一个 canonical 章节的 order 作为 `canonicalOffset`
   - `globalOrder` 从 `canonicalOffset + 1` 开始（而非 1）
   - 同时修复了后处理阶段的第二个 `enrichedChaptersMap` 构建

2. **validateChapterAlignment 安全检查** (`writingPhase.ts`)
   - 新增函数，校验 canonical 章节不应出现在 enrichedChaptersMap 中
   - 校验 `expectedStartOrder` 在 map 中存在
   - 在写作循环前调用，防止未来再出现偏移量错误

3. **canonical 章节预加载** (`writingPhase.ts`)
   - 写作循环前将 canonical 章节数据加载到 `previousChapters`
   - 确保续写首章能获取到前文上下文（之前循环从 order=4 开始，canonical 1-3 从未被加入）

4. **continuity_hook 首 beat** (`writingPhase.ts`)
   - 续写首章（canonical+1）在模板 beats 前插入 `continuity_hook` beat
   - 强制承接前一个 canonical 章节的结尾场景
   - 包含 mustInclude/mustAvoid 约束

5. **清理错误数据**
   - 删除错误生成的第4-6章及相关 ChapterOutline/ChapterBeat/PleasurePoint/EmotionCurve
   - 重置 pipeline job 到 consistency_check 阶段

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/pipeline/writingPhase.ts` | 修复 enrichedChaptersMap 偏移量 + 新增 validateChapterAlignment + canonical 预加载 + continuity_hook beat |
| `docs/change-logs/202606251400-chapter-offset-fix.md` | 本变更记录 |

## 验证情况

- [x] `pnpm typecheck` 通过
- [x] enrichedChaptersMap 模拟验证：key 4 → "鬼才信你"（正确）
- [x] 错误章节已删除，pipeline 已重置
