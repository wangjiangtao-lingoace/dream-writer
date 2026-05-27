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
    await this.deleteExistingChunks(ownerType, ownerId);

    // 2. 切片 + 嵌入
    const chunks = await embeddingService.chunkAndEmbed(text);
    if (chunks.length === 0) {
      return;
    }

    const modelName = await embeddingService.getModelName();

    // 3. 批量写入 RagChunk 表
    const createdChunks = await prisma.ragChunk.createMany({
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
    // 需要读取刚创建的 chunk 记录获取 id
    const savedChunks = await prisma.ragChunk.findMany({
      where: { ownerType, ownerId },
      orderBy: { chunkIndex: "asc" },
    });

    const vectors = savedChunks.map((chunk, index) => ({
      chunkId: chunk.id,
      ownerType,
      ownerId,
      novelId: novelId ?? "",
      embedModel: modelName,
      embedding: chunks[index].embedding,
    }));

    await vectorStore.insertVectors(vectors);
  }

  /**
   * 删除指定 owner 的旧 chunks（RagChunk 表 + vec0 虚表）
   */
  private async deleteExistingChunks(
    ownerType: string,
    ownerId: string,
  ): Promise<void> {
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
