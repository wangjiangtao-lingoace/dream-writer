import { prisma } from "../db/prisma";
import { decryptApiKey } from "../utils/crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

interface ResolvedEmbeddingConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  dimension: number;
}

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
}

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 600;
const DEFAULT_CHUNK_OVERLAP = 100;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSION = 1536;
const DEFAULT_BATCH_SIZE = 64;

// 分隔符优先级（中文密度高，优先段落/句号/逗号）
// 每个元素是单个分隔符或多字符分隔符，按优先级从高到低排列
const SEPARATORS: string[] = [
  "\n\n",  // 段落
  "\n",    // 换行
  "。",    // 句号
  "！",    // 感叹号
  "？",    // 问号
  "；",    // 分号
  ".",     // 英文句号
  "!",     // 英文感叹号
  "?",     // 英文问号
  "，",    // 逗号
  ",",     // 英文逗号
  " ",     // 空格
];

// ---------------------------------------------------------------------------
// 嵌入服务
// ---------------------------------------------------------------------------

class EmbeddingService {
  private configPromise: Promise<ResolvedEmbeddingConfig | null> | null = null;

  // -- 配置解析 ------------------------------------------------------------

  /**
   * 解析嵌入模型配置
   * 优先级: AppSetting(rag.embedding.*) > AIConfig(默认) > .env 环境变量
   */
  private async resolveConfig(): Promise<ResolvedEmbeddingConfig | null> {
    // 1. 从 AppSetting 读取 RAG 嵌入专用配置
    try {
      const keys = ["rag.embedding.model", "rag.embedding.baseUrl", "rag.embedding.dimension"];
      const settings = await prisma.appSetting.findMany({
        where: { key: { in: keys } },
      });
      const settingMap = new Map(settings.map((s) => [s.key, s.value]));

      const model = settingMap.get("rag.embedding.model")?.trim();
      const baseUrl = settingMap.get("rag.embedding.baseUrl")?.trim();
      const dimensionStr = settingMap.get("rag.embedding.dimension")?.trim();

      // 如果 AppSetting 中有完整的嵌入配置，直接使用
      if (model && baseUrl) {
        const dimension = dimensionStr ? parseInt(dimensionStr, 10) : DEFAULT_EMBEDDING_DIMENSION;
        // 嵌入 API 需要 apiKey，从 AIConfig 或环境变量获取
        const apiKey = await this.resolveApiKey();
        if (!apiKey) return null;
        return { model, baseUrl, apiKey, dimension };
      }
    } catch {
      // AppSetting 查询失败，继续降级
    }

    // 2. 从 AIConfig 读取默认 LLM 配置（复用 LlmInvokeService 模式）
    try {
      const dbConfig = await prisma.aIConfig.findFirst({ where: { isDefault: true } });
      if (dbConfig) {
        const baseUrl = dbConfig.baseUrl || "https://api.openai.com/v1";
        const apiKey = decryptApiKey(dbConfig.apiKey);
        return {
          model: DEFAULT_EMBEDDING_MODEL,
          baseUrl,
          apiKey,
          dimension: DEFAULT_EMBEDDING_DIMENSION,
        };
      }
    } catch {
      // AIConfig 查询失败，继续降级
    }

    // 3. 从环境变量降级
    const baseUrl = process.env.DEFAULT_LLM_BASE_URL?.trim()
      || process.env.OPENAI_BASE_URL?.trim()
      || "https://api.openai.com/v1";
    const apiKey = process.env.DEFAULT_LLM_API_KEY?.trim()
      || process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) return null;

