import Database from "better-sqlite3";
import path from "node:path";
import { prisma } from "../db/prisma";
import { getEmbeddingService } from "./EmbeddingService";
import { getVectorStore } from "../db/vectorStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetrieveOptions {
  novelId: string;
  topK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
}

interface FtsChunkRow {
  chunk_id: string;
  rank: number;
}

interface RrfEntry {
  chunkId: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RRF_K = 60;
const DEFAULT_TOP_K = 8;
const CANDIDATE_POOL = 20;
const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_BM25_WEIGHT = 0.4;

// ---------------------------------------------------------------------------
// RagRetrieveService
// ---------------------------------------------------------------------------

class RagRetrieveService {
  private ftsDb: Database.Database;
  private ftsAvailable = true;

  constructor() {
    const dbPath = this.resolveDatabasePath();
    this.ftsDb = new Database(dbPath);
    this.ensureFtsTable();
  }

  // -- Init ----------------------------------------------------------------

  private resolveDatabasePath(): string {
    const serverRoot = path.resolve(__dirname, "..", "..");
    const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
    if (!databaseUrl.startsWith("file:")) {
      return databaseUrl;
    }
    const filePath = databaseUrl.slice("file:".length) || "./dev.db";
    return path.isAbsolute(filePath)
      ? filePath
      : path.resolve(serverRoot, filePath);
  }

