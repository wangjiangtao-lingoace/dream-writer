/**
 * ContentExtractionService - 内容提取服务
 *
 * 使用可读性启发式算法提取网页主要内容，
 * 移除样板内容（页头、页脚、导航、广告），
 * 返回结构化的小说相关信息。
 */

// ============================================================
// 类型定义
// ============================================================

export interface ExtractedContent {
  title: string;
  author: string;
  synopsis: string;
  bodyText: string;
  confidence: number;
}

// ============================================================
// 常量定义
// ============================================================

// 小说相关关键词（用于评分）
const NOVEL_KEYWORDS = [
  "小说", "作者", "简介", "主角", "故事", "穿越", "重生", "都市",
  "玄幻", "仙侠", "言情", "悬疑", "科幻", "历史", "军事",
  "类型", "标签", "连载", "完结", "章节", "更新", "阅读",
  "特工", "废物", "修炼", "一朝", "被骂", "大陆", "帝国",
];

// 样板内容关键词（用于过滤）
const BOILERPLATE_KEYWORDS = [
  "首页", "登录", "注册", "搜索", "导航", "菜单", "footer",
  "header", "sidebar", "广告", "推荐", "热门", "排行",
  "下载APP", "关注我们", "版权所有", "备案号", "ICP",
  "用户协议", "隐私政策", "帮助中心", "意见反馈",
  "返回顶部", "分享到", "收藏", "点赞", "评论区",
  "猜你喜欢", "相关推荐", "热门推荐", "最新章节",
  "免费阅读", "在线阅读", "全文阅读", "笔趣阁",
];

// ============================================================
// ContentExtractionService 类
// ============================================================

