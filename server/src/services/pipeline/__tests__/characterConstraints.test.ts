/**
 * 人物约束机制测试脚本
 * 用于验证角色约束是否正确构建
 */

import { prisma } from "../../../db/prisma";
import { buildCharacterConstraints, getCurrentRelationship } from "../characterConstraints";

/**
 * 测试场景：
 * 1. 创建测试小说和角色
 * 2. 设置人物约束（会做/不会做、知识范围、言语风格）
 * 3. 构建约束文本
 * 4. 验证约束是否包含预期内容
 */
async function testCharacterConstraints() {
  console.log("========== 人物约束机制测试 ==========\n");

  // 1. 创建测试小说
  const novel = await prisma.novel.create({
    data: {
      title: "测试小说：修仙传",
      genre: "玄幻",
      status: "drafting",
    },
  });
  console.log(`✓ 创建测试小说：${novel.title} (${novel.id})\n`);

  // 2. 创建测试角色：林凡（主角）
  const protagonist = await prisma.character.create({
    data: {
      novelId: novel.id,
      name: "林凡",
      role: "主角",
      identity: "外门弟子",
      motivation: "成为真正的强者，保护身边的人",
      notes: `会做：从零开始学习、认真完成任务、回报真心对他好的人
绝不会做：一步登天、变得傲慢、依赖老祖解决阳间问题`,
      speechStyle: "内心独白：理性分析；对外：低调谨慎",
      arcDetail: "红线：所有能力都必须有习得过程，不能无缘无故开挂",
      knowledgeScope: JSON.stringify([
        {
          chapterRange: "1-10",
          unknownFacts: ["师父是改革派", "功法 Bug 的真相", "宗门的真正历史"],
        },
        {
          chapterRange: "11-20",
          unknownFacts: ["掌门的秘密", "天机阁的阴谋"],
        },
      ]),
      firstAppear: 1,
    },
  });
  console.log(`✓ 创建主角：${protagonist.name}`);
  console.log(`  - 人设约束：会做 3 项，绝不会做 3 项`);
  console.log(`  - 知识范围：第 1-10 章不知道 3 项信息，第 11-20 章不知道 2 项信息`);
  console.log(`  - 言语风格：内心独白理性分析，对外低调谨慎\n`);

  // 3. 创建测试角色：林富贵（配角）
  const sidekick = await prisma.character.create({
    data: {
      novelId: novel.id,
      name: "林富贵",
      role: "配角",
      identity: "林凡的堂弟",
      motivation: "证明自己比林凡强",
      notes: "会做：炫耀、吹牛、找茬\n不会做：认真修炼、承认错误",
      speechStyle: "浮夸、爱用叹词（哎呀、我的天）",
      firstAppear: 1,
    },
  });
  console.log(`✓ 创建配角：${sidekick.name}\n`);

  // 4. 创建角色关系
  await prisma.characterRelation.create({
    data: {
      novelId: novel.id,
      charAId: protagonist.id,
      charBId: sidekick.id,
      relType: "亲属",
      description: JSON.stringify([
        { chapterRange: "1-5", desc: "互相嫌弃，被迫绑定" },
        { chapterRange: "6-15", desc: "渐生信任，患难与共" },
        { chapterRange: "16-30", desc: "生死兄弟" },
      ]),
      startChapter: 1,
      status: "active",
    },
  });
  console.log(`✓ 创建角色关系：林凡 ↔ 林富贵（分阶段关系）\n`);

  // 5. 测试第 5 章的约束构建
  console.log("========== 测试第 5 章约束构建 ==========\n");
  const constraints5 = await buildCharacterConstraints(novel.id, 5);
  console.log(constraints5);
  console.log("\n");

  // 6. 验证约束内容
  console.log("========== 验证约束内容 ==========\n");
  const checks = [
    { name: "包含林凡人设", pass: constraints5.includes("林凡") && constraints5.includes("主角") },
    { name: "包含会做事项", pass: constraints5.includes("会做的事") && constraints5.includes("从零开始学习") },
    { name: "包含绝不会做", pass: constraints5.includes("绝不会做") && constraints5.includes("一步登天") },
    { name: "包含言语风格", pass: constraints5.includes("言语风格") && constraints5.includes("低调谨慎") },
    { name: "包含成长红线", pass: constraints5.includes("成长红线") && constraints5.includes("习得过程") },
    { name: "包含知识禁区", pass: constraints5.includes("不知道") && constraints5.includes("师父是改革派") },
    { name: "包含禁止警告", pass: constraints5.includes("禁止让林凡") },
    { name: "包含关系状态", pass: constraints5.includes("林富贵") && constraints5.includes("互相嫌弃") },
    { name: "包含林富贵", pass: constraints5.includes("林富贵") && constraints5.includes("配角") },
  ];

  checks.forEach(check => {
    console.log(`${check.pass ? "✓" : "✗"} ${check.name}`);
  });

  const passCount = checks.filter(c => c.pass).length;
  console.log(`\n测试结果：${passCount}/${checks.length} 项通过\n`);

  // 7. 测试第 15 章的约束构建（知识范围变化）
  console.log("========== 测试第 15 章约束构建（知识范围变化）==========\n");
  const constraints15 = await buildCharacterConstraints(novel.id, 15);
  console.log(constraints15);
  console.log("\n");

  // 验证第 15 章不应该包含 "师父是改革派"（因为已经过了第 1-10 章）
  // 但应该包含 "掌门的秘密"（因为还在第 11-20 章范围内）
  const check15 = [
    { name: "不包含第1-10章禁区", pass: !constraints15.includes("师父是改革派") },
    { name: "包含第11-20章禁区", pass: constraints15.includes("掌门的秘密") },
    { name: "关系变化为患难与共", pass: constraints15.includes("患难与共") },
  ];

  check15.forEach(check => {
    console.log(`${check.pass ? "✓" : "✗"} ${check.name}`);
  });

  // 8. 测试获取特定关系
  console.log("\n========== 测试获取特定关系 ==========\n");
  const rel5 = await getCurrentRelationship(novel.id, "林凡", "林富贵", 5);
  console.log(`第 5 章：林凡 ↔ 林富贵 = ${rel5}`);

  const rel10 = await getCurrentRelationship(novel.id, "林凡", "林富贵", 10);
  console.log(`第 10 章：林凡 ↔ 林富贵 = ${rel10}`);

  const rel20 = await getCurrentRelationship(novel.id, "林凡", "林富贵", 20);
  console.log(`第 20 章：林凡 ↔ 林富贵 = ${rel20}`);

  // 9. 清理测试数据
  console.log("\n========== 清理测试数据 ==========\n");
  await prisma.characterRelation.deleteMany({ where: { novelId: novel.id } });
  await prisma.character.deleteMany({ where: { novelId: novel.id } });
  await prisma.novel.delete({ where: { id: novel.id } });
  console.log("✓ 测试数据已清理\n");

  console.log("========== 测试完成 ==========\n");

  if (passCount >= 8) {
    console.log("✅ 人物约束机制测试通过！");
  } else {
    console.log("⚠️ 人物约束机制测试未完全通过，请检查实现。");
  }
}

// 执行测试
testCharacterConstraints()
  .catch(e => {
    console.error("测试失败:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
