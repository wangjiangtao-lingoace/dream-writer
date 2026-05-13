import { prisma } from "../db/prisma";

export class KnowledgeSearchService {
  // 关键词匹配检索通用知识库
  async searchGeneralKnowledge(keywords: string[], limit = 10) {
    if (!keywords.length) return [];
    
    const conditions = keywords.map(kw => ({
      OR: [
        { title: { contains: kw } },
        { content: { contains: kw } },
        { tags: { contains: kw } },
      ],
    }));

    return prisma.generalKnowledge.findMany({
      where: { AND: conditions },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
  }

  // 关键词匹配检索作品知识库
  async searchNovelKnowledge(novelId: string, keywords: string[], limit = 10) {
    if (!keywords.length) return [];
    
    const conditions = keywords.map(kw => ({
      OR: [
        { title: { contains: kw } },
        { content: { contains: kw } },
        { tags: { contains: kw } },
      ],
    }));

    return prisma.knowledgeAsset.findMany({
      where: {
        OR: [{ novelId }, { novelId: null }],
        AND: conditions,
      },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
  }

  // 构建知识上下文
  async buildContext(novelId: string, keywords: string[]): Promise<string> {
    const [general, novel] = await Promise.all([
      this.searchGeneralKnowledge(keywords, 5),
      this.searchNovelKnowledge(novelId, keywords, 5),
    ]);

    const parts: string[] = [];
    
    if (general.length) {
      parts.push("【通用知识】");
      general.forEach(k => {
        parts.push(`- ${k.title}: ${k.content.substring(0, 200)}`);
      });
    }
    
    if (novel.length) {
      parts.push("【作品知识】");
      novel.forEach(k => {
        parts.push(`- ${k.title}: ${k.content.substring(0, 200)}`);
      });
    }

    return parts.join("\n");
  }

  // 从文本提取关键词
  extractKeywords(text: string): string[] {
    // 简单的关键词提取：去除停用词，取高频词
    const stopWords = new Set(["的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这"]);
    
    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.has(w));
    
    // 词频统计
    const freq: Record<string, number> = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    
    // 按频率排序取前10个
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}

export const knowledgeSearchService = new KnowledgeSearchService();
