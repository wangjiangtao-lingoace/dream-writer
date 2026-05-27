import { Router, Request, Response } from "express";
import { SearchProviderService, type SearchResult } from "../services/SearchProviderService";
import { ContentExtractionService, type ExtractedContent } from "../services/ContentExtractionService";

const router = Router();

// 服务实例
const searchProvider = new SearchProviderService();
const contentExtractor = new ContentExtractionService();

const TITLE_ALIASES: Record<string, string[]> = {
  "权宠天下": ["权宠天下", "医妃倾天下", "元后传"],
  "医妃倾天下": ["权宠天下", "医妃倾天下", "元后传"],
  "元后传": ["权宠天下", "医妃倾天下", "元后传"],
  "弃女轻狂毒妃狠嚣张": ["弃女轻狂毒妃狠嚣张", "弃女轻狂毒妃很嚣张"],
};

const KNOWN_SOURCE_URLS: Record<string, string[]> = {
  "权宠天下": [
    "https://www.guazixs.cn/book/5520",
    "https://m.lrts.me/book/38150144",
  ],
  "医妃倾天下": [
    "https://www.guazixs.cn/book/5520",
    "https://m.lrts.me/book/38150144",
  ],
  "元后传": [
    "https://www.guazixs.cn/book/5520",
    "https://m.lrts.me/book/38150144",
  ],
};

// 常见错别字映射
const CHAR_CORRECTIONS: Record<string, string> = {
  "很": "狠",  // 毒妃很嚣张 → 毒妃狠嚣张
};

// ============================================================
// 主搜索流程
// ============================================================

