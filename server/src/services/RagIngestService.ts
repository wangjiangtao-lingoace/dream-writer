import { prisma } from "../db/prisma";
import { getEmbeddingService } from "./EmbeddingService";
import { getVectorStore } from "../db/vectorStore";
import { getRagRetrieveService } from "./RagRetrieveService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestParams {
  ownerType: "knowledge_asset" | "memory" | "general_knowledge" | "worldview" | "character" | "chapter";
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

      // FTS5 同步：将新 chunks 写入全文索引
      getRagRetrieveService()?.syncFtsAfterInsert(savedChunks);

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
      // 同步清理 FTS5 索引
      getRagRetrieveService()?.syncFtsAfterDelete(ownerType, ownerId);
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

    // 同步清理 FTS5 索引
    getRagRetrieveService()?.syncFtsAfterDelete(ownerType, ownerId);
  }

  // ---------------------------------------------------------------------------
  // 批量索引方法：按数据源类型索引整个作品
  // ---------------------------------------------------------------------------

  /**
   * 索引作品的所有世界观内容
   * 将 Worldview 的 name + summary + rules + geography + history + powerSystem 等字段组合为文本
   */
  async upsertWorldviewChunks(novelId: string): Promise<number> {
    const worldviews = await prisma.worldview.findMany({
      where: { novelId },
      select: {
        id: true, name: true, summary: true, rules: true,
        geography: true, factions: true, history: true,
        powerSystem: true, economy: true, culture: true,
        technology: true, customNotes: true,
      },
    });

    let count = 0;
    for (const wv of worldviews) {
      const parts: string[] = [`世界观：${wv.name}`];
      if (wv.summary) parts.push(`概述：${wv.summary}`);
      if (wv.rules) parts.push(`规则：${wv.rules}`);
      if (wv.geography) parts.push(`地理：${wv.geography}`);
      if (wv.factions) parts.push(`势力：${wv.factions}`);
      if (wv.history) parts.push(`历史：${wv.history}`);
      if (wv.powerSystem) parts.push(`力量体系：${wv.powerSystem}`);
      if (wv.economy) parts.push(`经济体系：${wv.economy}`);
      if (wv.culture) parts.push(`文化：${wv.culture}`);
      if (wv.technology) parts.push(`科技/魔法水平：${wv.technology}`);
      if (wv.customNotes) parts.push(`备注：${wv.customNotes}`);
      const text = parts.join("\n");
      if (!text.trim()) continue;

      await this.ingestText({ ownerType: "worldview", ownerId: wv.id, novelId, text });
      count++;
    }
    return count;
  }

  /**
   * 索引作品的所有角色档案
   * 将 Character 的 name + role + identity + motivation + appearance + background 等字段组合为文本
   */
  async upsertCharacterChunks(novelId: string): Promise<number> {
    const characters = await prisma.character.findMany({
      where: { novelId },
      select: {
        id: true, name: true, role: true, identity: true,
        motivation: true, appearance: true, background: true,
        relationsText: true, notes: true, powerLevel: true,
        arcSummary: true, arcDetail: true, speechStyle: true,
      },
    });

    let count = 0;
    for (const char of characters) {
      const parts: string[] = [`角色：${char.name}`];
      if (char.role) parts.push(`角色类型：${char.role}`);
      if (char.identity) parts.push(`身份：${char.identity}`);
      if (char.motivation) parts.push(`动机：${char.motivation}`);
      if (char.appearance) parts.push(`外貌：${char.appearance}`);
      if (char.background) parts.push(`背景：${char.background}`);
      if (char.relationsText) parts.push(`人物关系：${char.relationsText}`);
      if (char.powerLevel) parts.push(`战力等级：${char.powerLevel}`);
      if (char.arcSummary) parts.push(`角色弧线：${char.arcSummary}`);
      if (char.arcDetail) parts.push(`成长线：${char.arcDetail}`);
      if (char.speechStyle) parts.push(`言语风格：${char.speechStyle}`);
      if (char.notes) parts.push(`备注：${char.notes}`);
      const text = parts.join("\n");
      if (!text.trim()) continue;

      await this.ingestText({ ownerType: "character", ownerId: char.id, novelId, text });
      count++;
    }
    return count;
  }

  /**
   * 索引作品的所有资料库内容
   * 将 KnowledgeAsset 的 title + content 组合为文本（复用现有逻辑）
   */
  async upsertKnowledgeAssetChunks(novelId: string): Promise<number> {
    const assets = await prisma.knowledgeAsset.findMany({
      where: { novelId },
      select: { id: true, title: true, content: true },
    });

    let count = 0;
    for (const asset of assets) {
      const text = `${asset.title}\n\n${asset.content}`;
      if (!text.trim()) continue;

      await this.ingestText({ ownerType: "knowledge_asset", ownerId: asset.id, novelId, text });
      count++;
    }
    return count;
  }

  /**
   * 索引作品的所有章节内容
   * 将 Chapter 的 title + content 组合为文本
   */
  async upsertChapterChunks(novelId: string): Promise<number> {
    const chapters = await prisma.chapter.findMany({
      where: { novelId, content: { not: "" } },
      select: { id: true, title: true, content: true, order: true },
      orderBy: { order: "asc" },
    });

    let count = 0;
    for (const chapter of chapters) {
      const text = `第${chapter.order}章 ${chapter.title}\n\n${chapter.content}`;
      if (!text.trim()) continue;

      await this.ingestText({ ownerType: "chapter", ownerId: chapter.id, novelId, text });
      count++;
    }
    return count;
  }

  /**
   * 重建作品的完整 RAG 索引：世界观 + 角色 + 资料库 + 章节
   * 返回各数据源的索引统计
   */
  async reindexAll(novelId: string): Promise<{
    worldviews: number;
    characters: number;
    knowledgeAssets: number;
    chapters: number;
    total: number;
  }> {
    const [worldviews, characters, knowledgeAssets, chapters] = await Promise.all([
      this.upsertWorldviewChunks(novelId),
      this.upsertCharacterChunks(novelId),
      this.upsertKnowledgeAssetChunks(novelId),
      this.upsertChapterChunks(novelId),
    ]);

    const total = worldviews + characters + knowledgeAssets + chapters;
    return { worldviews, characters, knowledgeAssets, chapters, total };
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
