import { LlmInvokeService } from "./llm/LlmInvokeService";
import { prisma } from "../db/prisma";
import { buildStoryContext, updateStoryState, recordPleasurePoint, recordEmotionCurve } from "./StoryStateService";
import { getCompressedMemoryContext, autoManageMemories } from "./MemoryCompressionService";
import { generateStyledContent } from "./StyleService";

const llmService = new LlmInvokeService();

// 自动生成全书配置
interface AutoGenerateConfig {
  volumeCount: number;
  chaptersPerVolume: number;
  targetWordCount: number;
  autoReview: boolean;
  autoRepair: boolean;
  pauseOnIssue: boolean;
}

const DEFAULT_CONFIG: AutoGenerateConfig = {
  volumeCount: 3,
  chaptersPerVolume: 10,
  targetWordCount: 2000,
  autoReview: true,
  autoRepair: true,
  pauseOnIssue: true,
};

// 自动生成状态
interface AutoGenerateStatus {
  novelId: string;
  status: "idle" | "running" | "paused" | "completed" | "error";
  currentVolume: number;
  currentChapter: number;
  totalChapters: number;
  completedChapters: number;
  errors: Array<{ chapter: number; error: string }>;
  startTime: Date;
  lastUpdateTime: Date;
}

// 全局状态存储
const autoGenerateStatuses = new Map<string, AutoGenerateStatus>();

// 自动生成全书
export async function startAutoGenerate(
  novelId: string,
  config: Partial<AutoGenerateConfig> = {}
): Promise<AutoGenerateStatus> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // 检查小说是否存在
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      volumes: true,
      chapters: true,
    },
  });

  if (!novel) {
    throw new Error("小说不存在。");
  }

  // 初始化状态
  const status: AutoGenerateStatus = {
    novelId,
    status: "running",
    currentVolume: 1,
    currentChapter: 1,
    totalChapters: fullConfig.volumeCount * fullConfig.chaptersPerVolume,
    completedChapters: novel.chapters.length,
    errors: [],
    startTime: new Date(),
    lastUpdateTime: new Date(),
  };

  autoGenerateStatuses.set(novelId, status);

  // 异步执行生成
  executeAutoGenerate(novelId, fullConfig).catch((error) => {
    const currentStatus = autoGenerateStatuses.get(novelId);
    if (currentStatus) {
      currentStatus.status = "error";
      currentStatus.errors.push({
        chapter: currentStatus.currentChapter,
        error: error.message,
      });
    }
  });

  return status;
}

// 执行自动生成
async function executeAutoGenerate(novelId: string, config: AutoGenerateConfig) {
  const status = autoGenerateStatuses.get(novelId);
  if (!status) return;

  try {
    // 1. 生成卷纲
    if (status.currentVolume === 1 && status.currentChapter === 1) {
      await generateVolumesForNovel(novelId, config.volumeCount);
    }

    // 2. 逐章生成
    for (let vol = status.currentVolume; vol <= config.volumeCount; vol++) {
      status.currentVolume = vol;
      
      const volume = await prisma.volume.findFirst({
        where: { novelId, sortOrder: vol },
      });

      if (!volume) {
        throw new Error(`第${vol}卷不存在。`);
      }

      // 生成章纲
      await generateChapterOutlinesForVolume(volume.id, novelId, config.chaptersPerVolume);

      // 逐章生成正文
      for (let chap = 1; chap <= config.chaptersPerVolume; chap++) {
        status.currentChapter = chap;
        status.lastUpdateTime = new Date();

        // 检查是否暂停
        if (status.status === "paused") {
          return;
        }

        // 生成章节
        await generateSingleChapter(novelId, volume.id, vol, chap, config);

        status.completedChapters++;

        // 自动管理记忆
        await autoManageMemories(novelId, (vol - 1) * config.chaptersPerVolume + chap);

        // 更新剧情状态
        await updateStoryState(novelId, {
          currentVolume: vol,
          currentChapter: (vol - 1) * config.chaptersPerVolume + chap,
        });
      }
    }

    status.status = "completed";
  } catch (error) {
    status.status = "error";
    status.errors.push({
      chapter: status.currentChapter,
      error: error instanceof Error ? error.message : "未知错误",
    });
    throw error;
  }
}

// 生成卷纲
async function generateVolumesForNovel(novelId: string, volumeCount: number) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
  });

  if (!novel) return;

  // 使用 AI 生成卷纲
  const prompt = [
    `请为小说《${novel.title}》生成 ${volumeCount} 卷的卷纲。`,
    `- 类型：${novel.genre || "未指定"}`,
    `- 灵感：${novel.inspiration || "未指定"}`,
    "",
    "每卷需要包含：卷名、目标、冲突、情绪基调、新地图、结尾钩子。",
    "",
    "请用 JSON 数组格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位专业的小说卷纲规划师。",
    prompt,
    temperature: 0.7,
    maxTokens: 2000,
  });

  // 解析并保存卷纲
  try {
    const volumes = JSON.parse(result || "[]");
    for (let i = 0; i < volumes.length; i++) {
      await prisma.volume.create({
        data: {
          novelId,
          sortOrder: i + 1,
          title: volumes[i].卷名 || volumes[i].title || `第${i + 1}卷`,
          goal: volumes[i].本卷目标 || volumes[i].goal || "",
          conflict: volumes[i].主要冲突 || volumes[i].conflict || "",
          emotion: volumes[i].情绪基调 || volumes[i].emotion || "",
          mapName: volumes[i].新地图 || volumes[i].mapName || "",
          endHook: volumes[i].结尾钩子 || volumes[i].endHook || "",
        },
      });
    }
  } catch (error) {
    console.error("卷纲解析失败:", error);
  }
}

