import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { getRagIngestService } from "../services/RagIngestService";
import { getRagRetrieveService } from "../services/RagRetrieveService";
import { getVectorStore } from "../db/vectorStore";
import { getEmbeddingService } from "../services/EmbeddingService";

const router = Router();

// ---------------------------------------------------------------------------
// 辅助：检查 RAG 是否可用
// ---------------------------------------------------------------------------

function requireRag(_req: Request, res: Response): boolean {
  if (process.env.ENABLE_RAG !== "true") {
    res.status(503).json({
      success: false,
      error: "RAG 未启用。请设置环境变量 ENABLE_RAG=true 后重启服务。",
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/rag/status — 索引统计
// ---------------------------------------------------------------------------

router.get("/status", async (_req: Request, res: Response) => {
  try {
    if (!requireRag(_req, res)) return;

    const vectorStore = getVectorStore();
    const embeddingService = getEmbeddingService();

    const [stats, modelName, dimension] = await Promise.all([
      vectorStore.getStats(),
      embeddingService?.getModelName() ?? Promise.resolve(null),
      embeddingService?.getDimension() ?? Promise.resolve(null),
    ]);

    // RagChunk 表统计
    const ragChunkCount = await prisma.ragChunk.count();

    res.json({
      success: true,
      data: {
        enabled: true,
        vectorStoreAvailable: vectorStore.isAvailable(),
        embeddingModel: modelName,
        embeddingDimension: dimension,
        ragChunkCount,
        vectorStats: stats,
      },
    });
  } catch (error: any) {
    console.error("[RAG] 获取状态失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/rag/reindex/:novelId — 重建作品索引
// ---------------------------------------------------------------------------

router.post("/reindex/:novelId", async (req: Request, res: Response) => {
  try {
    if (!requireRag(req, res)) return;

    const novelId = String(req.params.novelId);
    const ingestService = getRagIngestService();
    const vectorStore = getVectorStore();

    if (!ingestService) {
      return res.status(503).json({ success: false, error: "RAG IngestService 不可用。" });
    }

    // 验证作品存在
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      return res.status(404).json({ success: false, error: `作品不存在: ${novelId}` });
    }

    // 1. 删除该作品的所有现有 chunks
    await prisma.ragChunk.deleteMany({ where: { novelId } });
    if (vectorStore.isAvailable()) {
      await vectorStore.deleteByNovel(novelId);
    }

    // 2. 重建完整索引：世界观 + 角色 + 资料库 + 章节
    const stats = await ingestService.reindexAll(novelId);

    // 3. 额外索引 Memory 记录（不属于 reindexAll 的标准范围）
    const memories = await prisma.memory.findMany({
      where: { novelId },
      select: { id: true, title: true, content: true },
    });

    let memoryIngested = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const memory of memories) {
      const text = `${memory.title}\n\n${memory.content}`;
      try {
        await ingestService.ingestText({
          ownerType: "memory",
          ownerId: memory.id,
          novelId,
          text,
        });
        memoryIngested++;
      } catch (err: any) {
        failed++;
        errors.push(`Memory ${memory.id}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        novelId,
        total: stats.total + memories.length,
        worldviews: stats.worldviews,
        characters: stats.characters,
        knowledgeAssets: stats.knowledgeAssets,
        chapters: stats.chapters,
        memories: memoryIngested,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error: any) {
    console.error("[RAG] 重建作品索引失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/rag/reindex-global — 重建全局索引
// ---------------------------------------------------------------------------

router.post("/reindex-global", async (req: Request, res: Response) => {
  try {
    if (!requireRag(req, res)) return;

    const ingestService = getRagIngestService();
    if (!ingestService) {
      return res.status(503).json({ success: false, error: "RAG IngestService 不可用。" });
    }

    // 收集全局数据（无 novelId 的 KnowledgeAsset + 所有 GeneralKnowledge）
    const [globalAssets, generalKnowledge] = await Promise.all([
      prisma.knowledgeAsset.findMany({
        where: { novelId: null },
        select: { id: true, title: true, content: true },
      }),
      prisma.generalKnowledge.findMany({
        select: { id: true, title: true, content: true },
      }),
    ]);

    let ingested = 0;
    let failed = 0;
    const errors: string[] = [];

    // 嵌入全局 KnowledgeAsset
    for (const asset of globalAssets) {
      const text = `${asset.title}\n\n${asset.content}`;
      try {
        await ingestService.ingestText({
          ownerType: "knowledge_asset",
          ownerId: asset.id,
          text,
        });
        ingested++;
      } catch (err: any) {
        failed++;
        errors.push(`KnowledgeAsset ${asset.id}: ${err.message}`);
      }
    }

    // 嵌入 GeneralKnowledge
    for (const gk of generalKnowledge) {
      const text = `${gk.title}\n\n${gk.content}`;
      try {
        await ingestService.ingestText({
          ownerType: "general_knowledge",
          ownerId: gk.id,
          text,
        });
        ingested++;
      } catch (err: any) {
        failed++;
        errors.push(`GeneralKnowledge ${gk.id}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        total: globalAssets.length + generalKnowledge.length,
        ingested,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error: any) {
    console.error("[RAG] 重建全局索引失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/rag/search — 测试搜索
// ---------------------------------------------------------------------------

router.post("/search", async (req: Request, res: Response) => {
  try {
    if (!requireRag(req, res)) return;

    const { query, novelId, topK } = req.body ?? {};

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: "请提供搜索 query。" });
    }
    if (!novelId || typeof novelId !== "string") {
      return res.status(400).json({ success: false, error: "请提供 novelId。" });
    }

    const retrieveService = getRagRetrieveService();
    if (!retrieveService) {
      return res.status(503).json({ success: false, error: "RAG RetrieveService 不可用。" });
    }

    const context = await retrieveService.retrieve(query.trim(), {
      novelId,
      topK: typeof topK === "number" ? topK : undefined,
    });

    res.json({
      success: true,
      data: {
        query: query.trim(),
        novelId,
        context,
        hasResults: context.length > 0,
      },
    });
  } catch (error: any) {
    console.error("[RAG] 搜索失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
