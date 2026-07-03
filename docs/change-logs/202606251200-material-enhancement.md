# 素材资产入库系统增强

## 变更原因

基于 `202606251030-material-ingestion-context.md` 和 `202606251045-user-asset-bible-ingestion-plan.md` 两份规划文档，对已有的素材入库系统做 4 项增强：人物卡深度结构化、覆盖报告动态化、素材上下文注入更多生成器、生成结果资产一致性检查。

## 修改点

1. **人物卡深度结构化** (`MaterialAssetMapper.ts`)
   - 扩展 `MaterialCharacterDto` 接口，新增 10 个可选字段：speechStyle/signatureLines/signatureScenes/comedyMechanisms/emotionalHooks/abilities/appearance/background/motivation/arcDetail
   - 增强 `mapCharacter()` 函数，用正则从 rawProfile 提取新字段
   - 新增 `extractSectionAfter()` 辅助函数，提取多行 section 内容
   - 更新 `collectBulletsAfter()` break 条件，防止越界

2. **人物卡字段落库** (`MaterialImportService.ts`)
   - `importMaterialAssets()` character upsert 补全新字段
   - signatureLines/signatureScenes 用 `json()` 序列化存储

3. **覆盖报告动态化** (`MaterialCoverageReport.ts`)
   - 替换硬编码的 6 个角色名为动态检测
   - 从 sections 中筛选 character_card 类型，与实际提取的角色名交叉校验
   - 对任意小说通用

4. **素材上下文注入生成器** (`generators.ts` + 调用方)
   - `generateStoryArcs` 新增 `materialContext` 参数，注入 prompt
   - `generatePayoffChains` 新增 `materialContext` 参数，注入 prompt
   - 更新 `chapterOutlinesPhase.ts` 和 `payoffChainPhase.ts` 调用方传入素材上下文

5. **资产一致性检查** (`MaterialCoverageReport.ts` + `chapterOutlinesPhase.ts`)
   - 新增 `checkMaterialAssetConsistency()` 函数
   - 新增 `checkMaterialConsistencyFromDb()` 简化版，从 DB 加载数据
   - 集成到章纲生成流程，软检查（warn 但不阻断）

6. **测试更新**
   - `MaterialAssetMapper.test.ts` 新增深度字段提取测试和缺失字段容错测试
   - `MaterialSectionParser.test.ts` 修复测试数据

## 文件列表

| 文件 | 变更说明 |
|------|----------|
| `server/src/services/material/MaterialAssetMapper.ts` | 扩展 DTO 接口 + 增强 mapCharacter + 新增 extractSectionAfter |
| `server/src/services/material/MaterialImportService.ts` | character upsert 补全新字段 |
| `server/src/services/material/MaterialCoverageReport.ts` | 动态覆盖报告 + 资产一致性检查 |
| `server/src/services/pipeline/generators.ts` | generateStoryArcs/generatePayoffChains 新增 materialContext |
| `server/src/services/pipeline/chapterOutlinesPhase.ts` | 传入素材上下文 + 集成一致性检查 |
| `server/src/services/pipeline/payoffChainPhase.ts` | 传入素材上下文 |
| `server/src/services/material/__tests__/MaterialAssetMapper.test.ts` | 新增深度字段测试 |
| `server/src/services/material/__tests__/MaterialSectionParser.test.ts` | 修复测试数据 |

## 验证情况

- [x] `pnpm typecheck` 通过
- [x] Material asset 测试全部通过（6/6）
