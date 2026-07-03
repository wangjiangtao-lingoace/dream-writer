# 素材资产结构化导入与创作上下文引用链路

## 背景

用户提供了包含人物卡、世界观、核心卖点、整体规划、创作文档、钩子表、强制约束和正文原文的完整素材文档。原流程主要依赖 LLM 对 `inspiration` 做笼统分析，素材利用率低，且规划文档里的“第 X 章”可能被误判为用户原文。

## 变更

- 新增素材分段解析器，识别人物卡、世界观、核心卖点、整体规划、创作文档、钩子表、强制约束和 canonical 正文章节区。
- 新增素材资产映射与导入服务，将素材落到 Novel、Character、KnowledgeAsset、Hook、Memory 等现有表。
- 新增素材覆盖报告，保存为 `outline/material_import` 阶段结果，并提供 `/api/pipeline/:jobId/material-report` 查询接口。
- 新增素材上下文装配器，在章纲生成和章级写作上下文中注入“作者原始素材资产”。
- 调整 analyze 阶段：先导入素材资产，再只从识别出的正文章节区执行 canonical chapter import，避免规划里的章节标题污染正文导入。
- 新增命令行导入脚本：`pnpm --filter @dream-writer/server import:material <novelId> <filePath>`。
- 前端流水线步骤文案新增 `material_import` 的中文显示。

## 风险

- 按用户要求，本次未运行测试、类型检查或启动验证。
- 素材分段解析基于规则匹配，后续如果文档标题格式变化，需要继续补充识别规则。
- `AssetUsageRecord` 目前记录素材上下文使用痕迹，但未做去重策略。