  private ensureFtsTable(): void {
    try {
      this.ftsDb.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
          chunk_id UNINDEXED,
          text,
          owner_type UNINDEXED,
          owner_id UNINDEXED,
          novel_id UNINDEXED,
          tokenize = 'unicode61'
        )
      `);
    } catch (error) {
      console.warn(
        "[RagRetrieveService] FTS5 初始化失败，BM25 检索不可用:",
        error,
      );
      this.ftsAvailable = false;
    }
  }

  // -- Public: FTS Sync Methods --------------------------------------------

  /**
   * 在 RagIngestService.createMany 之后调用，
   * 将新写入的 chunks 同步到 FTS5 虚表
   */
  syncFtsAfterInsert(
    chunks: Array<{
      id: string;
      text: string;
      ownerType: string;
      ownerId: string;
      novelId: string | null;
    }>,
  ): void {
    if (!this.ftsAvailable || chunks.length === 0) return;

    const stmt = this.ftsDb.prepare(`
      INSERT INTO rag_chunks_fts (chunk_id, text, owner_type, owner_id, novel_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = this.ftsDb.transaction(
      (rows: typeof chunks) => {
        for (const row of rows) {
          stmt.run(
            row.id,
            row.text,
            row.ownerType,
            row.ownerId,
            row.novelId ?? "",
          );
        }
      },
    );

    try {
      insertMany(chunks);
    } catch (error) {
      console.error("[RagRetrieveService] FTS 同步写入失败:", error);
    }
  }

  /**
   * 在 RagIngestService.deleteMany 之后调用，
   * 清除 FTS5 虚表中对应 owner 的数据
   */
  syncFtsAfterDelete(ownerType: string, ownerId: string): void {
    if (!this.ftsAvailable) return;

    try {
      this.ftsDb
        .prepare(
          `DELETE FROM rag_chunks_fts WHERE owner_type = ? AND owner_id = ?`,
        )
        .run(ownerType, ownerId);
    } catch (error) {
      console.error("[RagRetrieveService] FTS 同步删除失败:", error);
    }
  }

  // -- Public: Retrieve ----------------------------------------------------

  /**
   * 混合检索主入口：向量检索 + BM25 检索 → RRF 融合 → 返回格式化上下文
   *
   * 降级策略：
   * - 嵌入 API 不可用 → 仅 BM25
   * - sqlite-vec 不可用 → 仅 BM25
   * - 索引为空 → 返回空字符串
   */
  async retrieve(query: string, options: RetrieveOptions): Promise<string> {
    const {
      novelId,
      topK = DEFAULT_TOP_K,
      vectorWeight = DEFAULT_VECTOR_WEIGHT,
      bm25Weight = DEFAULT_BM25_WEIGHT,
    } = options;

    if (!novelId || novelId.trim().length === 0) {
      return "";
    }

    const [vectorResults, bm25Results] = await Promise.all([
      this.vectorSearch(query, novelId).catch(() => [] as string[]),
      this.bm25Search(query, novelId),
    ]);

    // 两个通道都无结果
    if (vectorResults.length === 0 && bm25Results.length === 0) {
      return "";
    }

    // 单通道降级
    if (vectorResults.length === 0) {
      return await this.formatContext(bm25Results.slice(0, topK));
    }
    if (bm25Results.length === 0) {
      return await this.formatContext(vectorResults.slice(0, topK));
    }

    // RRF 融合
    const fused = this.rrfFusion(vectorResults, bm25Results, {
      vectorWeight,
      bm25Weight,
    });

    const topChunkIds = fused.slice(0, topK).map((e) => e.chunkId);
    return await this.formatContext(topChunkIds);
  }

  // -- Private: Vector Search ----------------------------------------------

  private async vectorSearch(
    query: string,
    novelId: string,
  ): Promise<string[]> {
    const embeddingService = getEmbeddingService();
    const vectorStore = getVectorStore();

    if (!embeddingService || !vectorStore.isAvailable()) {
      return [];
    }

    try {
      const queryEmbedding = await embeddingService.embedText(query);
      const results = await vectorStore.search(queryEmbedding, {
        novelId,
        topK: CANDIDATE_POOL,
      });
      return results.map((r) => r.chunkId);
    } catch (error) {
      console.warn("[RagRetrieveService] 向量检索失败，降级为仅 BM25:", error);
      return [];
    }
  }

  // -- Private: BM25 Search ------------------------------------------------

  /**
   * 将用户输入转义为 FTS5 安全的短语查询。
   * 对双引号转义后整体包裹双引号，使输入被当作字面短语匹配。
   */
  private escapeFts5Query(query: string): string {
    const escaped = query.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private async bm25Search(query: string, novelId: string): Promise<string[]> {
    if (!this.ftsAvailable) return [];

    try {
      const safeQuery = this.escapeFts5Query(query);
      // FTS5 MATCH 查询，按 bm25() 排序（值越小越相关）
      const rows = this.ftsDb
        .prepare(
          `
          SELECT chunk_id, rank
          FROM rag_chunks_fts
          WHERE rag_chunks_fts MATCH ?
            AND novel_id = ?
          ORDER BY rank
          LIMIT ?
        `,
        )
        .all(safeQuery, novelId, CANDIDATE_POOL) as FtsChunkRow[];

      return rows.map((r) => r.chunk_id);
    } catch (error) {
      // MATCH 语法错误（如特殊字符）时静默降级
      console.warn("[RagRetrieveService] BM25 检索失败:", error);
      return [];
    }
  }

  // -- Private: RRF Fusion -------------------------------------------------

  private rrfFusion(
    vectorIds: string[],
    bm25Ids: string[],
    weights: { vectorWeight: number; bm25Weight: number },
  ): RrfEntry[] {
    const scoreMap = new Map<string, number>();

    // 向量检索得分
    for (let i = 0; i < vectorIds.length; i++) {
      const id = vectorIds[i];
      const prev = scoreMap.get(id) ?? 0;
      scoreMap.set(
        id,
        prev + weights.vectorWeight / (RRF_K + i + 1),
      );
    }

    // BM25 检索得分
    for (let i = 0; i < bm25Ids.length; i++) {
      const id = bm25Ids[i];
      const prev = scoreMap.get(id) ?? 0;
      scoreMap.set(
        id,
        prev + weights.bm25Weight / (RRF_K + i + 1),
      );
    }

    // 按融合得分降序排列
    return Array.from(scoreMap.entries())
      .map(([chunkId, score]) => ({ chunkId, score }))
      .sort((a, b) => b.score - a.score);
  }

  // -- Private: Format Context ---------------------------------------------

  private async formatContext(chunkIds: string[]): Promise<string> {
    if (chunkIds.length === 0) return "";

    const chunks = await prisma.ragChunk.findMany({
      where: { id: { in: chunkIds } },
      select: { id: true, text: true, ownerType: true },
    });

    // 保持 RRF 排序顺序
    const orderMap = new Map(chunkIds.map((id, i) => [id, i]));
    chunks.sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );

    return chunks
      .map((c, i) => `[${i + 1}] (${c.ownerType}) ${c.text}`)
      .join("\n\n");
  }

  // -- Lifecycle ------------------------------------------------------------

  close(): void {
    this.ftsDb.close();
    ragRetrieveServiceInstance = null;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let ragRetrieveServiceInstance: RagRetrieveService | null = null;

/**
 * 获取 RagRetrieveService 单例
 * 启用 RAG 时返回实例，未启用时返回 null
 */
export function getRagRetrieveService(): RagRetrieveService | null {
  if (process.env.ENABLE_RAG !== "true") {
    return null;
  }
  if (!ragRetrieveServiceInstance) {
    ragRetrieveServiceInstance = new RagRetrieveService();
  }
  return ragRetrieveServiceInstance;
}

export { RagRetrieveService };
