#!/usr/bin/env ts-node

/**
 * RAG 回填脚本
 *
 * 为现有数据库中的 KnowledgeAsset、Memory、GeneralKnowledge 生成嵌入向量。
 * 运行前请确保：
 *   1. ENABLE_RAG=true
 *   2. 嵌入模型已配置（AppSetting 或环境变量）
 *   3. Prisma Client 已生成
 *
 * 用法：
 *   cd server && npx ts-node scripts/backfill-rag.ts
 *   cd server && npx ts-node scripts/backfill-rag.ts --dry-run
 */

import dotenv from "dotenv";
import path from "node:path";

// 加载 server/.env
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// 强制启用 RAG
process.env.ENABLE_RAG = "true";

import { prisma } from "../src/db/prisma";
import { getRagIngestService } from "../src/services/RagIngestService";
import { getVectorStore } from "../src/db/vectorStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackfillStats {
  knowledgeAssets: { total: number; success: number; failed: number };
  memories: { total: number; success: number; failed: number };
  generalKnowledge: { total: number; success: number; failed: number };
  errors: Array<{ type: string; id: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== RAG 回填脚本 ===");
  console.log(`模式: ${dryRun ? "DRY RUN（不执行嵌入）" : "正式执行"}`);
  console.log("");

  // 检查 RAG 服务可用性
  const ingestService = getRagIngestService();
  const vectorStore = getVectorStore();

  if (!ingestService) {
    console.error("错误: RagIngestService 不可用。请检查 ENABLE_RAG=true 和嵌入模型配置。");
    process.exit(1);
  }

  console.log(`向量存储: ${vectorStore.isAvailable() ? "可用" : "不可用（将仅写入 RagChunk 表）"}`);
  console.log("");

  const stats: BackfillStats = {
    knowledgeAssets: { total: 0, success: 0, failed: 0 },
    memories: { total: 0, success: 0, failed: 0 },
    generalKnowledge: { total: 0, success: 0, failed: 0 },
    errors: [],
  };

  // -----------------------------------------------------------------------
  // 1. KnowledgeAsset
  // -----------------------------------------------------------------------
  console.log("[1/3] 处理 KnowledgeAsset...");
  const knowledgeAssets = await prisma.knowledgeAsset.findMany({
    select: { id: true, title: true, content: true, novelId: true },
    orderBy: { createdAt: "asc" },
  });
  stats.knowledgeAssets.total = knowledgeAssets.length;
  console.log(`  找到 ${knowledgeAssets.length} 条记录`);

  if (!dryRun) {
    for (const asset of knowledgeAssets) {
      const text = `${asset.title}\n\n${asset.content}`;
      try {
        await ingestService.ingestText({
          ownerType: "knowledge_asset",
          ownerId: asset.id,
          novelId: asset.novelId ?? undefined,
          text,
        });
        stats.knowledgeAssets.success++;
        process.stdout.write(`\r  进度: ${stats.knowledgeAssets.success + stats.knowledgeAssets.failed}/${stats.knowledgeAssets.total}`);
      } catch (err: any) {
        stats.knowledgeAssets.failed++;
        stats.errors.push({ type: "KnowledgeAsset", id: asset.id, error: err.message });
      }
    }
    console.log("");
  }
  console.log(`  完成: 成功 ${stats.knowledgeAssets.success}, 失败 ${stats.knowledgeAssets.failed}`);
  console.log("");

  // -----------------------------------------------------------------------
  // 2. Memory
  // -----------------------------------------------------------------------
  console.log("[2/3] 处理 Memory...");
  const memories = await prisma.memory.findMany({
    select: { id: true, title: true, content: true, novelId: true },
    orderBy: { createdAt: "asc" },
  });
  stats.memories.total = memories.length;
  console.log(`  找到 ${memories.length} 条记录`);

  if (!dryRun) {
    for (const memory of memories) {
      const text = `${memory.title}\n\n${memory.content}`;
      try {
        await ingestService.ingestText({
          ownerType: "memory",
          ownerId: memory.id,
          novelId: memory.novelId,
          text,
        });
        stats.memories.success++;
        process.stdout.write(`\r  进度: ${stats.memories.success + stats.memories.failed}/${stats.memories.total}`);
      } catch (err: any) {
        stats.memories.failed++;
        stats.errors.push({ type: "Memory", id: memory.id, error: err.message });
      }
    }
    console.log("");
  }
  console.log(`  完成: 成功 ${stats.memories.success}, 失败 ${stats.memories.failed}`);
  console.log("");

  // -----------------------------------------------------------------------
  // 3. GeneralKnowledge
  // -----------------------------------------------------------------------
  console.log("[3/3] 处理 GeneralKnowledge...");
  const generalKnowledge = await prisma.generalKnowledge.findMany({
    select: { id: true, title: true, content: true },
    orderBy: { createdAt: "asc" },
  });
  stats.generalKnowledge.total = generalKnowledge.length;
  console.log(`  找到 ${generalKnowledge.length} 条记录`);

  if (!dryRun) {
    for (const gk of generalKnowledge) {
      const text = `${gk.title}\n\n${gk.content}`;
      try {
        await ingestService.ingestText({
          ownerType: "general_knowledge",
          ownerId: gk.id,
          text,
        });
        stats.generalKnowledge.success++;
        process.stdout.write(`\r  进度: ${stats.generalKnowledge.success + stats.generalKnowledge.failed}/${stats.generalKnowledge.total}`);
      } catch (err: any) {
        stats.generalKnowledge.failed++;
        stats.errors.push({ type: "GeneralKnowledge", id: gk.id, error: err.message });
      }
    }
    console.log("");
  }
  console.log(`  完成: 成功 ${stats.generalKnowledge.success}, 失败 ${stats.generalKnowledge.failed}`);
  console.log("");

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const totalItems = stats.knowledgeAssets.total + stats.memories.total + stats.generalKnowledge.total;
  const totalSuccess = stats.knowledgeAssets.success + stats.memories.success + stats.generalKnowledge.success;
  const totalFailed = stats.knowledgeAssets.failed + stats.memories.failed + stats.generalKnowledge.failed;

  console.log("=== 回填结果 ===");
  console.log(`总计: ${totalItems} 条记录`);
  console.log(`成功: ${totalSuccess}`);
  console.log(`失败: ${totalFailed}`);

  if (stats.errors.length > 0) {
    console.log("");
    console.log("失败详情:");
    for (const err of stats.errors) {
      console.log(`  [${err.type}] ${err.id}: ${err.error}`);
    }
  }

  // 输出最终向量统计
  if (!dryRun) {
    console.log("");
    const vectorStats = await vectorStore.getStats();
    console.log("=== 向量索引统计 ===");
    console.log(`总向量数: ${vectorStats.totalVectors}`);
    console.log(`按类型: ${JSON.stringify(vectorStats.byOwnerType)}`);
    console.log(`按作品: ${JSON.stringify(vectorStats.byNovel)}`);
    console.log(`模型: ${vectorStats.models.join(", ")}`);
  }

  await prisma.$disconnect();
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("回填脚本异常退出:", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