// 生成章纲
async function generateChapterOutlinesForVolume(volumeId: string, novelId: string, chapterCount: number) {
  const volume = await prisma.volume.findUnique({
    where: { id: volumeId },
  });

  if (!volume) return;

  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
  });

  if (!novel) return;

  const storyContext = await buildStoryContext(novelId);

  const prompt = [
    `请为小说《${novel.title}》的"${volume.title}"生成 ${chapterCount} 个章纲。`,
    `- 卷目标：${volume.goal}`,
    `- 卷冲突：${volume.conflict}`,
    `- 情绪基调：${volume.emotion}`,
    "",
    "剧情状态：",
    storyContext,
    "",
    "每章需要包含：章节名、目标、冲突、情绪、爽点、钩子。",
    "",
    "请用 JSON 数组格式输出。",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是一位专业的小说章纲规划师。",
    prompt,
    temperature: 0.7,
    maxTokens: 3000,
  });

  // 解析并保存章纲
  try {
    const chapters = JSON.parse(result || "[]");
    for (let i = 0; i < chapters.length; i++) {
      await prisma.chapterOutline.create({
        data: {
          volumeId,
          novelId,
          sortOrder: i + 1,
          title: chapters[i].章节名 || chapters[i].title || `第${i + 1}章`,
          goal: chapters[i].目标 || chapters[i].goal || "",
          conflict: chapters[i].冲突 || chapters[i].conflict || "",
          emotion: chapters[i].情绪 || chapters[i].emotion || "",
          pleasurePoint: chapters[i].爽点 || chapters[i].pleasurePoint || "",
          hook: chapters[i].钩子 || chapters[i].hook || "",
        },
      });
    }
  } catch (error) {
    console.error("章纲解析失败:", error);
  }
}

// 生成单个章节
async function generateSingleChapter(
  novelId: string,
  volumeId: string,
  volumeOrder: number,
  chapterOrder: number,
  config: AutoGenerateConfig
) {
  // 获取或创建章节
  let chapter = await prisma.chapter.findFirst({
    where: {
      novelId,
      order: (volumeOrder - 1) * config.chaptersPerVolume + chapterOrder,
    },
  });

  if (!chapter) {
    // 获取章纲
    const outline = await prisma.chapterOutline.findFirst({
      where: {
        volumeId,
        sortOrder: chapterOrder,
      },
    });

    // 创建章节
    chapter = await prisma.chapter.create({
      data: {
        novelId,
        order: (volumeOrder - 1) * config.chaptersPerVolume + chapterOrder,
        title: outline?.title || `第${(volumeOrder - 1) * config.chaptersPerVolume + chapterOrder}章`,
        summary: outline?.goal || "",
        status: "planned",
      },
    });
  }

  // 生成正文
  const content = await generateChapterWithAI(novelId, chapter.id, config.targetWordCount);

  // 更新章节
  await prisma.chapter.update({
    where: { id: chapter.id },
    data: {
      content,
      wordCount: content.replace(/\s/g, "").length,
      status: "drafted",
    },
  });

  // 去 AI 味处理
  if (content) {
    const styled = await generateStyledContent(content, novelId);
    await prisma.chapter.update({
      where: { id: chapter.id },
      data: { content: styled },
    });
  }

  return chapter;
}

// 使用 AI 生成章节内容
async function generateChapterWithAI(
  novelId: string,
  chapterId: string,
  targetWordCount: number
): Promise<string> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      novel: {
        include: {
          characters: true,
        },
      },
    },
  });

  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const storyContext = await buildStoryContext(novelId);
  const memoryContext = await getCompressedMemoryContext(novelId, chapter.order);

  const prompt = [
    "你是一位专业的中文网络小说作家。",
    "",
    `小说：${chapter.novel.title}`,
    `章节：${chapter.title}`,
    `目标：${chapter.summary || "推进剧情"}`,
    "",
    "剧情状态：",
    storyContext,
    "",
    "记忆上下文：",
    memoryContext,
    "",
    `请生成 ${targetWordCount} 字左右的正文。`,
    "",
    "要求：",
    "1. 严格按照剧情状态写作",
    "2. 保持人设一致性",
    "3. 多用短句和对话",
    "4. 控制节奏",
    "5. 章末留钩子",
  ].join("\n");

  const result = await llmService.completeText({
    system: "你是克制、细腻、重视叙事推进的中文小说写作助手。",
    prompt,
    temperature: 0.8,
    maxTokens: 4000,
  });

  return result || "";
}

// 获取自动生成状态
export function getAutoGenerateStatus(novelId: string): AutoGenerateStatus | null {
  return autoGenerateStatuses.get(novelId) || null;
}

// 暂停自动生成
export function pauseAutoGenerate(novelId: string): boolean {
  const status = autoGenerateStatuses.get(novelId);
  if (status && status.status === "running") {
    status.status = "paused";
    return true;
  }
  return false;
}

// 恢复自动生成
export function resumeAutoGenerate(novelId: string): boolean {
  const status = autoGenerateStatuses.get(novelId);
  if (status && status.status === "paused") {
    status.status = "running";
    // 重新执行
    executeAutoGenerate(novelId, DEFAULT_CONFIG).catch(() => {});
    return true;
  }
  return false;
}

// 停止自动生成
export function stopAutoGenerate(novelId: string): boolean {
  const status = autoGenerateStatuses.get(novelId);
  if (status) {
    status.status = "idle";
    autoGenerateStatuses.delete(novelId);
    return true;
  }
  return false;
}
