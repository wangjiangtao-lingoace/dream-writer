import { prisma } from "../db/prisma";

export interface CreateNovelInput {
  title: string;
  inspiration?: string;
  outline?: string;
  genre?: string;
  synopsis?: string;
  targetWordCount?: number;
  chapterWordMin?: number;
  chapterWordMax?: number;
  volumeCount?: number;
  chaptersPerVol?: number;
}

export interface UpdateNovelInput {
  title?: string;
  inspiration?: string | null;
  outline?: string | null;
  genre?: string | null;
  synopsis?: string | null;
  targetWordCount?: number;
  chapterWordMin?: number;
  chapterWordMax?: number;
  volumeCount?: number;
  chaptersPerVol?: number;
  status?: string;
  // 7 层 Prompt 架构新增字段
  coreSellingPoint?: string | null;
  corePayoffs?: string | null;
  coreConflict?: string | null;
  readerExpectations?: string | null;
}

function countWords(content: string): number {
  const compact = content.replace(/\s/g, "");
  return compact.length;
}

export class NovelService {
  listNovels() {
    return prisma.novel.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { chapters: true, characters: true, assets: true } },
        chapters: {
          orderBy: { order: "asc" },
          take: 1,
          select: { id: true, title: true, order: true, status: true, updatedAt: true },
        },
      },
    });
  }

  getNovel(id: string) {
    return prisma.novel.findUnique({
      where: { id },
      include: {
        chapters: { orderBy: { order: "asc" } },
        characters: { orderBy: { updatedAt: "desc" } },
        assets: { orderBy: { updatedAt: "desc" } },
      },
    });
  }

  async createNovel(input: CreateNovelInput) {
    // 不自动创建章节，让用户手动创建或通过 AI 生成
    return prisma.novel.create({
      data: {
        title: input.title,
        inspiration: input.inspiration || null,
        outline: input.outline || null,
        genre: input.genre || null,
        synopsis: input.synopsis || null,
        targetWordCount: input.targetWordCount || 300000,
        chapterWordMin: input.chapterWordMin || 2000,
        chapterWordMax: input.chapterWordMax || 4000,
        volumeCount: input.volumeCount || 1,
        chaptersPerVol: input.chaptersPerVol || 20,
      },
      include: { chapters: { orderBy: { order: "asc" } } },
    });
  }

  updateNovel(id: string, input: UpdateNovelInput) {
    return prisma.novel.update({
      where: { id },
      data: input,
      include: { chapters: { orderBy: { order: "asc" } } },
    });
  }

  deleteNovel(id: string) {
    return prisma.novel.delete({ where: { id } });
  }

  async createChapter(novelId: string, input: { title: string; summary?: string; order?: number }) {
    // 自动计算下一个序号（确保顺序递增）
    const last = await prisma.chapter.findFirst({
      where: { novelId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    
    const nextOrder = (last?.order ?? 0) + 1;
    
    // 如果指定了序号，检查是否有效
    if (input.order !== undefined) {
      // 指定的序号必须大于当前最大序号
      if (input.order <= (last?.order ?? 0)) {
        throw new Error(`章节序号必须大于当前最大序号 ${last?.order ?? 0}`);
      }
    }
    
    return prisma.chapter.create({
      data: {
        novelId,
        order: input.order ?? nextOrder,
        title: input.title,
        summary: input.summary || null,
        status: "planned",
      },
    });
  }

  updateChapter(
    novelId: string,
    chapterId: string,
    input: { title?: string; summary?: string | null; content?: string; status?: string; source?: string },
  ) {
    return prisma.chapter.update({
      where: { id: chapterId, novelId },
      data: {
        ...input,
        wordCount: typeof input.content === "string" ? countWords(input.content) : undefined,
      },
    });
  }

  async deleteChapter(novelId: string, chapterId: string) {
    // 先获取要删除的章节
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId, novelId },
    });

    if (!chapter) {
      throw new Error("章节不存在。");
    }

    // 将删除章节 + 重排序号的所有 DB 操作放入事务，保证原子性
    await prisma.$transaction(async (tx) => {
      // 删除章节及其关联的 ChapterSummary
      await tx.chapter.delete({ where: { id: chapterId } });
      await tx.chapterSummary.deleteMany({ where: { novelId, chapterOrder: chapter.order } });

      // 重新排列后续章节的序号
      const subsequentChapters = await tx.chapter.findMany({
        where: {
          novelId,
          order: { gt: chapter.order },
        },
        orderBy: { order: "asc" },
      });

      // 更新后续章节的序号
      for (const ch of subsequentChapters) {
        await tx.chapter.update({
          where: { id: ch.id },
          data: { order: ch.order - 1 },
        });
      }

      // 同步调整后续 ChapterSummary 的 chapterOrder
      await tx.chapterSummary.updateMany({
        where: {
          novelId,
          chapterOrder: { gt: chapter.order },
        },
        data: { chapterOrder: { decrement: 1 } },
      });
    });

    return { success: true };
  }
}
