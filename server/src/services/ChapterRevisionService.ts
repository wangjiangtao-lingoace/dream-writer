import { prisma } from "../db/prisma";

export class ChapterRevisionService {
  async createRevision(chapterId: string, content: string, title: string) {
    const lastRevision = await prisma.chapterRevision.findFirst({
      where: { chapterId },
      orderBy: { revision: "desc" },
    });
    const newRevision = (lastRevision?.revision || 0) + 1;

    return await prisma.chapterRevision.create({
      data: {
        chapterId,
        content,
        title,
        wordCount: content.replace(/\s/g, "").length,
        revision: newRevision,
      },
    });
  }

  async getRevisions(chapterId: string) {
    return await prisma.chapterRevision.findMany({
      where: { chapterId },
      orderBy: { revision: "desc" },
    });
  }

  async getRevision(chapterId: string, revision: number) {
    return await prisma.chapterRevision.findUnique({
      where: { chapterId_revision: { chapterId, revision } },
    });
  }

  async rollbackToRevision(chapterId: string, revision: number) {
    const revisionData = await this.getRevision(chapterId, revision);
    if (!revisionData) {
      throw new Error("版本不存在");
    }

    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        content: revisionData.content,
        title: revisionData.title,
        wordCount: revisionData.wordCount,
      },
    });

    await this.createRevision(chapterId, revisionData.content, revisionData.title);

    return chapter;
  }
}

export const chapterRevisionService = new ChapterRevisionService();