async function handleNovelSearch(req: Request, res: Response) {
  try {
    const title = String(req.body?.title || req.query?.title || "").trim();
    const normalizedTitle = normalizeSearchTitle(title);

    if (!title) {
      return res.status(400).json({ success: false, error: "请输入作品标题" });
    }

    console.log(`[搜索] 原始标题: "${title}", 标准化后: "${normalizedTitle}"`);

    const titleVariants = getTitleVariants(normalizedTitle);
    console.log(`[搜索] 标题变体:`, titleVariants);

    // 新流程：使用 SearchProviderService 搜索
    const searchResult = await searchProvider.searchMultiple(titleVariants, { count: 10 });
    console.log(`[搜索] Provider: ${searchResult.provider}, 结果数: ${searchResult.results.length}`);

    if (searchResult.results.length > 0) {
      // 对搜索结果提取内容
      const extractedResults = await extractAndValidateResults(
        searchResult.results,
        titleVariants,
        searchResult.provider,
      );

      if (extractedResults.length > 0) {
        // 按置信度排序
        const sortedResults = extractedResults.sort((a, b) => b.confidence - a.confidence);
        const best = sortedResults[0];

        console.log(`[搜索] 找到 ${sortedResults.length} 个有效来源，最高置信度: ${best.confidence}`);

        return res.json({
          success: true,
          data: {
            title,
            matchedTitle: titleVariants[0],
            status: "found",
            sourcePolicy: searchResult.provider === "sogou" ? "sogou_fallback" : "api_search",
            sources: sortedResults.map((r) => ({
              sourceUrl: r.url,
              sourceTitle: r.title,
              excerpt: r.synopsis.slice(0, 200),
              confidence: Number(r.confidence.toFixed(2)),
            })),
            rawContent: best.bodyText,
            synopsis: best.synopsis,
            confidence: best.confidence,
          },
        });
      }
    }

    // 搜索API无结果，尝试已知来源URL
    console.log(`[搜索] API搜索无结果，尝试已知来源URL`);
    const knownResults = await tryKnownSources(titleVariants);
    if (knownResults) {
      return res.json({
        success: true,
        data: {
          title,
          matchedTitle: titleVariants[0],
          status: "found",
          sourcePolicy: "known_source",
          sources: knownResults.sources,
          rawContent: knownResults.rawContent,
          synopsis: knownResults.synopsis,
          confidence: knownResults.confidence,
        },
      });
    }

    // 所有搜索失败，返回 no_source_found
    res.json({
      success: true,
      data: {
        title,
        status: "no_source_found",
        sourcePolicy: "api_search",
        sources: [],
        synopsis: "",
        rawContent: "",
        confidence: 0,
        failureReason: "未找到可追踪的真实来源。请粘贴资料后再拆书，或确认使用 AI 推测草案。",
      },
    });
  } catch (error: any) {
    console.error("搜索失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================================
// 内容提取和验证
// ============================================================

interface ValidatedResult {
  url: string;
  title: string;
  synopsis: string;
  bodyText: string;
  confidence: number;
  provider: string;
}

async function extractAndValidateResults(
  searchResults: SearchResult[],
  titleVariants: string[],
  provider: string,
): Promise<ValidatedResult[]> {
  const results: ValidatedResult[] = [];

  // 并发提取前5个结果的内容
  const topResults = searchResults.slice(0, 5);
  const extractionPromises = topResults.map(async (result) => {
    try {
      // 使用 ContentExtractionService.extract 方法，它内部处理 HTML 获取
      const extracted = await contentExtractor.extract(result.url, titleVariants);

      // 验证质量
      if (extracted && isValidResult(extracted, titleVariants)) {
        return {
          url: result.url,
          title: extracted.title || result.title,
          synopsis: extracted.synopsis || result.snippet,
          bodyText: extracted.bodyText,
          confidence: extracted.confidence,
          provider,
        };
      }
    } catch (error: any) {
      console.warn(`[搜索] 提取失败 ${result.url}: ${error.message}`);
    }
    return null;
  });

  const extractionResults = await Promise.allSettled(extractionPromises);

  for (const result of extractionResults) {
    if (result.status === "fulfilled" && result.value) {
      results.push(result.value);
    }
  }

  return results;
}

function isValidResult(extracted: ExtractedContent, titleVariants: string[]): boolean {
  // 必须有简介或正文
  if (!extracted.synopsis && !extracted.bodyText) {
    return false;
  }

  // 简介或正文必须包含标题变体之一
  const text = extracted.synopsis + extracted.bodyText;
  const hasTitle = titleVariants.some((t) => text.includes(t));
  if (!hasTitle) {
    return false;
  }

  // 内容长度检查
  if (extracted.synopsis.length < 20 && extracted.bodyText.length < 50) {
    return false;
  }

  // 噪音检查
  const noisePatterns = [
    /访问的页面/,
    /数据访问失败/,
    /404/,
    /页面不存在/,
    /请输入关键词/,
    /搜索结果/,
  ];

  if (noisePatterns.some((pattern) => pattern.test(extracted.synopsis))) {
    return false;
  }

  return true;
}

// ============================================================
// 已知来源URL尝试
// ============================================================

async function tryKnownSources(titleVariants: string[]): Promise<{
  sources: Array<{ sourceUrl: string; sourceTitle: string; excerpt: string; confidence: number }>;
  rawContent: string;
  synopsis: string;
  confidence: number;
} | null> {
  // 收集所有已知来源URL
  const knownUrls: string[] = [];
  for (const name of titleVariants) {
    if (KNOWN_SOURCE_URLS[name]) {
      knownUrls.push(...KNOWN_SOURCE_URLS[name]);
    }
  }

  if (knownUrls.length === 0) return null;

  // 尝试提取已知来源内容
  for (const url of knownUrls) {
    try {
      const extracted = await contentExtractor.extract(url, titleVariants);

      if (extracted && (extracted.synopsis.length > 20 || extracted.bodyText.length > 50)) {
        return {
          sources: [{
            sourceUrl: url,
            sourceTitle: extracted.title || titleVariants[0],
            excerpt: extracted.synopsis.slice(0, 200),
            confidence: extracted.confidence,
          }],
          rawContent: extracted.bodyText,
          synopsis: extracted.synopsis,
          confidence: extracted.confidence,
        };
      }
    } catch {
      // 继续尝试下一个
    }
  }

  return null;
}

// ============================================================
// 路由注册
// ============================================================

router.get("/novel", handleNovelSearch);
router.post("/novel", handleNovelSearch);

// ============================================================
// 工具函数（保留原有逻辑）
// ============================================================

function getTitleVariants(title: string): string[] {
  const matchedAlias = findKnownAlias(title);
  const canonicalTitle = matchedAlias || title;
  const variants = new Set([canonicalTitle, ...(TITLE_ALIASES[canonicalTitle] || [])]);

  // 添加常见错别字变体
  for (const [wrong, correct] of Object.entries(CHAR_CORRECTIONS)) {
    for (const v of [...variants]) {
      if (v.includes(wrong)) {
        variants.add(v.replace(wrong, correct));
      }
      if (v.includes(correct)) {
        variants.add(v.replace(correct, wrong));
      }
    }
  }

  return Array.from(variants);
}

function normalizeSearchTitle(title: string): string {
  const cleaned = title
    .replace(/[《》""''`]/g, "")
    .replace(/\s+/g, "")
    .replace(/^(我要|请|帮我|帮忙|自动|一键)?(拆书|拆解|分析|仿写|参考|查询|搜索|资料|小说)[:：-]?/g, "")
    .replace(/(小说|原著|全文|免费阅读|拆书|拆解|分析|仿写|参考|资料|流程|报告)$/g, "")
    .replace(/(拆书|拆解|分析|仿写|参考|资料)/g, "")
    .trim();

  // 自动纠正常见错别字
  let corrected = cleaned;
  for (const [wrong, correct] of Object.entries(CHAR_CORRECTIONS)) {
    corrected = corrected.replace(new RegExp(wrong, "g"), correct);
  }

  return findKnownAlias(corrected) || findKnownAlias(cleaned) || corrected;
}

function findKnownAlias(title: string): string | null {
  for (const [canonicalTitle, aliases] of Object.entries(TITLE_ALIASES)) {
    if (title.includes(canonicalTitle) || aliases.some((alias) => title.includes(alias))) {
      return canonicalTitle;
    }
  }
  return null;
}

export default router;
