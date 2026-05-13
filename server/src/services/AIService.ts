import { LlmInvokeService } from "./llm/LlmInvokeService";
import { prisma } from "../db/prisma";
import { buildStoryContext } from "./StoryStateService";

const llmService = new LlmInvokeService();

export async function generateInspiration(input: {
  genre?: string;
  audience?: string;
  keywords?: string[];
}): Promise<string> {
  const prompt = [
    "你是一位资深网文策划编辑，擅长把握市场趋势和读者心理。",
    "",
    "请基于以下信息生成小说核心概念：",
    `- 目标类型: ${input.genre || "未指定"}`,
    `- 目标读者: ${input.audience || "网文读者"}`,
    `- 关键词: ${input.keywords?.join("、") || "无"}`,
    "",
    "请生成：",
    "1. 一个极具传播性的一句话 hook（10-20字）",
    "2. 高概念描述（50-100字）",
    "3. 5 个核心爽点",
    "4. 目标读者画像",
    "5. 市场潜力评估",
    "",
    "请用 JSON 格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位专业的网文策划编辑，擅长创作极具传播性的小说概念。",
    prompt,
    temperature: 0.8,
    maxTokens: 1000,
  });

  return result || "生成失败，请重试。";
}

export async function generateVolumeOutline(input: {
  novelId: string;
  volumeCount?: number;
  genre?: string;
  inspiration?: string;
}): Promise<string> {
  const novel = await prisma.novel.findUnique({
    where: { id: input.novelId },
    include: {
      characters: true,
      memories: { where: { type: "world" }, take: 10 },
      worldviews: { take: 1 },
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const characterInfo = novel.characters.map((c) => `${c.name}(${c.role || "未定"})`).join("、");
  const worldMemory = novel.memories.map((m) => m.content).join("\n");
  const worldviewInfo = novel.worldviews[0] ? `${novel.worldviews[0].name}: ${novel.worldviews[0].summary || ""}` : "";

  const prompt = [
    "你是一位专业的网络小说作家，擅长长篇小说的卷纲规划。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || input.genre || "未指定"}`,
    `- 灵感：${novel.inspiration || input.inspiration || "未填写"}`,
    `- 角色：${characterInfo || "暂无"}`,
    "",
    "世界观：",
    worldviewInfo || "暂无",
    "",
    "世界观记忆：",
    worldMemory || "暂无",
    "",
    `请为这本小说生成 ${input.volumeCount || 5} 卷的卷纲规划。`,
    "",
    "每卷需要包含：",
    "1. 卷名（简洁有力）",
    "2. 本卷目标（主角要达成什么）",
    "3. 主要冲突（核心矛盾）",
    "4. 情绪基调（如：压抑→爆发→爽）",
    "5. 章节数量（建议10-20章）",
    "6. 目标字数（每章2000-2500字）",
    "7. 关键事件（2-3个重要转折点）",
    "8. 转折点（本卷最大的剧情转折）",
    "9. 高潮描述（本卷最精彩的部分）",
    "10. 新地图/新势力",
    "11. 结尾钩子（让读者想看下一卷）",
    "",
    "请用 JSON 数组格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位专业的网络小说作家，擅长长篇小说的卷纲规划和节奏控制。",
    prompt,
    temperature: 0.7,
    maxTokens: 3000,
  });

  return result || "生成失败，请重试。";
}

/**
 * 根据卷纲批量生成章纲
 */
export async function generateChapterOutlinesForVolume(input: {
  novelId: string;
  volumeId: string;
  chapterCount?: number;
}): Promise<any[]> {
  const volume = await prisma.volume.findUnique({
    where: { id: input.volumeId },
    include: {
      novel: {
        include: {
          characters: true,
          mainlines: true,
          styleProfiles: { where: { isDefault: true }, take: 1 },
        },
      },
    },
  });

  if (!volume) {
    throw new Error("卷纲不存在。");
  }

  const novel = volume.novel;
  const characterInfo = novel.characters.map((c) => `${c.name}(${c.role || "未定"})`).join("、");
  const mainlineInfo = novel.mainlines.map((m, i) => `${i + 1}. ${m.title}`).join("\n");
  const styleInfo = novel.styleProfiles[0]?.name || "默认风格";

  const chapterCount = input.chapterCount || 10;

  const prompt = `你是一位专业的网文大纲设计师。请为以下卷纲设计${chapterCount}章的章纲。

【小说信息】
书名：${novel.title}
类型：${novel.genre || "未指定"}

【卷纲信息】
卷名：${volume.title}
本卷目标：${volume.goal || "未设定"}
主要冲突：${volume.conflict || "未设定"}
情绪基调：${volume.emotion || "未设定"}
结尾钩子：${volume.endHook || "未设定"}

【人物设定】
${characterInfo || "暂无"}

【故事主线】
${mainlineInfo || "暂无"}

【写作风格】
${styleInfo}

请生成${chapterCount}章的章纲，每章包含：
1. 章节标题（要有吸引力，不要用"第X章"这种格式）
2. 章节目标（本章要完成什么）
3. 核心冲突（本章的主要矛盾）
4. 情绪曲线（开头→发展→高潮→结尾）
5. 爽点设计（本章的爽点在哪里）
6. 章末钩子（让读者想看下一章）

要求：
- 每章目标字数：2000-2500字
- 节奏要紧凑，不要写太散
- 必须有明确的爽点和钩子
- 章节之间要有连贯性

请用JSON数组格式输出：
[
  {
    "title": "章节标题",
    "goal": "章节目标",
    "conflict": "核心冲突",
    "emotion": "情绪曲线",
    "pleasure_point": "爽点设计",
    "hook": "章末钩子"
  }
]`;

  const result = await llmService.completeText({
    system: "你是一位专业的网文大纲设计师，擅长设计节奏紧凑、爽点密集的章节结构。",
    prompt,
    temperature: 0.7,
    maxTokens: 4000,
  });

  if (!result) {
    throw new Error("章纲生成失败");
  }

  try {
    // 尝试解析JSON
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("无法解析章纲JSON");
  } catch (e) {
    console.error("章纲解析失败:", e);
    throw new Error("章纲解析失败，请重试");
  }
}

export async function generateChapterOutline(input: {
  novelId: string;
  volumeId: string;
  chapterCount?: number;
}): Promise<string> {
  const volume = await prisma.volume.findUnique({
    where: { id: input.volumeId },
    include: {
      novel: {
        include: {
          characters: true,
          memories: {
            where: { type: { in: ["world", "character", "plot"] } },
            take: 20,
            orderBy: { importance: "desc" },
          },
        },
      },
    },
  });

  if (!volume) {
    throw new Error("卷纲不存在。");
  }

  const novel = volume.novel;
  const characterInfo = novel.characters.map((c) => `${c.name}(${c.role || "未定"})`).join("、");
  const memoryContext = novel.memories.map((m) => `[${m.type}] ${m.title}: ${m.content}`).join("\n");

  const prompt = [
    "你是一位专业的网络小说作家，擅长章节级别的剧情规划。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || "未指定"}`,
    "",
    "当前卷纲：",
    `- 卷名：${volume.title}`,
    `- 本卷目标：${volume.goal || "未设定"}`,
    `- 主要冲突：${volume.conflict || "未设定"}`,
    `- 情绪基调：${volume.emotion || "未设定"}`,
    `- 结尾钩子：${volume.endHook || "未设定"}`,
    "",
    `角色：${characterInfo || "暂无"}`,
    "",
    "相关记忆：",
    memoryContext || "暂无",
    "",
    `请为这一卷生成 ${input.chapterCount || 10} 个章纲。`,
    "",
    "每章需要包含：",
    "1. 章节名（简洁有力）",
    "2. 章节目标（本章要推进什么）",
    "3. 冲突（核心矛盾）",
    "4. 情绪基调（如：紧张、悲伤、爽）",
    "5. 爽点设计（本章的爽点）",
    "6. 章末钩子（让读者继续看）",
    "",
    "请用 JSON 数组格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位专业的网络小说作家，擅长章节级别的剧情设计和爽点控制。",
    prompt,
    temperature: 0.7,
    maxTokens: 3000,
  });

  return result || "生成失败，请重试。";
}

export async function generateChapterOutlineForChapter(input: {
  novelId: string;
  chapterId: string;
}): Promise<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    include: {
      novel: {
        include: {
          characters: true,
          volumes: { orderBy: { sortOrder: "asc" } },
          chapterOutlines: { orderBy: { sortOrder: "asc" } },
          mainlines: true,
        },
      },
    },
  });

  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const novel = chapter.novel;
  const characterInfo = novel.characters.map((c) => {
    return `${c.name}：${c.identity || c.role || "未设定"}`;
  }).join("\n");

  // 获取当前卷
  const currentVolume = novel.volumes.find(v => {
    const chapters = novel.chapterOutlines.filter(co => co.volumeId === v.id);
    return chapters.some(co => co.sortOrder === chapter.order);
  });

  // 获取前几章的章纲
  const prevOutlines = novel.chapterOutlines
    .filter(co => co.sortOrder < chapter.order)
    .slice(-3)
    .map(co => `第${co.sortOrder}章 ${co.title}：${co.goal}`)
    .join("\n");

  const mainlineInfo = novel.mainlines.map((m, i) => `${i + 1}. ${m.title}`).join("\n");

  const prompt = `你是一位专业的网文大纲设计师。请为以下章节设计详细的章纲。

【小说信息】
书名：${novel.title}
类型：${novel.genre || "未指定"}

【当前卷】
${currentVolume ? `${currentVolume.title}：${currentVolume.goal}` : "第一卷"}

【章节信息】
章节序号：第${chapter.order}章
章节标题：${chapter.title || `第${chapter.order}章`}

【人物设定】
${characterInfo || "暂无"}

【故事主线】
${mainlineInfo || "暂无"}

【前几章概要】
${prevOutlines || "这是第一章"}

请生成详细的章纲，包含：
1. 章节目标（本章要完成什么）
2. 核心冲突（本章的主要矛盾）
3. 情绪曲线（开头→发展→高潮→结尾的情绪变化）
4. 场景设计（2-3个主要场景）
5. 人物互动（哪些人物出场，如何互动）
6. 爽点设计（本章的爽点在哪里）
7. 章末钩子（让读者想看下一章）

要求：
- 目标字数：2000-2500字
- 节奏要紧凑，不要写太散
- 必须有明确的爽点和钩子

请用JSON格式输出：
{
  "title": "章节标题",
  "goal": "章节目标",
  "conflict": "核心冲突",
  "emotion_arc": "情绪曲线",
  "scenes": ["场景1", "场景2"],
  "character_interactions": "人物互动",
  "pleasure_point": "爽点设计",
  "hook": "章末钩子",
  "word_count_target": 2000
}`;

  const result = await llmService.completeText({
    system: "你是一位专业的网文大纲设计师，擅长设计节奏紧凑、爽点密集的章节结构。",
    prompt,
    temperature: 0.7,
    maxTokens: 1500,
  });

  return result || "生成失败，请重试。";
}