export class ContentExtractionService {
  /**
   * 从URL提取内容
   */
  async extract(url: string, titleVariants?: string[]): Promise<ExtractedContent | null> {
    try {
      const html = await this.fetchHtml(url);
      if (!html) return null;

      return this.extractFromHtml(html, url, titleVariants);
    } catch (error: any) {
      console.warn(`[ContentExtraction] 提取失败 ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * 从HTML字符串提取内容
   */
  extractFromHtml(html: string, url?: string, titleVariants?: string[]): ExtractedContent {
    // 第一步：清理HTML
    const cleaned = this.cleanHtml(html);

    // 第二步：提取文本块
    const blocks = this.extractTextBlocks(cleaned);

    // 第三步：评分每个文本块
    const scoredBlocks = blocks.map((block) => ({
      ...block,
      score: this.scoreBlock(block, titleVariants),
    }));

    // 第四步：按分数排序
    scoredBlocks.sort((a, b) => b.score - a.score);

    // 第五步：提取结构化信息
    const title = this.extractTitle(html, titleVariants);
    const author = this.extractAuthor(cleaned);
    const synopsis = this.extractSynopsis(scoredBlocks, titleVariants);
    const bodyText = this.extractBodyText(scoredBlocks);

    // 第六步：计算置信度
    const confidence = this.calculateConfidence(title, author, synopsis, bodyText, titleVariants);

    return {
      title,
      author,
      synopsis,
      bodyText: bodyText.slice(0, 5000),
      confidence,
    };
  }

  /**
   * 获取HTML内容
   */
  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  /**
   * 清理HTML：移除脚本、样式、注释等
   */
  private cleanHtml(html: string): string {
    return html
      // 移除注释
      .replace(/<!--[\s\S]*?-->/g, "")
      // 移除脚本
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      // 移除样式
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // 移除noscript
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      // 移除SVG
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      // 移除表单元素
      .replace(/<form[\s\S]*?<\/form>/gi, "")
      // 移除导航元素
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      // 移除页头
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      // 移除页脚
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      // 移除aside（侧边栏）
      .replace(/<aside[\s\S]*?<\/aside>/gi, "");
  }

  /**
   * 提取文本块
   */
  private extractTextBlocks(html: string): Array<{ text: string; tag: string }> {
    const blocks: Array<{ text: string; tag: string }> = [];

    // 按常见块级标签分割
    const blockRegex = /<(p|div|article|section|main|li|h[1-6]|td|th|dd|dt|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;

    while ((match = blockRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const innerHtml = match[2];

      // 移除内部标签，保留文本
      const text = innerHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      if (text.length > 10) {
        blocks.push({ text, tag });
      }
    }

    // 如果没有匹配到块级标签，尝试按行分割
    if (blocks.length === 0) {
      const plainText = html
        .replace(/<[^>]+>/g, " ")
        .replace(/&[^;]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const lines = plainText.split(/[。！？\n]/).filter((line) => line.trim().length > 15);
      for (const line of lines) {
        blocks.push({ text: line.trim(), tag: "p" });
      }
    }

    return blocks;
  }

  /**
   * 评分文本块
   */
  private scoreBlock(
    block: { text: string; tag: string },
    titleVariants?: string[],
  ): number {
    let score = 0;
    const text = block.text;

    // 1. 长度评分（适中长度得分最高）
    const length = text.length;
    if (length > 50 && length < 500) {
      score += 15;
    } else if (length >= 500 && length < 1000) {
      score += 10;
    } else if (length >= 1000) {
      score += 5;
    }

    // 2. 中文字符密度
    const chineseChars = text.match(/[一-鿿]/g) || [];
    const chineseDensity = chineseChars.length / Math.max(text.length, 1);
    score += Math.round(chineseDensity * 30);

    // 3. 包含小说相关关键词
    const matchedKeywords = NOVEL_KEYWORDS.filter((kw) => text.includes(kw));
    score += matchedKeywords.length * 3;

    // 4. 包含标题变体
    if (titleVariants) {
      const hasTitle = titleVariants.some((t) => text.includes(t));
      if (hasTitle) score += 20;
    }

    // 5. 标签权重
    if (block.tag === "article" || block.tag === "main") {
      score += 10;
    } else if (block.tag === "p") {
      score += 5;
    }

    // 6. 样板内容扣分
    const matchedBoilerplate = BOILERPLATE_KEYWORDS.filter((kw) => text.includes(kw));
    score -= matchedBoilerplate.length * 5;

    // 7. URL密度扣分
    const urlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
    score -= urlMatches.length * 8;

    // 8. 数字密度扣分（纯数字内容通常是噪音）
    const digitMatches = text.match(/\d/g) || [];
    const digitDensity = digitMatches.length / Math.max(text.length, 1);
    if (digitDensity > 0.3) score -= 10;

    return Math.max(0, score);
  }

  /**
   * 提取标题
   */
  private extractTitle(html: string, titleVariants?: string[]): string {
    // 尝试从<title>标签提取
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      // 清理常见后缀
      const cleaned = title
        .replace(/[-_|—].*?(小说|阅读|在线|最新章节|全文).*$/i, "")
        .replace(/_.*$/i, "")
        .trim();
      if (cleaned.length > 1 && cleaned.length < 50) {
        return cleaned;
      }
    }

    // 尝试从h1标签提取
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const h1 = h1Match[1].replace(/<[^>]+>/g, "").trim();
      if (h1.length > 1 && h1.length < 50) {
        return h1;
      }
    }

    // 使用第一个标题变体
    if (titleVariants && titleVariants.length > 0) {
      return titleVariants[0];
    }

    return "";
  }

  /**
   * 提取作者
   */
  private extractAuthor(text: string): string {
    // 常见作者提取模式
    const patterns = [
      /作者[：:]\s*([^\s,，。！？]{2,10})/,
      /作者名[：:]\s*([^\s,，。！？]{2,10})/,
      /著[：:]\s*([^\s,，。！？]{2,10})/,
      /by\s+([^\s,，。！？]{2,20})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return "";
  }

  /**
   * 提取简介
   */
  private extractSynopsis(
    scoredBlocks: Array<{ text: string; tag: string; score: number }>,
    titleVariants?: string[],
  ): string {
    // 优先选择包含"简介"关键词的块
    const synopsisBlock = scoredBlocks.find((block) =>
      block.text.includes("简介") || block.text.includes("内容介绍") || block.text.includes("作品简介"),
    );

    if (synopsisBlock) {
      return this.cleanSynopsis(synopsisBlock.text, titleVariants);
    }

    // 其次选择分数最高且包含标题的块
    if (titleVariants) {
      const titleBlock = scoredBlocks.find((block) =>
        titleVariants.some((t) => block.text.includes(t)) && block.text.length > 50,
      );

      if (titleBlock) {
        return this.cleanSynopsis(titleBlock.text, titleVariants);
      }
    }

    // 最后选择分数最高的块
    if (scoredBlocks.length > 0) {
      return this.cleanSynopsis(scoredBlocks[0].text, titleVariants);
    }

    return "";
  }

  /**
   * 清理简介文本
   */
  private cleanSynopsis(text: string, titleVariants?: string[]): string {
    let cleaned = text;

    // 移除样板内容
    for (const keyword of BOILERPLATE_KEYWORDS) {
      cleaned = cleaned.replace(new RegExp(keyword, "g"), "");
    }

    // 移除多余空白
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // 截断到合理长度
    if (cleaned.length > 300) {
      // 在句号处截断
      const lastPeriod = cleaned.lastIndexOf("。", 280);
      if (lastPeriod > 100) {
        cleaned = cleaned.slice(0, lastPeriod + 1);
      } else {
        cleaned = cleaned.slice(0, 300) + "...";
      }
    }

    return cleaned;
  }

  /**
   * 提取正文
   */
  private extractBodyText(
    scoredBlocks: Array<{ text: string; tag: string; score: number }>,
  ): string {
    // 选择分数较高的块组合成正文
    const goodBlocks = scoredBlocks
      .filter((block) => block.score > 10 && block.text.length > 30)
      .slice(0, 10);

    if (goodBlocks.length === 0) {
      // 如果没有高分块，使用所有块
      return scoredBlocks
        .slice(0, 5)
        .map((block) => block.text)
        .join("\n\n");
    }

    return goodBlocks
      .map((block) => block.text)
      .join("\n\n");
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    title: string,
    author: string,
    synopsis: string,
    bodyText: string,
    titleVariants?: string[],
  ): number {
    let confidence = 0.1;

    // 标题匹配
    if (title && titleVariants?.some((t) => title.includes(t))) {
      confidence += 0.25;
    } else if (title) {
      confidence += 0.1;
    }

    // 作者信息
    if (author) {
      confidence += 0.15;
    }

    // 简介质量
    if (synopsis.length > 50) {
      confidence += 0.2;
    } else if (synopsis.length > 20) {
      confidence += 0.1;
    }

    // 正文长度
    if (bodyText.length > 500) {
      confidence += 0.2;
    } else if (bodyText.length > 200) {
      confidence += 0.1;
    }

    // 中文字符比例
    const allText = title + synopsis + bodyText;
    const chineseChars = allText.match(/[一-鿿]/g) || [];
    const chineseDensity = chineseChars.length / Math.max(allText.length, 1);
    if (chineseDensity > 0.5) {
      confidence += 0.1;
    }

    return Math.min(0.95, Math.max(0.1, confidence));
  }
}
