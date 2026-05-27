import { prisma } from "../db/prisma";
import { getEmbeddingService } from "./EmbeddingService";
import { getVectorStore } from "../db/vectorStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestParams {
  ownerType: "knowledge_asset" | "memory" | "general_knowledge";
  ownerId: string;
  novelId?: string;
  text: string;
}

// ---------------------------------------------------------------------------
// RagIngestService
// ---------------------------------------------------------------------------

class RagIngestService {
  // I3: 简单的 per-owner 互斥锁，防止并发 ingest 干扰
  private ingestLocks = new Map<string, Promise<void>>();

  /**
   * 知识写入管道：切片 + 嵌入 + 存储
   *
   * 流程：
   * 1. 删除该 owner 的旧 chunks（重新嵌入）
   * 2. 切片文本
   * 3. 批量嵌入
   * 4. 写入 RagChunk 表（Prisma）
   * 5. 写入 vec0 虚表（sqlite-vec）
   */
  async ingestText(params: IngestParams): Promise<void> {
    const { ownerType, ownerId, novelId, text } = params;
    const lockKey = `${ownerType}:${ownerId}`;

    // I3: 等待同一 owner 的上一次 ingest 完成
    const existing = this.ingestLocks.get(lockKey);
    if (existing) {
      await existing.catch(() => {});
    }

    // I3: 创建新的锁 promise
    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.ingestLocks.set(lockKey, lockPromise);

    try {
      await this.ingestTextInternal(params);
    } finally {
      releaseLock();
      // 清理：如果当前锁仍是本次的，则移除
      if (this.ingestLocks.get(lockKey) === lockPromise) {
        this.ingestLocks.delete(lockKey);
      }
    }
  }

  private async ingestTextInternal(params: IngestParams): Promise<void> {
    const { ownerType, ownerId, novelId, text } = params;

    const embeddingService = getEmbeddingService();
    if (!embeddingService) {
      console.warn("[RagIngestService] EmbeddingService 未启用，跳过嵌入");
      return;
    }

    const vectorStore = getVectorStore();
    if (!vectorStore.isAvailable()) {
      console.warn("[RagIngestService] VectorStore 不可用，跳过嵌入");
      return;
    }

    if (!text || text.trim().length === 0) {
      return;
    }

    // 1. 删除旧 chunks
    await this.deleteChunks(ownerType, ownerId);

    // 2. 切片 + 嵌入
    const chunks = await embeddingService.chunkAndEmbed(text);
    if (chunks.length === 0) {
      return;
    }

    const modelName = await embeddingService.getModelName();

    // C2: 3+4 包裹在 try/catch 中，失败时回滚 RagChunk 表
    try {
      // 3. 批量写入 RagChunk 表（I4: 移除未使用变量）
      await prisma.ragChunk.createMany({
        data: chunks.map((chunk, index) => ({
          ownerType,
          ownerId,
          novelId: novelId ?? null,
          assetId: ownerType === "knowledge_asset" ? ownerId : null,
          chunkIndex: index,
          text: chunk.text,
          embedModel: modelName,
        })),
      });

      // 4. 写入 vec0 虚表
      // I5: 用 findMany 读取刚创建的 chunk 记录获取 id，并校验数量
      const savedChunks = await prisma.ragChunk.findMany({
        where: { ownerType, ownerId },
        orderBy: { chunkIndex: "asc" },
      });

      if (savedChunks.length !== chunks.length) {
        throw new Error(
          `[RagIngestService] chunk 数量不一致: 期望 ${chunks.length}, 实际 ${savedChunks.length}`,
        );
      }

      // I6: vec0 TEXT 列不支持 null，用空字符串；Prisma RagChunk 保持 null（匹配 schema）
      const vectors = savedChunks.map((chunk, index) => ({
        chunkId: chunk.id,
        ownerType,
        ownerId,
        novelId: novelId ?? "",
        embedModel: modelName,
        embedding: chunks[index].embedding,
      }));

      await vectorStore.insertVectors(vectors);
    } catch (error) {
      // C2: 写入失败时清理已部分写入的 RagChunk 表数据
      console.error("[RagIngestService] 写入失败，回滚 RagChunk 数据:", error);
      await prisma.ragChunk
        .deleteMany({ where: { ownerType, ownerId } })
        .catch((cleanupErr) =>
          console.error("[RagIngestService] 回滚失败:", cleanupErr),
        );
      // 同时清理 vec0
      if (vectorStore.isAvailable()) {
        await vectorStore
          .deleteByOwner(ownerType, ownerId)
          .catch((cleanupErr) =>
            console.error("[RagIngestService] vec0 回滚失败:", cleanupErr),
          );
      }
      throw error;
    }
  }

  /**
   * 删除指定 owner 的 chunks（RagChunk 表 + vec0 虚表）
   * C1: 改为 public，供路由层在删除记录前清理 RAG 数据
   */
  async deleteChunks(ownerType: string, ownerId: string): Promise<void> {
    // 删除 vec0 虚表中的向量
    const vectorStore = getVectorStore();
    if (vectorStore.isAvailable()) {
      await vectorStore.deleteByOwner(ownerType, ownerId);
    }

    // 删除 RagChunk 表中的记录
    await prisma.ragChunk.deleteMany({
      where: { ownerType, ownerId },
    });
  }
}

// ---------------------------------------------------------------------------
// 单例
// ---------------------------------------------------------------------------

let ragIngestServiceInstance: RagIngestService | null = null;

/**
 * 获取 RagIngestService 单例
 * 启用 RAG 时返回实例，未启用时返回 null
 */
export function getRagIngestService(): RagIngestService | null {
  if (process.env.ENABLE_RAG !== "true") {
    return null;
  }
  if (!ragIngestServiceInstance) {
    ragIngestServiceInstance = new RagIngestService();
  }
  return ragIngestServiceInstance;
}

export { RagIngestService };
