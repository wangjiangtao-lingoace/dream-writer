import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { ContextAssembler } from "../src/services/pipeline/contextAssembler";
import { buildFullSystemPrompt } from "../src/services/pipeline/prompts";

const serverRoot = path.resolve(__dirname, "..");
const adapter = new PrismaBetterSqlite3({
  url: `file:${path.resolve(serverRoot, "dev.db")}`,
});
const prisma = new PrismaClient({ adapter });

const NOVEL_ID = "cmqrsxft20000civr3kzk83ny";
const VOLUME1_ID = "cmqrt7gq60000fuvr9mi945jk";

// 模拟章纲数据（基于设定文档，字段名对齐 schema）
const chapterOutlines = [
  {
    sortOrder: 1,
    title: "他们当时的嘲笑声好大呀",
    chapterType: "payoff",
    goal: "倒叙高光，展示老祖从九品到三品的逆袭，同时引出林凡和老祖的关系",
    conflict: "阴间鬼差们的不服与忌惮",
    emotion: "压抑→释放→小人得志→期待",
    hook: "事情还要从之前的那个清明说起",
    pleasurePoint: "老祖授印大典，全场鬼差震惊",
    scene: "阴间授印大典广场 + 阳间林凡出租屋",
    pov: "林富贵（主）+ 林凡（副）",
    targetWordCount: 3000,
    mustDo: JSON.stringify(["老祖的表情变化", "鬼差们的反应", "林凡的吐槽", "阴阳两线交叉叙事"]),
    mustNotDo: JSON.stringify(["不能解释太多背景", "不能跳到第二章", "不能让老祖显得太完美"]),
    readerPromise: "看到老祖的逆袭高光，同时好奇林凡和老祖的关系",
    chapterFunction: "兑现老祖升职+开启林凡与老祖的绑定",
    characters: [
      { name: "林富贵", role: "主角（阴间线）" },
      { name: "林凡", role: "主角（阳间线）" },
    ],
  },
  {
    sortOrder: 2,
    title: "上香",
    chapterType: "task_trigger",
    goal: "建立核心设定：林凡被老祖绑定，被迫接受任务",
    conflict: "林凡不想干但被威胁连带责任",
    emotion: "迷茫→震惊→无奈→被迫接受",
    hook: "老祖给的第一个任务：抓红裙女鬼",
    pleasurePoint: "老祖吹牛被打脸，林凡被迫接受",
    scene: "林家祖坟 + 林凡梦境",
    pov: "林凡",
    targetWordCount: 2500,
    mustDo: JSON.stringify(["老祖的吹牛", "林凡的吐槽", "连带责任的威胁", "清明上香的仪式感"]),
    mustNotDo: JSON.stringify(["不能让老祖显得太强", "不能解释太多阴间设定", "不能让林凡太容易接受"]),
    readerPromise: "理解核心绑定机制，期待林凡执行第一个任务",
    chapterFunction: "开启主线任务系统+建立阴阳绑定",
    characters: [
      { name: "林凡", role: "主角" },
      { name: "林富贵", role: "任务发布者" },
    ],
  },
  {
    sortOrder: 3,
    title: "第一个任务",
    chapterType: "mission",
    goal: "完成第一个任务，展示阳气优势，获得首次阴德提升",
    conflict: "女鬼的恐惧与林凡的疑惑",
    emotion: "紧张→害怕→发现优势→疑惑→收获",
    hook: "女鬼为什么怕我？老祖是不是在骗我？",
    pleasurePoint: "林凡阳气爆发，女鬼跪地求饶",
    scene: "废弃工地 + 林凡出租屋",
    pov: "林凡",
    targetWordCount: 2500,
    mustDo: JSON.stringify(["女鬼怕林凡的原因", "老祖的邀功", "记忆力提升的体现", "王德发的电话"]),
    mustNotDo: JSON.stringify(["不能完全解释阳气机制", "不能让老祖承认打不过", "不能让林凡变得太强"]),
    readerPromise: "看到林凡的第一次实战，理解阳气优势",
    chapterFunction: "兑现首个任务+开启阳气体系",
    characters: [
      { name: "林凡", role: "执行者" },
      { name: "林富贵", role: "旁观者/解说" },
      { name: "王德发", role: "电话客串" },
    ],
  },
];