    return {
      model: DEFAULT_EMBEDDING_MODEL,
      baseUrl,
      apiKey,
      dimension: DEFAULT_EMBEDDING_DIMENSION,
    };
  }

  /**
   * 单独解析 API Key（用于 AppSetting 有 model/baseUrl 但无 key 的场景）
   */
  private async resolveApiKey(): Promise<string | null> {
    try {
      const dbConfig = await prisma.aIConfig.findFirst({ where: { isDefault: true } });
      if (dbConfig) {
        return decryptApiKey(dbConfig.apiKey);
      }
    } catch {
      // 降级到环境变量
    }
    return process.env.DEFAULT_LLM_API_KEY?.trim()
      || process.env.OPENAI_API_KEY?.trim()
      || null;
  }

  /**
   * 获取解析后的配置（带缓存）
   */
  private async getConfig(): Promise<ResolvedEmbeddingConfig | null> {
    if (!this.configPromise) {
      this.configPromise = this.resolveConfig();
    }
    return this.configPromise;
  }

  /**
   * 清除配置缓存（配置变更时调用）
   */
  clearConfigCache(): void {
    this.configPromise = null;
  }

  // -- 文本切片 ------------------------------------------------------------

  /**
   * 将文本切分为重叠片段
   * 支持中文分隔符优先级：段落 → 句号 → 逗号 → 空格
   */
  chunkText(text: string, options?: ChunkOptions): string[] {
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

    if (!text || text.trim().length === 0) return [];

    // JSON 内容预处理：扁平化为可读文本
    const processed = this.flattenIfJson(text);

    if (processed.length <= chunkSize) {
      return [processed];
    }

    // 递归分割
    const chunks: string[] = [];
    this.splitRecursive(processed, chunkSize, chunkOverlap, chunks);
    return chunks.filter((c) => c.trim().length > 0);
  }

  /**
   * 递归分割文本，按分隔符优先级逐级尝试
   */
  private splitRecursive(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    result: string[],
  ): void {
    if (text.length <= chunkSize) {
      result.push(text);
      return;
    }

    // 尝试按分隔符找到最佳切割点
    const splitPoint = this.findBestSplitPoint(text, chunkSize);

    if (splitPoint <= 0) {
      // 找不到合适的切割点，硬切
      result.push(text.slice(0, chunkSize));
      this.splitRecursive(text.slice(chunkSize - chunkOverlap), chunkSize, chunkOverlap, result);
      return;
    }

    const chunk = text.slice(0, splitPoint).trimEnd();
    if (chunk.length > 0) {
      result.push(chunk);
    }

    // 从重叠区域开始继续分割
    // 确保 overlap < splitPoint 以保证每次递归都能推进
    const effectiveOverlap = Math.min(chunkOverlap, splitPoint - 1);
    const overlapStart = Math.max(0, splitPoint - effectiveOverlap);
    const remaining = text.slice(overlapStart);
    if (remaining.length > 0 && remaining.length < text.length) {
      this.splitRecursive(remaining, chunkSize, chunkOverlap, result);
    } else if (remaining.length > 0) {
      // 防止无限递归：硬切
      result.push(remaining);
    }
  }

  /**
   * 在 chunkSize 范围内找到最佳切割点（按分隔符优先级）
   */
  private findBestSplitPoint(text: string, chunkSize: number): number {
    const searchRegion = text.slice(0, chunkSize);

    for (const sep of SEPARATORS) {
      const lastIndex = searchRegion.lastIndexOf(sep);
      if (lastIndex > chunkSize * 0.3) {
        // 切割点至少在 30% 位置之后，避免产生过短片段
        return lastIndex + sep.length;
      }
    }

    return -1;
  }

  /**
   * JSON 内容预处理：将 JSON 扁平化为可读文本
   */
  private flattenIfJson(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return text;
    }

    try {
      const parsed = JSON.parse(trimmed);
      return this.flattenValue(parsed, 0);
    } catch {
      return text;
    }
  }

  /**
   * 递归扁平化 JSON 值
   */
  private flattenValue(value: unknown, depth: number): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    if (Array.isArray(value)) {
      return value
        .map((item) => this.flattenValue(item, depth + 1))
        .filter((s) => s.length > 0)
        .join("\n");
    }

    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      return entries
        .map(([key, val]) => {
          const flattened = this.flattenValue(val, depth + 1);
          if (!flattened) return "";
          // 深层嵌套用冒号连接 key:value
          if (depth > 0) return `${key}：${flattened}`;
          return flattened;
        })
        .filter((s) => s.length > 0)
        .join("\n");
    }

    return "";
  }

  // -- 嵌入 API 调用 -------------------------------------------------------

  /**
   * 对单个文本生成嵌入向量
   */
  async embedText(text: string): Promise<number[]> {
    const results = await this.embedTexts([text]);
    return results[0];
  }

  /**
   * 对多个文本批量生成嵌入向量
   * 保证返回顺序与输入顺序一致
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const config = await this.getConfig();
    if (!config) {
      throw new Error(
        "嵌入模型未配置。请在 AppSetting 中设置 rag.embedding.model/rag.embedding.baseUrl，" +
        "或配置 DEFAULT_LLM_API_KEY 环境变量。"
      );
    }

    // 批量处理
    const allEmbeddings: Array<{ index: number; embedding: number[] }> = [];

    for (let i = 0; i < texts.length; i += DEFAULT_BATCH_SIZE) {
      const batch = texts.slice(i, i + DEFAULT_BATCH_SIZE);
      const batchResults = await this.callEmbeddingApi(batch, config);
      // 修正全局索引
      for (const item of batchResults) {
        allEmbeddings.push({ index: i + item.index, embedding: item.embedding });
      }
    }

    // 按原始顺序排序
    allEmbeddings.sort((a, b) => a.index - b.index);
    return allEmbeddings.map((item) => item.embedding);
  }

  /**
   * 调用 OpenAI 兼容的 /embeddings 端点
   */
  private async callEmbeddingApi(
    texts: string[],
    config: ResolvedEmbeddingConfig,
  ): Promise<Array<{ index: number; embedding: number[] }>> {
    const url = `${config.baseUrl.replace(/\/$/, "")}/embeddings`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: texts,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `嵌入 API 调用失败 (${response.status}): ${errorText.slice(0, 200)}`
      );
    }

    const json = (await response.json()) as EmbeddingResponse;

    if (!json.data || !Array.isArray(json.data)) {
      throw new Error("嵌入 API 返回格式异常：缺少 data 字段");
    }

    return json.data.map((item) => ({
      index: item.index,
      embedding: item.embedding,
    }));
  }

  // -- 组合方法 ------------------------------------------------------------

  /**
   * 切片 + 嵌入一步完成
   */
  async chunkAndEmbed(
    text: string,
    options?: ChunkOptions,
  ): Promise<Array<{ text: string; embedding: number[] }>> {
    const chunks = this.chunkText(text, options);
    if (chunks.length === 0) return [];

    const embeddings = await this.embedTexts(chunks);
    return chunks.map((chunk, i) => ({
      text: chunk,
      embedding: embeddings[i],
    }));
  }

  // -- 元数据查询 ----------------------------------------------------------

  /**
   * 获取嵌入向量维度
   */
  async getDimension(): Promise<number> {
    const config = await this.getConfig();
    return config?.dimension ?? DEFAULT_EMBEDDING_DIMENSION;
  }

  /**
   * 获取嵌入模型名称
   */
  async getModelName(): Promise<string> {
    const config = await this.getConfig();
    return config?.model ?? DEFAULT_EMBEDDING_MODEL;
  }
}

// ---------------------------------------------------------------------------
// 单例
// ---------------------------------------------------------------------------

let embeddingServiceInstance: EmbeddingService | null = null;

/**
 * 获取 EmbeddingService 单例
 * 启用 RAG 时返回实例，未启用时返回 null
 */
export function getEmbeddingService(): EmbeddingService | null {
  if (process.env.ENABLE_RAG !== "true") {
    return null;
  }
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}

export { EmbeddingService };
