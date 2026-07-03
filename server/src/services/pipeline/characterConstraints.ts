/**
 * 人物约束机制
 * 在生成章节内容时，强制 LLM 遵守角色的：
 * 1. 人设约束（会做/不会做的事）
 * 2. 知识范围（不该知道的信息）
 * 3. 言语风格
 * 4. 角色关系状态
 */

import { prisma } from "../../db/prisma";
import { formatJsonArray } from "./promptFormatters";

/**
 * 核心函数：构建角色约束文本（注入到写作 prompt 中）
 */
export async function buildCharacterConstraints(
  novelId: string,
  chapterOrder: number,
): Promise<string> {
  // 查询该小说的所有角色
  const characters = await prisma.character.findMany({
    where: { novelId },
    orderBy: { role: "asc" },
  });

  if (characters.length === 0) {
    return "【人物约束】\n暂无角色设定。";
  }

  const constraintSections: string[] = [];

  for (const char of characters) {
    // 跳过未出场或已退场的角色
    if (char.firstAppear && char.firstAppear > chapterOrder) continue;
    if (char.lastAppear && char.lastAppear < chapterOrder) continue;

    const sections: string[] = [];
    sections.push(`\n【${char.name}】${char.role ? `（${char.role}）` : ""}`);

    // 1. 身份与背景
    if (char.identity || char.background) {
      sections.push(`身份：${char.identity || char.background || "未设定"}`);
    }

    // 2. 言语风格
    if (char.speechStyle) {
      sections.push(`言语风格：${char.speechStyle}`);
    }

    // 2.1 核心性格
    if (char.personality) {
      sections.push(`核心性格：${char.personality}`);
    }

    // 2.2 行为规则
    if (char.behaviorRules) {
      sections.push(`行为规则：${formatJsonArray(char.behaviorRules)}`);
    }

    // 2.3 禁止行为
    if (char.forbiddenBehavior) {
      sections.push(`禁止行为：${formatJsonArray(char.forbiddenBehavior)}`);
    }

    // 2.4 标志台词
    if (char.signatureLines) {
      sections.push(`标志台词：${formatJsonArray(char.signatureLines)}`);
    }

    // 2.5 标志场景
    if (char.signatureScenes) {
      sections.push(`标志场景：${formatJsonArray(char.signatureScenes)}`);
    }

    // 2.6 喜剧机制
    if (char.comedyMechanisms) {
      sections.push(`喜剧机制：${formatJsonArray(char.comedyMechanisms)}`);
    }

    // 2.7 情绪触发点
    if (char.emotionalHooks) {
      sections.push(`情绪触发点：${formatJsonArray(char.emotionalHooks)}`);
    }

    // 3. 动机与行为模式
    if (char.motivation) {
      sections.push(`动机：${char.motivation}`);
    }

    // 4. 人设约束（从 notes 提取）
    const personalityConstraints = extractPersonalityConstraints(char);
    if (personalityConstraints.canDo.length > 0) {
      sections.push(`会做的事：${personalityConstraints.canDo.join("、")}`);
    }
    if (personalityConstraints.cannotDo.length > 0) {
      sections.push(`⚠️ 绝不会做：${personalityConstraints.cannotDo.join("、")}`);
    }

    // 5. 成长红线（角色弧线约束）
    if (char.arcDetail) {
      const arcConstraint = extractArcConstraint(char.arcDetail);
      if (arcConstraint) {
        sections.push(`成长红线：${arcConstraint}`);
      }
    }

    // 6. 知识范围约束（当前章节不知道什么）
    const unknownFacts = await getCurrentUnknownFacts(char, chapterOrder);
    if (unknownFacts.length > 0) {
      sections.push(`\n⚠️ ${char.name}在第 ${chapterOrder} 章时【不知道】：`);
      unknownFacts.forEach(fact => sections.push(`  - ${fact}`));
      sections.push(`❌ 禁止让${char.name}在本章表现出知道这些信息！`);
    }

    // 7. 角色关系状态
    const relationships = await getCurrentRelationships(novelId, char.name, chapterOrder);
    if (relationships.length > 0) {
      sections.push(`\n关系状态（第 ${chapterOrder} 章）：`);
      relationships.forEach(rel => sections.push(`  - ${rel}`));
    }

    constraintSections.push(sections.join("\n"));
  }

  if (constraintSections.length === 0) {
    return "【人物约束】\n暂无约束条件。";
  }

  return `【人物约束（必须严格遵守！）】\n${constraintSections.join("\n")}`;
}

