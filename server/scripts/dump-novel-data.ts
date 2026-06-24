import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { ContextAssembler } from "../src/services/pipeline/contextAssembler";

const serverRoot = path.resolve(__dirname, "..");
const adapter = new PrismaBetterSqlite3({
  url: `file:${path.resolve(serverRoot, "dev.db")}`,
});
const prisma = new PrismaClient({ adapter });

const NOVEL_ID = "cmqrsxft20000civr3kzk83ny";

async function main() {
  // 1. Novel
  const novel = await prisma.novel.findUnique({ where: { id: NOVEL_ID } });
  console.log("=".repeat(80));
  console.log("【1. novel.outline — 小说大纲】");
  console.log("=".repeat(80));
  console.log(`标题: ${novel?.title}`);
  console.log(`类型: ${novel?.genre}`);
  console.log(`简介: ${novel?.description}`);
  console.log(`核心卖点: ${novel?.sellingPoints}`);
  console.log(`总目标字数: ${novel?.targetWordCount}`);
  console.log(`outline 字段:\n${novel?.outline}`);
  console.log(`readerExpectations:\n${novel?.readerExpectations}`);
  console.log();

  // 2. Worldview
  const wv = await prisma.worldview.findFirst({ where: { novelId: NOVEL_ID } });
  console.log("=".repeat(80));
  console.log("【2. worldview — 世界观】");
  console.log("=".repeat(80));
  console.log(`名称: ${wv?.name}`);
  console.log(`概述: ${wv?.summary}`);
  console.log(`规则: ${wv?.rules}`);
  console.log(`力量体系: ${wv?.powerSystem}`);
  console.log(`地理: ${wv?.geography}`);
  console.log(`历史: ${wv?.history}`);
  console.log(`文化: ${wv?.culture}`);
  console.log();

  // 3. Characters
  const chars = await prisma.character.findMany({ where: { novelId: NOVEL_ID }, orderBy: { createdAt: "asc" } });
  console.log("=".repeat(80));
  console.log("【3. characters — 角色卡】");
  console.log("=".repeat(80));
  for (const c of chars) {
    console.log(`\n--- ${c.name}（${c.role}）---`);
    console.log(`  身份: ${c.identity}`);
    console.log(`  动机: ${c.motivation}`);
    console.log(`  性格: ${c.personality}`);
    console.log(`  说话风格: ${c.speechStyle}`);
    console.log(`  人物弧: ${c.arcSummary}`);
    console.log(`  外貌: ${c.appearance}`);
    console.log(`  背景: ${c.background}`);
  }
  console.log();

  // 4. StyleProfile
  const style = await prisma.styleProfile.findFirst({ where: { novelId: NOVEL_ID } });
  console.log("=".repeat(80));
  console.log("【4. styleProfile / styleDna — 风格配置】");
  console.log("=".repeat(80));
  console.log(`名称: ${style?.name}`);
  console.log(`描述: ${style?.description}`);
  console.log(`tone: ${style?.tone}`);
  console.log(`pacing: ${style?.pacing}`);
  console.log(`vocabulary: ${style?.vocabulary}`);
  console.log(`sentencePatterns: ${style?.sentencePatterns}`);
  console.log(`dialogueStyle: ${style?.dialogueStyle}`);
  console.log(`narrativeVoice: ${style?.narrativeVoice}`);
  console.log(`forbiddenPatterns: ${style?.forbiddenPatterns}`);
  console.log(`requiredPatterns: ${style?.requiredPatterns}`);
  console.log(`\nstyleDna:\n${style?.styleDna}`);
  console.log();

  // 5. Volumes
  const vols = await prisma.volume.findMany({ where: { novelId: NOVEL_ID }, orderBy: { sortOrder: "asc" } });
  console.log("=".repeat(80));
  console.log("【5. volumeOutline — 卷纲】");
  console.log("=".repeat(80));
  for (const v of vols) {
    console.log(`\n第${v.sortOrder}卷: ${v.title}`);
    console.log(`  章节范围: ${v.chapterStart}-${v.chapterEnd}`);
    console.log(`  目标字数: ${v.targetWordCount}`);
    console.log(`  概述: ${v.summary}`);
    console.log(`  核心冲突: ${v.coreConflict}`);
    console.log(`  关键转折: ${v.keyTurningPoints}`);
  }
  console.log();

  // 6. ChapterOutlines (前3章)
  const outlines = await prisma.chapterOutline.findMany({
    where: { novelId: NOVEL_ID, sortOrder: { in: [1, 2, 3] } },
    orderBy: { sortOrder: "asc" },
  });
  console.log("=".repeat(80));
  console.log("【6. chapterOutline — 前三章章纲】");
  console.log("=".repeat(80));
  for (const o of outlines) {
    console.log(`\n--- 第${o.sortOrder}章: ${o.title} (${o.chapterType}) ---`);
    console.log(`  目标: ${o.goal}`);
    console.log(`  冲突: ${o.conflict}`);
    console.log(`  情绪弧: ${o.emotion}`);
    console.log(`  章末钩子: ${o.hook}`);
    console.log(`  爽点: ${o.pleasurePoint}`);
    console.log(`  场景: ${o.scene}`);
    console.log(`  视角: ${o.pov}`);
    console.log(`  目标字数: ${o.targetWordCount}`);
    console.log(`  必须完成: ${o.mustDo}`);
    console.log(`  禁止完成: ${o.mustNotDo}`);
    console.log(`  读者承诺: ${o.readerPromise}`);
    console.log(`  章节功能: ${o.chapterFunction}`);
  }
  console.log();

  // 7. P0-P3 Prompt
  console.log("=".repeat(80));
  console.log("【7. 前三章 P0-P3 Prompt】");
  console.log("=".repeat(80));
  const assembler = new ContextAssembler(NOVEL_ID);
  for (const o of outlines) {
    console.log(`\n${"#".repeat(80)}`);
    console.log(`第${o.sortOrder}章: ${o.title}`);
    console.log("#".repeat(80));
    const prompt = await assembler.assembleForChapter(o.sortOrder, {
      title: o.title,
      goal: o.goal,
      conflict: o.conflict,
      emotion: o.emotion,
      hook: o.hook,
      mustDo: o.mustDo,
      mustNotDo: o.mustNotDo,
      chapterType: o.chapterType,
      targetWordCount: o.targetWordCount,
      characters: chars.filter(c => {
        const names = ["林凡", "林富贵", "王德发"];
        return names.includes(c.name);
      }).map(c => ({ name: c.name, role: c.role })),
    });
    console.log(prompt);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
