import { prisma } from "../../db/prisma";
import { parseLlmJson } from "../../utils/parseJson";
import { LlmInvokeService } from "../llm/LlmInvokeService";

const llmService = new LlmInvokeService();

/**
 * 分析章节内容，更新 StoryState（剧情状态机）
 */
export async function updateStoryState(novelId: string, chapterOrder: number, content: string): Promise<void> {
  const prompt = `请分析以下章节内容，提取剧情状态变化。

【章节内容】
${content.slice(0, 2000)}

请输出 JSON：
{
  "currentPhase": "setup/development/climax/resolution",
  "protagonistLevel": "主角当前等级或实力变化",
  "protagonistGoal": "主角当前目标",
  "protagonistStatus": "主角当前处境",
  "currentEmotion": "neutral/tension/release/depression/climax",
  "emotionIntensity": 5,
  "tensionAccumulation": 0,
  "activeForeshadows": ["活跃伏笔标题"],
  "pendingPayoffs": ["待回收伏笔标题"]
}

只输出 JSON，不要其他文字。`;

  try {
    const result = await llmService.completeText({ prompt, temperature: 0.3, maxTokens: 800 });
    const parsed = parseLlmJson<any>(result);
    if (!parsed) return;

    await prisma.storyState.upsert({
      where: { novelId },
      update: {
        currentChapter: chapterOrder,
        currentPhase: parsed.currentPhase || "development",
        protagonistLevel: parsed.protagonistLevel || "",
        protagonistGoal: parsed.protagonistGoal || "",
        protagonistStatus: parsed.protagonistStatus || "",
        currentEmotion: parsed.currentEmotion || "neutral",
        emotionIntensity: parsed.emotionIntensity || 5,
        tensionAccumulation: parsed.tensionAccumulation || 0,
        activeForeshadows: JSON.stringify(parsed.activeForeshadows || []),
        pendingPayoffs: JSON.stringify(parsed.pendingPayoffs || []),
      },
      create: {
        novelId,
        currentChapter: chapterOrder,
        currentPhase: parsed.currentPhase || "development",
        currentEmotion: parsed.currentEmotion || "neutral",
      },
    });
  } catch (e) {
    console.warn("[postProcessing] StoryState 更新失败:", e);
  }
}

/**
 * 从章节内容中提取关键信息，写入 Memory 表
 */
export async function extractMemories(novelId: string, chapterId: string, content: string): Promise<number> {
  const prompt = `请从以下章节内容中提取关键信息。

【章节内容】
${content.slice(0, 2000)}

请提取以下类型的记忆：
1. 世界记忆（world）：世界观设定、规则、地理等
2. 角色记忆（character）：人物特征、关系变化、成长
3. 剧情记忆（plot）：关键事件、转折点、冲突
4. 伏笔记忆（foreshadow）：埋设的伏笔、悬念

请用JSON格式输出：
{
  "memories": [
    { "type": "world", "title": "记忆标题", "content": "记忆内容", "importance": 8 }
  ]
}

只输出 JSON，不要其他文字。`;

  try {
    const result = await llmService.completeText({ prompt, temperature: 0.3, maxTokens: 1000 });
    const parsed = parseLlmJson<any>(result);
    if (!parsed?.memories?.length) return 0;

    let count = 0;
    for (const mem of parsed.memories) {
      if (!mem.title || !mem.content) continue;
      await prisma.memory.create({
        data: {
          novelId,
          type: mem.type || "plot",
          category: "",
          title: mem.title,
          content: mem.content,
          importance: mem.importance || 5,
          chapterId,
        },
      });
      count++;
    }
    return count;
  } catch (e) {
    console.warn("[postProcessing] 记忆提取失败:", e);
    return 0;
  }
}