// Beat 模板函数
function generateBeatTemplate(chapterType: string, targetWordCount: number, outline: any): any[] {
  const hook = outline.hook || "制造悬念";
  const goal = outline.goal || "推进剧情";
  const conflict = outline.conflict || "核心冲突";

  const templates: Record<string, any[]> = {
    task_trigger: [
      { type: "hook", wordTarget: 300, goal: "用意外事件或新信息制造好奇", mustInclude: [], mustAvoid: ["不要直接说出任务内容"] },
      { type: "reveal", wordTarget: 400, goal: `揭示任务内容：${goal}`, mustInclude: ["任务的具体要求"], mustAvoid: ["不要用系统提示代替场景"] },
      { type: "dialogue", wordTarget: 400, goal: "通过对话讨论任务的难度和意义", mustInclude: ["角色对任务的反应"], mustAvoid: ["不要变成旁白解说"] },
      { type: "conflict", wordTarget: 400, goal: "展示任务的阻碍或代价", mustInclude: ["具体的困难"], mustAvoid: ["不要一笔带过"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["悬念问题"], mustAvoid: ["不要提前解答"] },
    ],
    mission: [
      { type: "hook", wordTarget: 250, goal: "回顾目标，制造紧迫感", mustInclude: ["上一章结尾的承接"], mustAvoid: ["不要重复上一章内容"] },
      { type: "conflict", wordTarget: 500, goal: `执行过程中的冲突：${conflict}`, mustInclude: ["具体的冲突场景"], mustAvoid: ["不要跳过冲突直接成功"] },
      { type: "dialogue", wordTarget: 400, goal: "角色之间的配合或分歧", mustInclude: ["角色互动"], mustAvoid: ["不要变成独白"] },
      { type: "twist", wordTarget: 350, goal: "意外变数，打破计划", mustInclude: ["意外的具体表现"], mustAvoid: ["不要用巧合解释"] },
      { type: "payoff", wordTarget: 400, goal: "克服困难，完成任务", mustInclude: ["成功的具体过程"], mustAvoid: ["不要一笔带过成功"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["新悬念"], mustAvoid: ["不要仓促结尾"] },
    ],
    payoff: [
      { type: "pressure", wordTarget: 400, goal: "施加压力，累积读者期待", mustInclude: ["压力的具体来源"], mustAvoid: ["不要过于轻松"] },
      { type: "reversal", wordTarget: 400, goal: "反转局势，出乎意料", mustInclude: ["反转的具体表现"], mustAvoid: ["不要用巧合解释"] },
      { type: "payoff", wordTarget: 500, goal: "爽点释放，读者情绪高涨", mustInclude: ["爽点的具体释放场景", "旁观者的反应"], mustAvoid: ["不要只用系统提示代替场景"] },
      { type: "emotional", wordTarget: 300, goal: "角色和旁观者的反应", mustInclude: ["角色的情绪变化"], mustAvoid: ["不要忽略配角反应"] },
      { type: "hook_end", wordTarget: 250, goal: hook, mustInclude: ["新的期待"], mustAvoid: ["不要破坏爽感"] },
    ],
  };

  const template = templates[chapterType] || templates.mission;
  const totalTemplateWords = template.reduce((sum, b) => sum + b.wordTarget, 0);
  const ratio = targetWordCount / totalTemplateWords;

  return template.map((b) => ({
    ...b,
    wordTarget: Math.round(b.wordTarget * ratio),
  }));
}

async function main() {
  console.log("=== 为前三章生成 ChapterOutline、ChapterBeat 和 P0-P3 Prompt ===\n");

  // 1. 保存 ChapterOutline 到数据库
  console.log("【1. 保存 ChapterOutline】");
  for (const outline of chapterOutlines) {
    await prisma.chapterOutline.upsert({
      where: {
        novelId_sortOrder: {
          novelId: NOVEL_ID,
          sortOrder: outline.sortOrder,
        },
      },
      create: {
        novelId: NOVEL_ID,
        volumeId: VOLUME1_ID,
        sortOrder: outline.sortOrder,
        title: outline.title,
        chapterType: outline.chapterType,
        goal: outline.goal,
        conflict: outline.conflict,
        emotion: outline.emotion,
        hook: outline.hook,
        pleasurePoint: outline.pleasurePoint,
        scene: outline.scene,
        pov: outline.pov,
        targetWordCount: outline.targetWordCount,
        mustDo: outline.mustDo,
        mustNotDo: outline.mustNotDo,
        readerPromise: outline.readerPromise,
        chapterFunction: outline.chapterFunction,
      },
      update: {
        title: outline.title,
        chapterType: outline.chapterType,
        goal: outline.goal,
        conflict: outline.conflict,
        emotion: outline.emotion,
        hook: outline.hook,
        pleasurePoint: outline.pleasurePoint,
        scene: outline.scene,
        pov: outline.pov,
        targetWordCount: outline.targetWordCount,
        mustDo: outline.mustDo,
        mustNotDo: outline.mustNotDo,
        readerPromise: outline.readerPromise,
        chapterFunction: outline.chapterFunction,
      },
    });
    console.log(`  ✓ 第${outline.sortOrder}章 ${outline.title} (${outline.chapterType})`);
  }

  // 2. 生成 ChapterBeat
  console.log("\n【2. 生成 ChapterBeat】");
  for (const outline of chapterOutlines) {
    const beats = generateBeatTemplate(outline.chapterType, outline.targetWordCount, outline);

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      await prisma.chapterBeat.upsert({
        where: {
          novelId_chapterOrder_beatOrder: {
            novelId: NOVEL_ID,
            chapterOrder: outline.sortOrder,
            beatOrder: i + 1,
          },
        },
        create: {
          novelId: NOVEL_ID,
          chapterOrder: outline.sortOrder,
          beatOrder: i + 1,
          type: beat.type,
          goal: beat.goal,
          wordTarget: beat.wordTarget,
          mustInclude: JSON.stringify(beat.mustInclude || []),
          mustAvoid: JSON.stringify(beat.mustAvoid || []),
        },
        update: {
          type: beat.type,
          goal: beat.goal,
          wordTarget: beat.wordTarget,
          mustInclude: JSON.stringify(beat.mustInclude || []),
          mustAvoid: JSON.stringify(beat.mustAvoid || []),
        },
      });
    }

    console.log(`  ✓ 第${outline.sortOrder}章: ${beats.map((b) => `[${b.type} ${b.wordTarget}字]`).join(" → ")}`);
  }

  // 3. 从数据库读取并展示 ChapterOutline
  console.log("\n【3. ChapterOutline 数据展示】\n");
  for (const outline of chapterOutlines) {
    const dbOutline = await prisma.chapterOutline.findUnique({
      where: { novelId_sortOrder: { novelId: NOVEL_ID, sortOrder: outline.sortOrder } },
    });
    console.log(`--- 第${outline.sortOrder}章: ${dbOutline?.title} ---`);
    console.log(JSON.stringify(dbOutline, null, 2));
    console.log();
  }

  // 4. 从数据库读取并展示 ChapterBeat
  console.log("【4. ChapterBeat 数据展示】\n");
  for (const outline of chapterOutlines) {
    const beats = await prisma.chapterBeat.findMany({
      where: { novelId: NOVEL_ID, chapterOrder: outline.sortOrder },
      orderBy: { beatOrder: "asc" },
    });
    console.log(`--- 第${outline.sortOrder}章 Beats ---`);
    beats.forEach((b) => {
      console.log(`  Beat ${b.beatOrder} [${b.type}] ${b.wordTarget}字: ${b.goal}`);
      const mustDo = JSON.parse(b.mustInclude || "[]");
      const mustNot = JSON.parse(b.mustAvoid || "[]");
      if (mustDo.length) console.log(`    必须包含: ${mustDo.join(", ")}`);
      if (mustNot.length) console.log(`    必须避免: ${mustNot.join(", ")}`);
    });
    console.log();
  }

  // 5. 组装 P0-P3 Prompt
  console.log("【5. P0-P3 Prompt 展示】\n");
  const assembler = new ContextAssembler(NOVEL_ID);

  for (const outline of chapterOutlines) {
    console.log("=".repeat(80));
    console.log(`第${outline.sortOrder}章: ${outline.title}`);
    console.log("=".repeat(80));

    const prompt = await assembler.assembleForChapter(outline.sortOrder, {
      characters: outline.characters,
      title: outline.title,
      goal: outline.goal,
      conflict: outline.conflict,
      emotion: outline.emotion,
      hook: outline.hook,
      mustDo: outline.mustDo,
      mustNotDo: outline.mustNotDo,
      chapterType: outline.chapterType,
      targetWordCount: outline.targetWordCount,
    });

    console.log(prompt);
    console.log("\n");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
