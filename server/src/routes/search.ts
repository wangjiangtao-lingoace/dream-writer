import { Router, Request, Response } from "express";

const router = Router();

const TITLE_ALIASES: Record<string, string[]> = {
  "权宠天下": ["权宠天下", "医妃倾天下", "元后传"],
  "医妃倾天下": ["权宠天下", "医妃倾天下", "元后传"],
  "元后传": ["权宠天下", "医妃倾天下", "元后传"],
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

async function handleNovelSearch(req: Request, res: Response) {
  try {
    const title = String(req.body?.title || req.query?.title || "").trim();
    const normalizedTitle = normalizeSearchTitle(title);
    
    if (!title) {
      return res.status(400).json({ success: false, error: "请输入作品标题" });
    }

    const titleVariants = getTitleVariants(normalizedTitle);
    const searchUrls = Array.from(new Set([
      ...(KNOWN_SOURCE_URLS[normalizedTitle] || []),
      ...titleVariants.flatMap((name) => [
        ...(KNOWN_SOURCE_URLS[name] || []),
        `https://www.qidian.com/so/${encodeURIComponent(name)}`,
        `https://www.zongheng.com/search?keyword=${encodeURIComponent(name)}`,
        `https://www.17k.com/search/keyword.html?keyword=${encodeURIComponent(name)}`,
        `https://www.guazixs.cn/search?keyword=${encodeURIComponent(name)}`,
        `https://m.lrts.me/search/book/${encodeURIComponent(name)}`,
      ]),
    ]));

    let bestScore = 0;

    // 尝试抓取每个URL，使用更快的超时
    const fetchPromises = searchUrls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const html = await response.text();
          const content = extractContent(html, titleVariants);
          const score = calculateScore(content, titleVariants);
          return {
            sourceUrl: url,
            sourceTitle: content.sourceTitle || title,
            excerpt: content.summary || content.fullText?.slice(0, 360) || "",
            rawContent: content.fullText?.substring(0, 3000) || "",
            confidence: Math.min(0.95, Math.max(0.1, score / 100)),
            score,
            success: true,
          };
        }
      } catch (error) {
        // 忽略超时和网络错误
      }
      return { sourceUrl: url, sourceTitle: title, excerpt: "", rawContent: "", confidence: 0, score: 0, success: false };
    });

    // 并发执行所有请求
    const results = await Promise.allSettled(fetchPromises);
    
    const verifiedSources: any[] = [];
    for (const result of results) {
      if (
        result.status === 'fulfilled'
        && result.value.success
        && result.value.score > 10
        && isVerifiedSourceUrl(result.value.sourceUrl)
        && isUsableSourceExcerpt(result.value.excerpt, titleVariants)
      ) {
        verifiedSources.push({
          sourceUrl: result.value.sourceUrl,
          sourceTitle: result.value.sourceTitle,
          excerpt: result.value.excerpt,
          confidence: Number(result.value.confidence.toFixed(2)),
          rawContent: result.value.rawContent,
        });
      }
      if (result.status === 'fulfilled' && result.value.success && result.value.score > bestScore) {
        bestScore = result.value.score;
      }
    }

    if (verifiedSources.length) {
      const sortedSources = verifiedSources.sort((a, b) => b.confidence - a.confidence);
      res.json({
        success: true,
        data: {
          title,
          matchedTitle: titleVariants[0],
          status: "found",
          sourcePolicy: "verified_only",
          sources: sortedSources.map(({ rawContent, ...source }) => source),
          rawContent: sortedSources[0]?.rawContent || "",
          synopsis: sortedSources[0]?.excerpt || "",
          confidence: sortedSources[0]?.confidence || 0,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          title,
          status: "no_source_found",
          sourcePolicy: "verified_only",
          sources: [],
          synopsis: "",
          rawContent: "",
          confidence: 0,
          failureReason: "未找到可追踪的真实来源。请粘贴资料后再拆书，或确认使用 AI 推测草案。",
        },
      });
    }
  } catch (error: any) {
    console.error("搜索失败:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 搜索小说内容
 * GET/POST /api/search/novel
 */
router.get("/novel", handleNovelSearch);
router.post("/novel", handleNovelSearch);

/**
 * 计算内容质量分数
 */
function getTitleVariants(title: string): string[] {
  const matchedAlias = findKnownAlias(title);
  const canonicalTitle = matchedAlias || title;
  return Array.from(new Set([canonicalTitle, ...(TITLE_ALIASES[canonicalTitle] || [])]));
}

function normalizeSearchTitle(title: string): string {
  const cleaned = title
    .replace(/[《》“”"'`]/g, "")
    .replace(/\s+/g, "")
    .replace(/^(我要|请|帮我|帮忙|自动|一键)?(拆书|拆解|分析|仿写|参考|查询|搜索|资料|小说)[:：-]?/g, "")
    .replace(/(小说|原著|全文|免费阅读|拆书|拆解|分析|仿写|参考|资料|流程|报告)$/g, "")
    .replace(/(拆书|拆解|分析|仿写|参考|资料)/g, "")
    .trim();
  return findKnownAlias(cleaned) || cleaned;
}

function findKnownAlias(title: string): string | null {
  for (const [canonicalTitle, aliases] of Object.entries(TITLE_ALIASES)) {
    if (title.includes(canonicalTitle) || aliases.some((alias) => title.includes(alias))) {
      return canonicalTitle;
    }
  }
  return null;
}

function calculateScore(content: any, titleVariants: string[]): number {
  let score = 0;
  const summary = content.summary || '';
  
  // 包含标题
  if (titleVariants.some((title) => summary.includes(title))) score += 18;
  
  // 包含关键信息
  if (summary.includes('简介')) score += 5;
  if (summary.includes('作者')) score += 3;
  if (summary.includes('主角')) score += 5;
  if (summary.includes('故事')) score += 3;
  
  // 中文字符数量
  const chineseChars = summary.match(/[\u4e00-\u9fa5]/g) || [];
  score += Math.min(chineseChars.length, 50);
  
  // 长度适中
  if (summary.length > 50 && summary.length < 1000) score += 10;
  
  return score;
}

function isVerifiedSourceUrl(url: string): boolean {
  return [
    "qidian.com",
    "zongheng.com",
    "17k.com",
    "guazixs.cn",
    "lrts.me",
    "baike.com",
    "fanqienovel.com",
  ].some((domain) => url.includes(domain));
}

function isUsableSourceExcerpt(excerpt: string, titleVariants: string[]): boolean {
  const text = excerpt || "";
  if (!titleVariants.some((title) => text.includes(title))) return false;
  if (/访问的页面|数据访问失败|404|页面不存在|请输入关键词|搜索结果/.test(text)) return false;
  return text.replace(/\s/g, "").length >= 80;
}

/**
 * 从HTML中提取内容
 */
function extractContent(html: string, titleVariants: string[]): any {
  // 简单的HTML解析，提取文本内容
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 提取关键信息
  const lines = textContent.split(/[。！？\n]/).filter(line => line.trim().length > 15);
  
  // 查找包含标题的行
  const relevantLines = lines.filter(line => 
    titleVariants.some((title) => line.includes(title)) || 
    line.includes('简介') || 
    line.includes('作者') ||
    line.includes('主角') ||
    line.includes('类型') ||
    line.includes('故事')
  );

  // 如果没有找到相关行，使用前几行
  const summaryLines = relevantLines.length > 0 ? relevantLines : lines.slice(0, 5);

  return {
    sourceTitle: summaryLines[0]?.slice(0, 80) || titleVariants[0],
    summary: summaryLines.slice(0, 8).join('。'),
    fullText: textContent.substring(0, 5000),
  };
}

/**
 * 生成详细的默认内容
 */
function generateDetailedContent(title: string): any {
  const genre = guessGenre(title);
  const protagonist = guessProtagonist(title);
  const antagonist = guessAntagonist(title);
  const setting = guessSetting(title);
  
  return {
    title,
    synopsis: generateSynopsis(title, genre, protagonist, setting),
    outline: generateOutline(title, genre, protagonist, antagonist, setting),
    characters: [protagonist, antagonist, "配角"],
    source: "ai_generated",
    rawContent: `《${title}》是一部${genre}类型的小说。`,
  };
}

/**
 * 生成简介
 */
function generateSynopsis(title: string, genre?: string, protagonist?: string, setting?: string): string {
  const g = genre || guessGenre(title);
  const p = protagonist || guessProtagonist(title);
  const s = setting || guessSetting(title);
  
  return `《${title}》是一部${g}类型的小说。故事发生在${s}，讲述了${p}从平凡到非凡的蜕变之路。在命运的安排下，${p}卷入了一场惊天阴谋，凭借过人的智慧和坚韧的意志，一步步揭开真相，最终成就了一段传奇。作品情节跌宕起伏，人物刻画深刻，是一部不可多得的佳作。`;
}

/**
 * 生成大纲
 */
function generateOutline(title: string, genre?: string, protagonist?: string, antagonist?: string, setting?: string): string {
  const g = genre || guessGenre(title);
  const p = protagonist || guessProtagonist(title);
  const a = antagonist || guessAntagonist(title);
  const s = setting || guessSetting(title);
  
  return `故事发生在${s}。

第一卷：起始
${p}原本过着平凡的生活，却因一次意外事件，被卷入了一场惊天阴谋。在危机时刻，${p}发现了自己隐藏的潜力，开始了逆袭之路。

第二卷：成长
${p}在成长过程中，结识了志同道合的伙伴，也遭遇了强大的敌人${a}。在一次次的挑战中，${p}不断提升实力，逐渐揭开了真相的一角。

第三卷：高潮
真相大白，原来一切的幕后黑手竟然是${a}。${p}与${a}展开了一场惊心动魄的对决，最终凭借智慧和勇气战胜了对手。

第四卷：结局
${p}成功化解了危机，守护了自己珍视的一切。故事以${p}站在巅峰，俯瞰众生的画面结束，留下了无限遐想。`;
}

/**
 * 生成人物
 */
function generateCharacters(title: string): string[] {
  const protagonist = guessProtagonist(title);
  const antagonist = guessAntagonist(title);
  return [protagonist, antagonist, "配角"];
}

/**
 * 猜测小说类型
 */
function guessGenre(title: string): string {
  const genreKeywords: Record<string, string[]> = {
    "仙侠": ["仙", "道", "修仙", "修真", "飞升", "剑"],
    "玄幻": ["玄", "幻", "魔", "神", "龙", "大陆"],
    "都市": ["都市", "城市", "总裁", "豪门", "逆袭"],
    "古言": ["古", "王", "帝", "妃", "后", "天下", "凤", "凰"],
    "悬疑": ["谜", "案", "探", "侦探", "迷"],
    "言情": ["爱", "情", "恋", "婚", "宠"],
    "历史": ["史", "朝", "国", "将"],
    "科幻": ["星", "际", "机", "甲"],
  };

  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    if (keywords.some(kw => title.includes(kw))) {
      return genre;
    }
  }
  return "玄幻";
}

/**
 * 猜测主角
 */
function guessProtagonist(title: string): string {
  if (title.includes("妃") || title.includes("后") || title.includes("凰") || title.includes("凤")) {
    return "女主";
  }
  if (title.includes("帝") || title.includes("王") || title.includes("尊") || title.includes("神")) {
    return "男主";
  }
  return "主角";
}

/**
 * 猜测反派
 */
function guessAntagonist(title: string): string {
  return "反派";
}

/**
 * 猜测背景设定
 */
function guessSetting(title: string): string {
  const genre = guessGenre(title);
  const settings: Record<string, string> = {
    "仙侠": "一个充满灵气的修仙世界",
    "玄幻": "一个广袤无垠的玄幻大陆",
    "都市": "现代都市的繁华与喧嚣",
    "古言": "一个架空的古代王朝",
    "悬疑": "一个充满谜团的现代都市",
    "言情": "一个浪漫的现代都市",
    "历史": "一个风云变幻的历史时代",
    "科幻": "一个科技高度发达的未来世界",
  };
  return settings[genre] || "一个神秘的世界";
}

export default router;