export async function* generateChapterContentStream(input: {
  novelId: string;
  chapterId: string;
}): AsyncGenerator<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    include: {
      novel: {
        include: {
          characters: true,
          chapterOutlines: {
            orderBy: { sortOrder: "asc" },
            take: 5,
          },
          worldviews: { take: 1 },
          mainlines: true,
          styleProfiles: { where: { isDefault: true }, take: 1 },
          assets: { where: { category: "book_analysis" }, take: 1 },
        },
      },
    },
  });

  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const novel = chapter.novel;
  const characterInfo = novel.characters.map((c: any) => {
    return `${c.name}：${c.identity || c.role || "未设定"}，${c.motivation || "动机未知"}`;
  }).join("\n");

  const { getCompressedMemoryContext } = await import("./MemoryCompressionService");
  const memoryContext = await getCompressedMemoryContext(input.novelId, chapter.order);

  const chapterOutline = novel.chapterOutlines.find((co: any) => co.sortOrder === chapter.order);

  const storyContext = await buildStoryContext(input.novelId);

  const worldview = novel.worldviews[0];
  const worldviewInfo = worldview ? `
【世界观】${worldview.name}
概述：${worldview.summary || ""}
规则：${worldview.rules || ""}
地理：${worldview.geography || ""}
势力：${worldview.factions || ""}
` : "";

  const mainlineInfo = novel.mainlines.length > 0 ? `
【故事主线】
${novel.mainlines.map((m: any, i: number) => `${i + 1}. ${m.title}：${m.description || ""}`).join("\n")}
` : "";

  const styleInfo = novel.styleProfiles[0] ? `
【写作风格】${novel.styleProfiles[0].name}
描述：${novel.styleProfiles[0].description || ""}
叙事视角：${novel.styleProfiles[0].narrativePov}
节奏：${novel.styleProfiles[0].pacing}
句子长度：${novel.styleProfiles[0].sentenceLength}
对话比例：${novel.styleProfiles[0].dialogueRatio}
` : "";

  const analysisInfo = novel.assets[0] ? `
【仿写参考】
${novel.assets[0].content?.substring(0, 1000) || ""}
` : "";

  const outlineInfo = chapterOutline ? `
【章纲】
- 目标：${chapterOutline.goal || "推进剧情"}
- 冲突：${chapterOutline.conflict || "未设定"}
- 情绪：${chapterOutline.emotion || "未设定"}
- 钩子：${chapterOutline.hook || "未设定"}
- 伏笔：${chapterOutline.foreshadowing || "无"}
- 爽点：${chapterOutline.pleasurePoint || "未设定"}
` : "";

  const prompt = [
    "你是一位专业的中文网络小说作家，风格细腻，擅长写对话和场景。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || "未指定"}`,
    "",
    worldviewInfo,
    mainlineInfo,
    styleInfo,
    "当前章节：",
    `- 章节名：${chapter.title}`,
    outlineInfo,
    "",
    "角色设定：",
    characterInfo || "暂无",
    "",
    "重要记忆：",
    memoryContext || "暂无",
    "",
    "剧情状态：",
    storyContext || "暂无",
    analysisInfo,
    "",
    chapter.content ? `已有正文，请续写：\n${chapter.content}` : "请开始写作。",
    "",
    "要求：",
    "1. 严格按照章纲写作，不要偏离",
    "2. 保持人设一致性",
    "3. 多用短句和对话，增强可读性",
    "4. 控制节奏，紧凑有力",
    "5. 章末必须有钩子",
    "6. 去除 AI 味，让文字更有烟火气",
    "7. 目标字数：2000-2500字，不要写太长",
    "",
    "请生成正文。",
  ].join("\n");

  yield* llmService.streamText({
    system: "你是克制、细腻、重视叙事推进的中文小说写作助手。你的文字有烟火气，擅长写对话和场景，避免 AI 味的套路化表达。",
    prompt,
    temperature: 0.8,
    maxTokens: 4000,
  });
}

