/**
 * 角色知识边界追踪模块
 * 追踪"谁知道了什么"，防止信息泄露（角色 A 在第 50 章获知的秘密，不能出现在第 200 章的角色 B 对话中）
 */

import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { LlmInvokeService } from "../llm/LlmInvokeService";

const llmService = new LlmInvokeService();

/**
 * 从章节内容中提取角色获知的关键信息
 * 写作后调用，更新 Character.knowledgeScope
 */
export async function updateCharacterKnowledge(
  novelId: string,
  chapterOrder: number,
  content: string,
  characterNames: string[],
): Promise<void> {
  if (characterNames.length === 0) return;

  const prompt = `请分析以下章节内容，提取每个角色在本章获知的关键信息。

【本章出场角色】
${characterNames.join("、")}

【章节内容】
${content.slice(0, 3000)}

请输出 JSON：
{
  "knowledgeUpdates": [
    {
      "character": "角色名",
      "knowledge": ["该角色在本章获知的关键信息1", "信息2"]
    }
  ]
}

只输出 JSON。如果某个角色在本章没有获知新的重要信息，不要列入。`;

  try {
    const result = await llmService.completeText({ prompt, temperature: 0.3, maxTokens: 600 });
    const parsed = parseLlmJson<any>(result);
    if (!parsed?.knowledgeUpdates?.length) return;

    for (const update of parsed.knowledgeUpdates) {
      if (!update.character || !update.knowledge?.length) continue;

      // 读取现有知识范围
      const character = await prisma.character.findFirst({
        where: { novelId, name: update.character },
        select: { id: true, knowledgeScope: true },
      });
      if (!character) continue;

      let existingKnowledge: Array<{ chapter: number; knowledge: string[] }> = [];
      try {
        existingKnowledge = JSON.parse(character.knowledgeScope || "[]");
      } catch {
        existingKnowledge = [];
      }

      // 追加新知识
      existingKnowledge.push({
        chapter: chapterOrder,
        knowledge: update.knowledge,
      });

      // 保留最近 100 条，避免无限增长
      if (existingKnowledge.length > 100) {
        existingKnowledge = existingKnowledge.slice(-100);
      }

      await prisma.character.update({
        where: { id: character.id },
        data: { knowledgeScope: JSON.stringify(existingKnowledge) },
      });
    }
  } catch (e) {
    console.warn("[characterKnowledge] 知识范围更新失败:", e);
  }
}

