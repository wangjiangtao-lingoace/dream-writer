/**
 * 修复章节人称：将第一人称（我）转换为第三人称（他/她/角色名）
 * 使用 LLM 智能转换，保持上下文一致性
 *
 * 用法: cd server && npx tsx ../scripts/fix-person-perspective.ts [novelId]
 */

// 手动加载 .env（不依赖 dotenv）
import * as fs from "fs";
import * as path from "path";
const envPath = path.resolve(__dirname, "../server/.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

import { prisma } from "../server/src/db/prisma";
import { LlmInvokeService } from "../server/src/services/llm/LlmInvokeService";

const llmService = new LlmInvokeService();

const NOVEL_ID = process.argv[2] || "cmpttztnv0000ldvr64dbvci3";
const BATCH_SIZE = 5; // 每批处理章节数
const DELAY_MS = 2000; // 批次间延迟

async function getNovelInfo(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { id: true, title: true, genre: true },
  });
  if (!novel) throw new Error(`作品不存在: ${novelId}`);
  return novel;
}

async function getCharacters(novelId: string) {
  const characters = await prisma.character.findMany({
    where: { novelId },
    select: { name: true, role: true, identity: true },
    take: 20,
  });
  return characters;
}

async function getChapterContext(novelId: string, currentOrder: number) {
  // 获取前3章和后1章的概要，保持上下文连贯
  const [prevChapters, nextChapter] = await Promise.all([
    prisma.chapter.findMany({
      where: {
        novelId,
        order: { lt: currentOrder, gte: currentOrder - 3 },
      },
      orderBy: { order: "desc" },
      select: { order: true, title: true, summary: true },
    }),
    prisma.chapter.findFirst({
      where: { novelId, order: currentOrder + 1 },
      select: { order: true, title: true, summary: true },
    }),
  ]);

  let context = "【前文概要】\n";
  for (const ch of prevChapters.reverse()) {
    context += `第${ch.order}章 ${ch.title}：${ch.summary || "无概要"}\n`;
  }
  if (nextChapter) {
    context += `\n【后文概要】\n第${nextChapter.order}章 ${nextChapter.title}：${nextChapter.summary || "无概要"}\n`;
  }
  return context;
}

async function convertToThirdPerson(
  content: string,
  novelTitle: string,
  chapterOrder: number,
  chapterTitle: string,
  characters: Array<{ name: string; role: string | null; identity: string | null }>,
  context: string,
): Promise<string> {
  const charList = characters
    .slice(0, 8)
    .map((c) => `${c.name}（${c.role || "角色"}：${c.identity || ""}）`)
    .join("、");

  const prompt = `请将以下小说章节从第一人称视角转换为第三人称视角。

【作品信息】
作品名：${novelTitle}
章节：第${chapterOrder}章 ${chapterTitle}

【主要人物】
${charList || "暂无人物"}

${context}

【转换规则】
1. 将「我」「我们」转换为主角名「林默」或「他」
2. 将「我的」转换为「他的」或「林默的」
3. 内心独白从「我想」改为「他想」「林默心想」或用动作/表情展现
4. 对话中的「我」保持不变（角色自称）
5. 保持原文的语气、节奏和情感
6. 不要改变情节、人物关系或事件
7. 不要添加原文没有的内容
8. 输出纯正文，不要 Markdown 标记

【原文】
${content}

【转换后】`;

  const result = await llmService.completeText({
    prompt,
    temperature: 0.3,
    maxTokens: Math.max(3000, Math.min(6000, Math.round(content.length * 1.2))),
  });

  return result?.trim() || content;
}

async function main() {
  console.log(`开始修复作品 ${NOVEL_ID} 的人称问题...`);

  const novel = await getNovelInfo(NOVEL_ID);
  const characters = await getCharacters(NOVEL_ID);

  const chapters = await prisma.chapter.findMany({
    where: { novelId: NOVEL_ID },
    orderBy: { order: "asc" },
    select: { id: true, order: true, title: true, content: true, wordCount: true },
  });

  console.log(`共 ${chapters.length} 章需要处理`);

  // 检查哪些章节需要修复（包含第一人称）
  const chaptersToFix = chapters.filter((ch) => {
    const content = ch.content || "";
    // 计算第一人称出现次数（排除对话中的"我"）
    const lines = content.split("\n");
    let firstPersonCount = 0;
    for (const line of lines) {
      // 跳过对话行（以「」开头的）
      if (line.trim().startsWith("「") || line.trim().startsWith('"')) continue;
      firstPersonCount += (line.match(/(?<!["「])我(?!["」])/g) || []).length;
    }
    return firstPersonCount > 5; // 超过5处第一人称才修复
  });

  console.log(`需要修复的章节: ${chaptersToFix.length} 章`);

  // 分批处理
  for (let i = 0; i < chaptersToFix.length; i += BATCH_SIZE) {
    const batch = chaptersToFix.slice(i, i + BATCH_SIZE);
    console.log(`\n处理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chaptersToFix.length / BATCH_SIZE)}`);

    for (const chapter of batch) {
      console.log(`  处理第${chapter.order}章: ${chapter.title}`);

      try {
        // 获取上下文
        const context = await getChapterContext(NOVEL_ID, chapter.order);

        // 转换人称
        const newContent = await convertToThirdPerson(
          chapter.content,
          novel.title,
          chapter.order,
          chapter.title,
          characters,
          context,
        );

        // 验证转换结果
        if (newContent.length < chapter.content.length * 0.5) {
          console.warn(`    ⚠️ 转换后内容过短，跳过`);
          continue;
        }

        // 更新数据库
        try {
          const updateResult = await prisma.chapter.update({
            where: { id: chapter.id },
            data: {
              content: newContent,
              wordCount: newContent.length,
            },
          });
          console.log(`    ✅ 完成 (${chapter.wordCount} -> ${newContent.length} 字), ID: ${updateResult.id}`);
        } catch (dbError) {
          console.error(`    ❌ 数据库更新失败:`, dbError);
        }
      } catch (error) {
        console.error(`    ❌ 失败:`, error);
      }
    }

    // 批次间延迟
    if (i + BATCH_SIZE < chaptersToFix.length) {
      console.log(`等待 ${DELAY_MS / 1000} 秒...`);
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log("\n修复完成！");
  process.exit(0);
}

main().catch((error) => {
  console.error("脚本执行失败:", error);
  process.exit(1);
});