export async function generateChapterContent(input: {
  novelId: string;
  chapterId: string;
}): Promise<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    include: {
      novel: {
        include: {
          characters: true,
          chapterOutlines: {
            orderBy: { sortOrder: "asc" },
            take: 5,
          },
          worldviews: { take: 1 },
          mainlines: true,
          styleProfiles: { where: { isDefault: true }, take: 1 },
          assets: { where: { category: "book_analysis" }, take: 1 },
        },
      },
    },
  });

  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const novel = chapter.novel;
  const characterInfo = novel.characters.map((c: any) => {
    return `${c.name}：${c.identity || c.role || "未设定"}，${c.motivation || "动机未知"}`;
  }).join("\n");

  // 使用压缩记忆服务获取记忆上下文
  const { getCompressedMemoryContext } = await import("./MemoryCompressionService");
  const memoryContext = await getCompressedMemoryContext(input.novelId, chapter.order);

  const chapterOutline = novel.chapterOutlines.find((co: any) => co.sortOrder === chapter.order);

  // 获取剧情状态机上下文
  const storyContext = await buildStoryContext(input.novelId);

  // 获取世界观信息
  const worldview = novel.worldviews[0];
  const worldviewInfo = worldview ? `
【世界观】${worldview.name}
概述：${worldview.summary || ""}
规则：${worldview.rules || ""}
地理：${worldview.geography || ""}
势力：${worldview.factions || ""}
` : "";

  // 获取主线信息
  const mainlineInfo = novel.mainlines.length > 0 ? `
【故事主线】
${novel.mainlines.map((m: any, i: number) => `${i + 1}. ${m.title}：${m.description || ""}`).join("\n")}
` : "";

  // 获取风格信息
  const styleInfo = novel.styleProfiles[0] ? `
【写作风格】${novel.styleProfiles[0].name}
描述：${novel.styleProfiles[0].description || ""}
叙事视角：${novel.styleProfiles[0].narrativePov}
节奏：${novel.styleProfiles[0].pacing}
句子长度：${novel.styleProfiles[0].sentenceLength}
对话比例：${novel.styleProfiles[0].dialogueRatio}
` : "";

  // 获取拆书分析结果
  const analysisInfo = novel.assets[0] ? `
【仿写参考】
${novel.assets[0].content?.substring(0, 1000) || ""}
` : "";

  // 获取章纲信息
  const outlineInfo = chapterOutline ? `
【章纲】
- 目标：${chapterOutline.goal || "推进剧情"}
- 冲突：${chapterOutline.conflict || "未设定"}
- 情绪：${chapterOutline.emotion || "未设定"}
- 钩子：${chapterOutline.hook || "未设定"}
- 伏笔：${chapterOutline.foreshadowing || "无"}
- 爽点：${chapterOutline.pleasurePoint || "未设定"}
` : "";

  const prompt = [
    "你是一位专业的中文网络小说作家，风格细腻，擅长写对话和场景。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || "未指定"}`,
    "",
    worldviewInfo,
    mainlineInfo,
    styleInfo,
    "当前章节：",
    `- 章节名：${chapter.title}`,
    outlineInfo,
    "",
    "角色设定：",
    characterInfo || "暂无",
    "",
    "重要记忆：",
    memoryContext || "暂无",
    "",
    "剧情状态：",
    storyContext || "暂无",
    analysisInfo,
    "",
    chapter.content ? `已有正文，请续写：\n${chapter.content}` : "请开始写作。",
    "",
    "要求：",
    "1. 严格按照章纲写作，不要偏离",
    "2. 保持人设一致性",
    "3. 多用短句和对话，增强可读性",
    "4. 控制节奏，紧凑有力",
    "5. 章末必须有钩子",
    "6. 去除 AI 味，让文字更有烟火气",
    "7. 目标字数：2000-2500字，不要写太长",
    "",
    "请生成正文。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是克制、细腻、重视叙事推进的中文小说写作助手。你的文字有烟火气，擅长写对话和场景，避免 AI 味的套路化表达。",
    prompt,
    temperature: 0.8,
    maxTokens: 4000,
  });

  return result || "生成失败，请重试。";
}

