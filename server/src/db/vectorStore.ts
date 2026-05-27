import Database from "better-sqlite3";
import path from "node:path";
import { load as loadSqliteVec } from "sqlite-vec";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorEntry {
  chunkId: string;
  ownerType: string;
  ownerId: string;
  novelId: string;
  embedModel: string;
  embedding: number[];
}

export interface SearchOptions {
  novelId?: string;
  ownerTypes?: string[];
  topK?: number;
  threshold?: number;
}

export interface SearchResult {
  chunkId: string;
  distance: number;
}

export interface IndexStats {
  totalVectors: number;
  byOwnerType: Record<string, number>;
  byNovel: Record<string, number>;
  models: string[];
}

// ---------------------------------------------------------------------------
// VectorStore
// ---------------------------------------------------------------------------

class VectorStore {
  private db: Database.Database;
  private dimension: number;
  private available = true;

  constructor(dimension = 1536) {
    this.dimension = dimension;

    // 1. Resolve database path (same logic as prisma.ts)
    const dbPath = this.resolveDatabasePath();

    // 2. Create better-sqlite3 connection
    this.db = new Database(dbPath);

    // 3. Load sqlite-vec extension
    try {
      loadSqliteVec(this.db);
    } catch (error) {
      console.warn(
        "[VectorStore] Failed to load sqlite-vec extension, vector search disabled:",
        error,
      );
      this.available = false;
      return;
    }

    // 4. Create vec0 virtual table
    this.ensureTable();
  }

  // -- helpers -------------------------------------------------------------

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

  private ensureTable(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS rag_vectors USING vec0(
        chunk_id TEXT PRIMARY KEY,
        owner_type TEXT,
        owner_id TEXT,
        novel_id TEXT,
        embed_model TEXT,
        embedding float[${this.dimension}]
      )
    `);
  }

  // -- public API ----------------------------------------------------------

  isAvailable(): boolean {
    return this.available;
  }

  async insertVectors(vectors: VectorEntry[]): Promise<void> {
    if (!this.available || vectors.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rag_vectors
        (chunk_id, owner_type, owner_id, novel_id, embed_model, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((entries: VectorEntry[]) => {
      for (const entry of entries) {
        stmt.run(
          entry.chunkId,
          entry.ownerType,
          entry.ownerId,
          entry.novelId,
          entry.embedModel,
          // sqlite-vec accepts JSON array for float[] columns
          JSON.stringify(entry.embedding),
        );
      }
    });

    insertMany(vectors);
  }

  async search(
    queryEmbedding: number[],
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    if (!this.available) return [];

    const { novelId, ownerTypes, topK = 10, threshold } = options;

    // Build optional WHERE pre-filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (novelId) {
      conditions.push("novel_id = ?");
      params.push(novelId);
    }

    if (ownerTypes && ownerTypes.length > 0) {
      conditions.push(
        `owner_type IN (${ownerTypes.map(() => "?").join(",")})`,
      );
      params.push(...ownerTypes);
    }

    const preWhere =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // sqlite-vec KNN query:
    //   The `AND embedding MATCH ? AND k = ?` clause must come AFTER the
    //   optional WHERE filters. sqlite-vec rewrites the query internally.
    const sql = `
      SELECT chunk_id, distance
      FROM rag_vectors
      ${preWhere}
      ${conditions.length > 0 ? "AND" : "WHERE"} embedding MATCH ?
        AND k = ?
      ORDER BY distance
    `;

    params.push(JSON.stringify(queryEmbedding));
    params.push(topK);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      chunk_id: string;
      distance: number;
    }>;

    // Apply distance threshold if specified
    const results: SearchResult[] = rows.map((row) => ({
      chunkId: row.chunk_id,
      distance: row.distance,
    }));

    if (threshold !== undefined) {
      return results.filter((r) => r.distance <= threshold);
    }

    return results;
  }

  async deleteByOwner(ownerType: string, ownerId: string): Promise<void> {
    if (!this.available) return;

    this.db
      .prepare(
        `DELETE FROM rag_vectors WHERE owner_type = ? AND owner_id = ?`,
      )
      .run(ownerType, ownerId);
  }

  async deleteByNovel(novelId: string): Promise<void> {
    if (!this.available) return;

    this.db
      .prepare(`DELETE FROM rag_vectors WHERE novel_id = ?`)
      .run(novelId);
  }

  async getStats(): Promise<IndexStats> {
    if (!this.available) {
      return { totalVectors: 0, byOwnerType: {}, byNovel: {}, models: [] };
    }

    const total = this.db
      .prepare("SELECT COUNT(*) as count FROM rag_vectors")
      .get() as { count: number };

    const byOwnerType = this.db
      .prepare(
        `SELECT owner_type, COUNT(*) as count FROM rag_vectors GROUP BY owner_type`,
      )
      .all() as Array<{ owner_type: string; count: number }>;

    const byNovel = this.db
      .prepare(
        `SELECT novel_id, COUNT(*) as count FROM rag_vectors WHERE novel_id != '' GROUP BY novel_id`,
      )
      .all() as Array<{ novel_id: string; count: number }>;

    const models = this.db
      .prepare(`SELECT DISTINCT embed_model FROM rag_vectors`)
      .all() as Array<{ embed_model: string }>;

    return {
      totalVectors: total.count,
      byOwnerType: Object.fromEntries(
        byOwnerType.map((r) => [r.owner_type, r.count]),
      ),
      byNovel: Object.fromEntries(
        byNovel.map((r) => [r.novel_id, r.count]),
      ),
      models: models.map((r) => r.embed_model),
    };
  }

  close(): void {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(dimension?: number): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(dimension);
  }
  return vectorStoreInstance;
}

export { VectorStore };
