/**
 * Canonical Chapter Import
 * 用户原文导入：识别完整章节 → 直接入库 → 反向提取资产 → 后处理
 */

import { prisma } from "../../db/prisma";

// 章节标题匹配正则（支持多种网文格式）
const CHAPTER_REGEX =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(第\s*[一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾佰仟\d零〇]+\s*章[^\n]*|Chapter\s+\d+[^\n]*|\d+[\.、]\s*[^\n]{2,40})/g;

/**
 * 强匹配章节标题（第X章、Chapter N）
 */
function isStrongChapterTitle(title: string): boolean {
  return /^第\s*[一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾佰仟\d零〇]+\s*章/.test(title) ||
    /^Chapter\s+\d+/i.test(title);
}

/**
 * 弱匹配标题（如"1、标题"）需要正文特征验证
 */
function looksLikeNovelContent(content: string): boolean {
  if (content.length < 800) return false;
  const novelSignals = /[“"「」]|他[说道喊叫]|她[说道喊叫]|我[说道喊叫]|走过来|看了看|笑了笑|沉默|房间|门口|夜色|街道|声音|心里|眼前/;
  return novelSignals.test(content);
}

interface CanonicalChapter {
  title: string;
  content: string;
  sortOrder: number;
}

/**
 * 从用户输入中检测并切分章节
 */
export function detectChapters(text: string): CanonicalChapter[] {
  if (!text || text.trim().length < 100) return [];

  const matches: { title: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  // 重置正则状态
  CHAPTER_REGEX.lastIndex = 0;
  while ((match = CHAPTER_REGEX.exec(text)) !== null) {
    matches.push({
      title: match[1].trim(),
      index: match.index,
    });
  }

  // 没有检测到章节标题 → 不做 fallback，避免将设定文档误判为小说正文
  if (matches.length === 0) {
    return [];
  }

  // 检测到章节标题，切分
  const chapters: CanonicalChapter[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const rawContent = text.slice(start, end).trim();

    // 去掉标题行，保留正文
    const titleEnd = rawContent.indexOf("\n");
    const content = titleEnd > 0 ? rawContent.slice(titleEnd).trim() : rawContent;

    // 数字标题（如"1、标题"）需要二次验证，避免误伤编号列表
    if (!isStrongChapterTitle(matches[i].title)) {
      if (!looksLikeNovelContent(content)) continue;
    }

    if (content.length >= 100) {
      chapters.push({
        title: matches[i].title,
        content,
        sortOrder: chapters.length + 1,
      });
    }
  }

  return chapters;
}

/**
 * 计算内容 hash（简单 hash，用于去重校验）
 */
function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 计算中文字数
 */
function countChineseWords(text: string): number {
  return text.replace(/[^一-鿿]/g, "").length;
}

/**
 * 将用户原文章节导入为 canonical chapters
 */
export async function importCanonicalChapters(
  novelId: string,
  chapters: CanonicalChapter[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const ch of chapters) {
    const existing = await prisma.chapter.findUnique({
      where: { novelId_order: { novelId, order: ch.sortOrder } },
    });

    // 已有 canonical 章节，跳过
    if (existing?.isCanonical || existing?.sourceType === "user_original") {
      skipped++;
      continue;
    }

    const contentHash = computeHash(ch.content);
    const wordCount = countChineseWords(ch.content);

    if (existing) {
      // 更新已有章节
      await prisma.chapter.update({
        where: { id: existing.id },
        data: {
          title: ch.title,
          content: ch.content,
          wordCount,
          status: "completed",
          sourceType: "user_original",
          isCanonical: true,
          canRewrite: false,
          originalContent: ch.content,
          sourceHash: contentHash,
        },
      });
    } else {
      // 创建新章节
      await prisma.chapter.create({
        data: {
          novelId,
          order: ch.sortOrder,
          title: ch.title,
          content: ch.content,
          wordCount,
          status: "completed",
          source: "user_input",
          sourceType: "user_original",
          isCanonical: true,
          canRewrite: false,
          originalContent: ch.content,
          sourceHash: contentHash,
        },
      });
    }
    imported++;
  }

  return { imported, skipped };
}

/**
 * 对 canonical chapters 执行后处理
 * 确保第4章能正确承接前三章
 */
export async function runPostProcessingForCanonical(
  novelId: string,
  chapters: CanonicalChapter[]
): Promise<void> {
  for (const ch of chapters) {
    // 生成章节概要
    const summary = ch.content.slice(0, 200) + (ch.content.length > 200 ? "..." : "");

    await prisma.chapterSummary.upsert({
      where: { novelId_chapterOrder: { novelId, chapterOrder: ch.sortOrder } },
      create: {
        novelId,
        chapterOrder: ch.sortOrder,
        title: ch.title,
        summary,
        keyEvents: "[]",
        endingState: ch.content.slice(-300),
      },
      update: {
        title: ch.title,
        summary,
        endingState: ch.content.slice(-300),
      },
    });
  }

  // 更新 StoryState 到最后一章的状态
  const lastChapter = chapters[chapters.length - 1];
  if (lastChapter) {
    const existingState = await prisma.storyState.findFirst({
      where: { novelId },
    });

    const stateData = {
      currentPhase: "canonical_imported",
      protagonistStatus: "用户原文导入完成",
      currentEmotion: "待续写",
      currentChapter: lastChapter.sortOrder,
    };

    if (existingState) {
      await prisma.storyState.update({
        where: { id: existingState.id },
        data: stateData,
      });
    } else {
      await prisma.storyState.create({
        data: { novelId, ...stateData },
      });
    }
  }
}

/**
 * 完整的 canonical import 流程
 */
export async function executeCanonicalImport(
  novelId: string,
  rawText: string
): Promise<{ chapters: CanonicalChapter[]; imported: number; skipped: number }> {
  const chapters = detectChapters(rawText);

  if (chapters.length === 0) {
    return { chapters: [], imported: 0, skipped: 0 };
  }

  const { imported, skipped } = await importCanonicalChapters(novelId, chapters);

  // 对导入的章节执行后处理（已存在的也要确保 summary/state 存在）
  if (imported > 0 || skipped > 0) {
    await runPostProcessingForCanonical(novelId, chapters);
  }

  return { chapters, imported, skipped };
}