export async function checkConsistency(input: {
  novelId: string;
  chapterId: string;
}): Promise<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    include: {
      novel: {
        include: {
          characters: true,
          memories: {
            where: { type: { in: ["world", "character", "foreshadow"] } },
            orderBy: { importance: "desc" },
            take: 30,
          },
        },
      },
    },
  });

  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const novel = chapter.novel;
  const characterInfo = novel.characters.map((c) => {
    return `${c.name}：${c.identity || c.role || "未设定"}，${c.background || ""}`;
  }).join("\n");

  const memoryContext = novel.memories.map((m) => `[${m.type}] ${m.title}: ${m.content}`).join("\n");

  const prompt = [
    "你是一位严格的小说编辑，负责检查长篇小说的一致性。",
    "",
    "小说信息：",
    `- 书名：${novel.title}`,
    `- 类型：${novel.genre || "未指定"}`,
    "",
    "角色设定：",
    characterInfo || "暂无",
    "",
    "世界观和伏笔记忆：",
    memoryContext || "暂无",
    "",
    "待检查章节：",
    chapter.content || "章节内容为空",
    "",
    "请检查以下内容：",
    "1. 战力系统是否崩坏",
    "2. 角色行为是否符合人设",
    "3. 世界观是否自洽",
    "4. 时间线是否正确",
    "5. 伏笔是否遗忘",
    "",
    "请用 JSON 格式输出检查结果。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位严格的小说编辑，擅长发现长篇小说中的一致性问题。",
    prompt,
    temperature: 0.3,
    maxTokens: 2000,
  });

  return result || "校验失败，请重试。";
}