/**
 * 从 notes 中提取"会做/不会做"的约束
 */
function extractPersonalityConstraints(char: {
  notes?: string | null;
}): { canDo: string[]; cannotDo: string[] } {
  const canDo: string[] = [];
  const cannotDo: string[] = [];

  const text = char.notes || "";
  if (!text) return { canDo, cannotDo };

  // 先提取"不会做"的模式（必须先处理，避免被"会做"误匹配）
  const cannotDoPatterns = [
    /绝不会做[：:](.*?)(?=\n|$)/gi,
    /不会做[：:](.*?)(?=\n|$)/gi,
    /绝不会[：:](.*?)(?=\n|$)/gi,
    /禁止[：:](.*?)(?=\n|$)/gi,
  ];
  cannotDoPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const items = match[1].split(/[、，,;；]/);
        items.forEach(item => {
          const clean = item.trim();
          if (clean && !cannotDo.includes(clean)) {
            cannotDo.push(clean);
          }
        });
      }
    }
  });

  // 再提取"会做"的模式
  const canDoPatterns = [
    /(?<!绝不|不)会做[：:](.*?)(?=\n|$)/gi,
  ];
  canDoPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const items = match[1].split(/[、，,;；]/);
        items.forEach(item => {
          const clean = item.trim();
          // 排除已经在 cannotDo 中的项
          if (clean && !canDo.includes(clean) && !cannotDo.includes(clean)) {
            canDo.push(clean);
          }
        });
      }
    }
  });

  return { canDo, cannotDo };
}

/**
 * 从 arcDetail 中提取成长红线（必须遵守的核心约束）
 */
function extractArcConstraint(arcDetail: string): string | null {
  // 匹配"红线"、"必须"、"不能"等关键词
  const redLinePatterns = [
    /红线[：:](.*?)(?=\n|$)/i,
    /必须(.*?)(?=\n|$)/i,
    /核心约束[：:](.*?)(?=\n|$)/i,
  ];

  for (const pattern of redLinePatterns) {
    const match = arcDetail.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // 如果没有明确的红线标记，返回前 50 字作为提示
  return arcDetail.length > 50 ? arcDetail.slice(0, 50) + "..." : arcDetail;
}

/**
 * 获取角色在当前章节不知道的信息
 * knowledgeScope 格式：[{"chapter": 50, "knowledge": ["知道了XX秘密"]}]
 * 逻辑：chapter > chapterOrder 的知识条目是"未来知识"，角色在当前章节不应知道
 */
async function getCurrentUnknownFacts(
  char: { id: string; knowledgeScope?: string | null },
  chapterOrder: number,
): Promise<string[]> {
  if (!char.knowledgeScope) return [];

  try {
    const knowledgeScope = JSON.parse(char.knowledgeScope);
    if (!Array.isArray(knowledgeScope)) return [];

    const unknownFacts: string[] = [];

    for (const entry of knowledgeScope) {
      // 格式1：{chapter, knowledge} — updateCharacterKnowledge 写入的格式
      if (entry.chapter && Array.isArray(entry.knowledge) && entry.chapter > chapterOrder) {
        unknownFacts.push(...entry.knowledge);
      }
      // 格式2：{chapterRange, unknownFacts} — 兼容旧格式
      else if (entry.chapterRange && Array.isArray(entry.unknownFacts)) {
        const range = parseChapterRange(entry.chapterRange);
        if (range && chapterOrder >= range.start && chapterOrder <= range.end) {
          unknownFacts.push(...entry.unknownFacts);
        }
      }
    }

    return unknownFacts;
  } catch (e) {
    console.warn("[characterConstraints] knowledgeScope 解析失败:", e);
    return [];
  }
}

/**
 * 解析章节范围字符串（如 "1-10", "5", "10-50"）
 */
function parseChapterRange(range: string): { start: number; end: number } | null {
  const trimmed = range.trim();

  // 单个章节："5"
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    return { start: num, end: num };
  }

  // 范围："1-10"
  const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (match) {
    return {
      start: parseInt(match[1], 10),
      end: parseInt(match[2], 10),
    };
  }

  return null;
}

