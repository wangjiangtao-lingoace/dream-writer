/**
 * SearchProviderService - 搜索Provider抽象层
 *
 * 按优先级尝试多个搜索Provider（Bing → Google → Sogou），
 * 统一返回格式，优雅处理Provider错误并降级。
 */

// ============================================================
// 类型定义
// ============================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  fullText?: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, options?: { count?: number }): Promise<SearchResult[]>;
}

// ============================================================
// BingSearchProvider
// ============================================================

class BingSearchProvider implements SearchProvider {
  name = "bing";

  async search(query: string, options?: { count?: number }): Promise<SearchResult[]> {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error("BING_SEARCH_API_KEY not configured");
    }

    const count = options?.count ?? 10;
    const endpoint = "https://api.bing.microsoft.com/v7.0/search";
    const url = `${endpoint}?q=${encodeURIComponent(query)}&count=${count}&mkt=zh-CN`;

    const response = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429) {
      throw new Error("Bing API quota exceeded");
    }

    if (!response.ok) {
      throw new Error(`Bing API error: ${response.status}`);
    }

    const data = await response.json() as {
      webPages?: {
        value?: Array<{
          name: string;
          url: string;
          snippet: string;
        }>;
      };
    };

    const results: SearchResult[] = (data.webPages?.value || []).map((item) => ({
      title: item.name,
      url: item.url,
      snippet: item.snippet,
    }));

    return results;
  }
}

// ============================================================
// GoogleSearchProvider
// ============================================================

class GoogleSearchProvider implements SearchProvider {
  name = "google";

  async search(query: string, options?: { count?: number }): Promise<SearchResult[]> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;
    if (!apiKey || !cx) {
      throw new Error("GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX not configured");
    }

    const count = Math.min(options?.count ?? 10, 10); // Google max 10 per request
    const endpoint = "https://www.googleapis.com/customsearch/v1";
    const url = `${endpoint}?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${count}&lr=lang_zh-CN`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429) {
      throw new Error("Google API quota exceeded");
    }

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = await response.json() as {
      items?: Array<{
        title: string;
        link: string;
        snippet: string;
      }>;
    };

    const results: SearchResult[] = (data.items || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));

    return results;
  }
}

// ============================================================
// SogouScrapingProvider（保留现有抓取逻辑作为最后手段）
// ============================================================

class SogouScrapingProvider implements SearchProvider {
  name = "sogou";

  async search(query: string, options?: { count?: number }): Promise<SearchResult[]> {
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Sogou request failed: ${response.status}`);
    }

    const html = await response.text();
    return this.parseSogouResults(html, query);
  }

  private parseSogouResults(html: string, query: string): SearchResult[] {
    const results: SearchResult[] = [];

    // 提取搜索结果条目 - 搜狗结果通常在 <div class="vrwrap"> 或 <div class="rb"> 中
    const resultRegex = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi;
    let match;

    while ((match = resultRegex.exec(html)) !== null) {
      const url = match[1];
      const titleHtml = match[2];
      const title = titleHtml.replace(/<[^>]+>/g, "").trim();

      if (title && url && !url.includes("sogou.com")) {
        // 提取该结果附近的摘要文本
        const afterH3 = html.slice(match.index + match[0].length, match.index + match[0].length + 1000);
        const snippetMatch = afterH3.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const snippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
          : "";

        results.push({ title, url, snippet });
      }
    }

    // 备用提取：如果上面没有匹配到，尝试提取百科摘要
    if (results.length === 0) {
      const cleanHtml = html.replace(/<!--[^>]*-->/g, "").replace(/<[^>]+>/g, "");
      const baikeRegex = /是一部[^。]{5,}类型[^。]*网络小说[^。]*。[^。]*作者是[^。]*。/;
      const baikeMatch = cleanHtml.match(baikeRegex);
      if (baikeMatch) {
        results.push({
          title: query,
          url: `https://www.sogou.com/web?query=${encodeURIComponent(query)}`,
          snippet: baikeMatch[0],
        });
      }
    }

    return results;
  }
}

// ============================================================
// SearchProviderService - 主服务类
// ============================================================

export class SearchProviderService {
  private providers: SearchProvider[];
  private priority: string[];

  constructor() {
    // 从环境变量读取优先级配置，默认 Bing → Google → Sogou
    const priorityEnv = process.env.SEARCH_PROVIDER_PRIORITY || "bing,google,sogou";
    this.priority = priorityEnv.split(",").map((p) => p.trim().toLowerCase());

    const providerMap: Record<string, SearchProvider> = {
      bing: new BingSearchProvider(),
      google: new GoogleSearchProvider(),
      sogou: new SogouScrapingProvider(),
    };

    this.providers = this.priority
      .map((name) => providerMap[name])
      .filter((p): p is SearchProvider => p !== undefined);
  }

  /**
   * 按优先级顺序尝试Provider搜索
   * @param query 搜索关键词
   * @param options 搜索选项
   * @returns 搜索结果，包含使用的Provider名称
   */
  async search(query: string, options?: { count?: number }): Promise<{
    results: SearchResult[];
    provider: string;
  }> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of this.providers) {
      try {
        console.log(`[SearchProvider] 尝试 ${provider.name} 搜索: "${query}"`);
        const results = await provider.search(query, options);

        if (results.length > 0) {
          console.log(`[SearchProvider] ${provider.name} 返回 ${results.length} 条结果`);
          return { results, provider: provider.name };
        }

        console.log(`[SearchProvider] ${provider.name} 无结果，尝试下一个`);
      } catch (error: any) {
        const errorMsg = error.message || "unknown error";
        console.warn(`[SearchProvider] ${provider.name} 失败: ${errorMsg}`);
        errors.push({ provider: provider.name, error: errorMsg });
        // 继续尝试下一个Provider
      }
    }

    // 所有Provider都失败
    console.warn(`[SearchProvider] 所有Provider失败:`, errors);
    return { results: [], provider: "none" };
  }

  /**
   * 批量搜索多个关键词变体
   * @param queries 关键词列表
   * @param options 搜索选项
   * @returns 合并去重后的结果
   */
  async searchMultiple(queries: string[], options?: { count?: number }): Promise<{
    results: SearchResult[];
    provider: string;
  }> {
    const allResults: SearchResult[] = [];
    let usedProvider = "none";

    for (const query of queries) {
      const { results, provider } = await this.search(query, options);
      if (results.length > 0) {
        allResults.push(...results);
        usedProvider = provider;
        // 如果第一个变体就找到了结果，继续用同一个Provider搜索其他变体
      }
    }

    // 去重（按URL）
    const seen = new Set<string>();
    const deduplicated = allResults.filter((result) => {
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    });

    return { results: deduplicated, provider: usedProvider };
  }
}