/**
 * AI生成主线
 */
export async function generateMainlines(input: {
  novelId: string;
  count?: number;
}): Promise<any[]> {
  const novel = await prisma.novel.findUnique({
    where: { id: input.novelId },
    include: {
      characters: true,
      worldviews: { take: 1 },
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const characterInfo = novel.characters.map((c) => `${c.name}(${c.role || "未定"})`).join("、");
  const worldviewInfo = novel.worldviews[0] ? `${novel.worldviews[0].name}: ${novel.worldviews[0].summary || ""}` : "";
  const count = input.count || 4;

  const prompt = `你是一位专业的网文主线设计师。请为以下小说设计${count}条主线。

【小说信息】
书名：${novel.title}
类型：${novel.genre || "未指定"}
灵感：${novel.inspiration || "未填写"}

【世界观】
${worldviewInfo || "暂无"}

【人物设定】
${characterInfo || "暂无"}

请设计${count}条主线，包含：
1. 主线名称
2. 主线类型（main=主线/sub=支线/emotional=感情线/mystery=谜团线）
3. 主线描述
4. 起始章节
5. 结束章节
6. 关键节点（3-5个）
7. 结局走向

要求：
- 主线要相互交织，形成完整的故事网络
- 主线要与世界观和人物设定紧密结合
- 每条主线都要有明确的起承转合

请用JSON数组格式输出：
[
  {
    "title": "主线名称",
    "type": "main",
    "description": "主线描述",
    "startChapter": 1,
    "endChapter": 50,
    "milestones": ["节点1", "节点2", "节点3"],
    "resolution": "结局走向"
  }
]`;

  const result = await llmService.completeText({
    system: "你是一位专业的网文主线设计师，擅长设计交织复杂的故事网络。",
    prompt,
    temperature: 0.7,
    maxTokens: 2000,
  });

  if (!result) {
    throw new Error("主线生成失败");
  }

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("无法解析主线JSON");
  } catch (e) {
    console.error("主线解析失败:", e);
    throw new Error("主线解析失败，请重试");
  }
}

/**
 * AI批量生成钩子
 */
export async function generateHooks(input: {
  novelId: string;
  chapterCount?: number;
}): Promise<any[]> {
  const novel = await prisma.novel.findUnique({
    where: { id: input.novelId },
    include: {
      characters: true,
      mainlines: true,
      chapterOutlines: { orderBy: { sortOrder: "asc" }, take: input.chapterCount || 10 },
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const characterInfo = novel.characters.map((c) => `${c.name}(${c.role || "未定"})`).join("、");
  const mainlineInfo = novel.mainlines.map((m) => `${m.title}: ${m.description || ""}`).join("\n");
  const chapterInfo = novel.chapterOutlines.map((c) => `第${c.sortOrder}章 ${c.title}: ${c.goal || ""}`).join("\n");
  const chapterCount = input.chapterCount || 10;

  const prompt = `你是一位专业的网文钩子设计师。请为以下小说的前${chapterCount}章设计钩子。

【小说信息】
书名：${novel.title}
类型：${novel.genre || "未指定"}

【人物设定】
${characterInfo || "暂无"}

【主线】
${mainlineInfo || "暂无"}

【章节概要】
${chapterInfo || "暂无"}

请为每章设计1-2个钩子，包含：
1. 钩子标题
2. 钩子描述
3. 钩子类型（suspense=悬念/foreshadow=伏笔/cliffhanger=悬念/mystery=谜团/reversal=反转/power_up=升级/romance=感情线）
4. 强度（1-10）
5. 计划在第几章使用
6. 计划在第几章揭示

要求：
- 钩子要与剧情紧密结合
- 钩子要能有效吸引读者
- 钩子之间要有呼应和关联

请用JSON数组格式输出：
[
  {
    "title": "钩子标题",
    "description": "钩子描述",
    "type": "suspense",
    "intensity": 7,
    "plannedChapter": 1,
    "resolvedChapter": 5
  }
]`;

  const result = await llmService.completeText({
    system: "你是一位专业的网文钩子设计师，擅长设计吸引读者的悬念和伏笔。",
    prompt,
    temperature: 0.7,
    maxTokens: 3000,
  });

  if (!result) {
    throw new Error("钩子生成失败");
  }

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("无法解析钩子JSON");
  } catch (e) {
    console.error("钩子解析失败:", e);
    throw new Error("钩子解析失败，请重试");
  }
}

/**
 * AI学习风格
 */
export async function extractStyleFromText(input: {
  novelId: string;
  text: string;
}): Promise<any> {
  const prompt = `你是一位专业的文风分析师。请分析以下文本的写作风格。

【文本内容】
${input.text.substring(0, 3000)}

请分析以下维度：
1. 叙事视角（第一人称/第三人称/混合）
2. 时态（过去时/现在时）
3. 节奏（慢/平衡/快）
4. 句子长度（短句/中等/长句/混合）
5. 词汇风格（现代/古典/混合）
6. 对话比例（低/平衡/高）
7. 情感强度（低/中/高）
8. 幽默程度（无/低/中/高）
9. 特殊技巧（如：多用短句、多用对话、感官描写等）
10. 风格特征总结

请用JSON格式输出：
{
  "name": "风格名称",
  "description": "风格描述",
  "narrativePov": "third_person",
  "tense": "past",
  "pacing": "balanced",
  "sentenceLength": "mixed",
  "vocabulary": "modern",
  "dialogueRatio": "balanced",
  "emotionIntensity": "medium",
  "humorLevel": "low",
  "specialTechniques": ["技巧1", "技巧2"],
  "summary": "风格特征总结"
}`;

  const result = await llmService.completeText({
    system: "你是一位专业的文风分析师，擅长识别和总结写作风格特征。",
    prompt,
    temperature: 0.5,
    maxTokens: 1000,
  });

  if (!result) {
    throw new Error("风格分析失败");
  }

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("无法解析风格JSON");
  } catch (e) {
    console.error("风格解析失败:", e);
    throw new Error("风格解析失败，请重试");
  }
}
