import { LlmInvokeService } from "./llm/LlmInvokeService";
import { prisma } from "../db/prisma";
import { buildStoryContext } from "./StoryStateService";
import { getCompressedMemoryContext } from "./MemoryCompressionService";

const llmService = new LlmInvokeService();

// AI 导演系统 - 负责整体节奏和情绪控制
export async function directorAnalyze(input: {
  novelId: string;
  chapterOrder: number;
}): Promise<string> {
  const novel = await prisma.novel.findUnique({
    where: { id: input.novelId },
    include: {
      characters: true,
      chapters: { orderBy: { order: "asc" } },
      storyState: true,
      pleasurePoints: { orderBy: { chapterOrder: "desc" }, take: 10 },
      emotionCurve: { orderBy: { chapterOrder: "desc" }, take: 10 },
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const storyContext = await buildStoryContext(input.novelId);
  const memoryContext = await getCompressedMemoryContext(input.novelId, input.chapterOrder);

  const recentChapters = novel.chapters.slice(-5).map((c) => 
    `第${c.order}章 ${c.title}: ${c.summary || "无摘要"}`
  ).join("\n");

  const recentPleasures = novel.pleasurePoints.map((p) => 
    `第${p.chapterOrder}章: ${p.type} (强度${p.intensity})`
  ).join("\n");

  const recentEmotions = novel.emotionCurve.map((e) => 
    `第${e.chapterOrder}章: ${e.emotionType} (强度${e.intensity})`
  ).join("\n");

  const prompt = [
    "你是一位资深小说导演，负责把控长篇小说的整体节奏、情绪和爽点。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || "未指定"}`,
    `- 当前章节：第${input.chapterOrder}章`,
    "",
    "剧情状态：",
    storyContext,
    "",
    "记忆上下文：",
    memoryContext,
    "",
    "最近章节：",
    recentChapters || "暂无",
    "",
    "最近爽点：",
    recentPleasures || "暂无",
    "",
    "最近情绪：",
    recentEmotions || "暂无",
    "",
    "请分析当前剧情状态，并给出导演建议：",
    "",
    "1. 节奏分析：当前节奏是否合理？是否需要调整？",
    "2. 情绪分析：当前情绪曲线是否健康？是否需要插入压抑/释放？",
    "3. 爽点分析：爽点是否过于密集/稀疏？类型是否单一？",
    "4. 读者状态：读者疲劳度如何？是否需要喘息？",
    "5. 下一步建议：接下来3章应该怎么安排？",
    "",
    "请用 JSON 格式输出：",
    "{",
    '  "rhythm_analysis": "节奏分析",',
    '  "emotion_analysis": "情绪分析",',
    '  "pleasure_analysis": "爽点分析",',
    '  "reader_status": "读者状态",',
    '  "next_steps": ["建议1", "建议2", "建议3"],',
    '  "forbidden": ["禁止内容1", "禁止内容2"],',
    '  "allowed": ["允许内容1", "允许内容2"]',
    "}",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位资深小说导演，擅长把控长篇小说的节奏、情绪和爽点。你的分析要具体、可操作。",
    prompt,
    temperature: 0.3,
    maxTokens: 2000,
  });

  if (!result) throw new Error("分析失败：LLM 未返回结果。请检查 API Key 配置。");
  return result;
}

// 剧情规划器 - 规划后续剧情
export async function plotPlan(input: {
  novelId: string;
  currentChapter: number;
  planCount?: number;
}): Promise<string> {
  const novel = await prisma.novel.findUnique({
    where: { id: input.novelId },
    include: {
      characters: true,
      volumes: { include: { chapterOutlines: true } },
      storyState: true,
      foreshadows: true,
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const storyContext = await buildStoryContext(input.novelId);
  const memoryContext = await getCompressedMemoryContext(input.novelId, input.currentChapter);

  const characterInfo = novel.characters.map((c) => 
    `${c.name}(${c.role}): ${c.identity || ""} - ${c.motivation || ""}`
  ).join("\n");

  const foreshadows = novel.foreshadows.map((f) => 
    `- ${f.title}: ${f.description} (${f.status})`
  ).join("\n");

  const prompt = [
    "你是一位专业的小说剧情规划师，擅长长篇小说的剧情设计和伏笔回收。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || "未指定"}`,
    `- 当前章节：第${input.currentChapter}章`,
    "",
    "剧情状态：",
    storyContext,
    "",
    "记忆上下文：",
    memoryContext,
    "",
    "角色列表：",
    characterInfo || "暂无",
    "",
    "伏笔列表：",
    foreshadows || "暂无",
    "",
    `请规划接下来 ${input.planCount || 5} 章的剧情。`,
    "",
    "每章需要包含：",
    "1. 章节标题",
    "2. 核心事件",
    "3. 涉及角色",
    "4. 冲突来源",
    "5. 情绪走向",
    "6. 爽点设计",
    "7. 伏笔操作（埋设/回收）",
    "8. 与主线的关系",
    "",
    "请用 JSON 数组格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位专业的小说剧情规划师，擅长设计有深度、有节奏的长篇剧情。你规划的剧情要有因果关系，伏笔要前后呼应。",
    prompt,
    temperature: 0.7,
    maxTokens: 3000,
  });

  if (!result) throw new Error("规划失败：LLM 未返回结果。请检查 API Key 配置。");
  return result;
}

// 读者模拟器 - 模拟读者阅读体验
export async function readerSimulation(input: {
  novelId: string;
  chapterId: string;
}): Promise<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    include: {
      novel: {
        include: {
          characters: true,
          storyState: true,
        },
      },
    },
  });

  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const novel = chapter.novel;
  const storyContext = await buildStoryContext(input.novelId);

  const prompt = [
    "你是一位资深网文读者，擅长从读者角度分析小说的阅读体验。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || "未指定"}`,
    `- 章节：第${chapter.order}章 ${chapter.title}`,
    "",
    "剧情状态：",
    storyContext,
    "",
    "章节内容：",
    chapter.content || "章节内容为空",
    "",
    "请从读者角度分析这个章节：",
    "",
    "1. 爽感评分（1-10）：读者看完会有多爽？",
    "2. 压抑评分（1-10）：读者会有多压抑/不爽？",
    "3. 信息密度（1-10）：信息量是否合适？",
    "4. 悬念值（1-10）：结尾悬念有多强？",
    "5. 疲劳度（1-10）：读者会有多疲劳？",
    "6. 套路重复（1-10）：是否过于套路？",
    "7. 代入感（1-10）：读者代入感有多强？",
    "8. 期待值（1-10）：读者对下一章的期待有多强？",
    "",
    "9. 优点：这个章节的优点是什么？",
    "10. 缺点：这个章节的缺点是什么？",
    "11. 建议：如何改进？",
    "",
    "请用 JSON 格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位资深网文读者，阅读过大量网络小说，对爽点、节奏、套路非常敏感。你要从读者角度给出真实、具体的评价。",
    prompt,
    temperature: 0.3,
    maxTokens: 1500,
  });

  if (!result) throw new Error("模拟失败：LLM 未返回结果。请检查 API Key 配置。");
  return result;
}

// 综合创作建议
export async function creativeAdvice(input: {
  novelId: string;
  chapterOrder: number;
}): Promise<string> {
  const directorResult = await directorAnalyze({
    novelId: input.novelId,
    chapterOrder: input.chapterOrder,
  });

  const plotResult = await plotPlan({
    novelId: input.novelId,
    currentChapter: input.chapterOrder,
    planCount: 3,
  });

  const prompt = [
    "你是一位小说创作顾问，需要综合导演分析和剧情规划，给出最终的创作建议。",
    "",
    "导演分析：",
    directorResult,
    "",
    "剧情规划：",
    plotResult,
    "",
    "请综合以上分析，给出：",
    "",
    "1. 核心建议（最重要的3点）",
    "2. 本章写作要点",
    "3. 需要避免的问题",
    "4. 下一章预告",
    "",
    "请用 JSON 格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位小说创作顾问，擅长综合各种分析，给出具体、可操作的创作建议。",
    prompt,
    temperature: 0.5,
    maxTokens: 1500,
  });

  if (!result) throw new Error("建议生成失败：LLM 未返回结果。请检查 API Key 配置。");
  return result;
}