/**
 * 获取角色在当前章节的关系状态
 */
async function getCurrentRelationships(
  novelId: string,
  charName: string,
  chapterOrder: number,
): Promise<string[]> {
  // 查询所有与该角色相关的关系
  const relations = await prisma.characterRelation.findMany({
    where: {
      novelId,
      OR: [
        { charA: { name: charName } },
        { charB: { name: charName } },
      ],
      status: "active",
    },
    include: { charA: true, charB: true },
  });

  if (relations.length === 0) return [];

  const result: string[] = [];

  for (const rel of relations) {
    // 检查关系是否在当前章节生效
    if (rel.startChapter && rel.startChapter > chapterOrder) continue;
    if (rel.endChapter && rel.endChapter < chapterOrder) continue;

    const otherChar = rel.charA.name === charName ? rel.charB.name : rel.charA.name;
    const relType = rel.relType || "未知";

    // 提取当前章节的关系描述
    const desc = extractRelationshipDescription(rel.description, chapterOrder);
    const fullDesc = desc ? `${otherChar}：${relType}（${desc}）` : `${otherChar}：${relType}`;

    result.push(fullDesc);
  }

  return result;
}

/**
 * 从关系描述中提取当前章节的状态
 * description 可能是分阶段的 JSON 数组：
 * [{"chapterRange": "1-10", "desc": "互相嫌弃"}, {"chapterRange": "11-20", "desc": "渐生好感"}]
 * 或者是纯文本
 */
function extractRelationshipDescription(
  description: string | null | undefined,
  chapterOrder: number,
): string | null {
  if (!description) return null;

  // 尝试解析为 JSON
  try {
    const stages = JSON.parse(description);
    if (!Array.isArray(stages)) {
      // 不是数组，返回原始文本
      return description;
    }

    // 找到匹配当前章节的阶段
    for (const stage of stages) {
      if (!stage.chapterRange || !stage.desc) continue;

      const range = parseChapterRange(stage.chapterRange);
      if (!range) continue;

      if (chapterOrder >= range.start && chapterOrder <= range.end) {
        return stage.desc;
      }
    }

    // 如果没有匹配的阶段，返回最后一个阶段的描述
    if (stages.length > 0 && stages[stages.length - 1].desc) {
      return stages[stages.length - 1].desc;
    }

    return null;
  } catch {
    // 解析失败，返回原始文本
    return description;
  }
}

/**
 * 格式化约束文本为易读的 Markdown 格式（可选，用于前端展示）
 */
export function formatConstraintsForPrompt(constraints: string): string {
  // 确保有明确的警告标记
  return constraints
    .replace(/⚠️/g, "⚠️ ")
    .replace(/❌/g, "❌ ")
    .replace(/【/g, "\n【")
    .trim();
}

/**
 * 辅助函数：获取两个角色在当前章节的关系状态（用于生成时的细粒度检查）
 */
export async function getCurrentRelationship(
  novelId: string,
  charA: string,
  charB: string,
  chapterOrder: number,
): Promise<string | null> {
  const relation = await prisma.characterRelation.findFirst({
    where: {
      novelId,
      OR: [
        { charA: { name: charA }, charB: { name: charB } },
        { charA: { name: charB }, charB: { name: charA } },
      ],
      status: "active",
    },
  });

  if (!relation) return null;

  // 检查关系是否在当前章节生效
  if (relation.startChapter && relation.startChapter > chapterOrder) return null;
  if (relation.endChapter && relation.endChapter < chapterOrder) return null;

  const desc = extractRelationshipDescription(relation.description, chapterOrder);
  return desc
    ? `${relation.relType}（${desc}）`
    : relation.relType || "未知关系";
}
