import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { parseLlmJson } from "../utils/parseJson";

const llmService = new LlmInvokeService();

// ─── 类型定义 ───

interface ExtractedCharacter {
  name: string;
  role?: string;
  identity?: string;
  motivation?: string;
  appearance?: string;
  background?: string;
  relationsText?: string;
}

interface ExtractedWorldview {
  name: string;
  summary?: string;
  rules?: string;
  geography?: string;
  factions?: string;
  powerSystem?: string;
  history?: string;
}

interface ExtractedPlot {
  plotSummary: string;
  outline: string;
  genre?: string;
  mainlines: Array<{ title: string; description: string }>;
  hooks: Array<{ title: string; description: string; type: string }>;
}

interface ExtractedStyle {
  narrativePov?: string;
  tense?: string;
  pacing?: string;
  sentenceLength?: string;
  vocabulary?: string;
  dialogueRatio?: string;
  emotionIntensity?: string;
  humorLevel?: string;
  toneAndAtmosphere?: string;
  emotionalRhythm?: string;
  writingRules?: string[];
  avoidList?: string[];
}

interface ExtractionResult {
  characters: ExtractedCharacter[];
  worldviews: ExtractedWorldview[];
  plot: ExtractedPlot;
  style: ExtractedStyle;
}

interface ChapterInfo {
  order: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface ImportResult {
  novelId: string;
  extraction: ExtractionResult;
  chapters: ChapterInfo[];
}

// ─── 章节拆分 ───

const CHAPTER_PATTERNS = [
  /^第[一二三四五六七八九十百千零\d]+章\s*.*/m,
  /^第[一二三四五六七八九十百千零\d]+节\s*.*/m,
  /^Chapter\s+\d+.*$/im,
  /^章节\s*\d+.*$/m,
  /^【第[一二三四五六七八九十百千零\d]+章】.*/m,
  /^\d+\.\s+.*/m,
];

function splitChapters(text: string): ChapterInfo[] {
  const lines = text.split("\n");
  const chapters: ChapterInfo[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];
  let order = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const isChapterHeader = CHAPTER_PATTERNS.some((p) => p.test(trimmed));

    if (isChapterHeader && currentLines.length > 0) {
      // 保存上一章
      order++;
      const content = currentLines.join("\n").trim();
      chapters.push({
        order,
        title: currentTitle || `第${order}章`,
        content,
        wordCount: content.length,
      });
      currentTitle = trimmed;
      currentLines = [];
    } else if (isChapterHeader && currentLines.length === 0) {
      currentTitle = trimmed;
    } else {
      currentLines.push(line);
    }
  }

  // 保存最后一章
  if (currentLines.length > 0) {
    order++;
    const content = currentLines.join("\n").trim();
    chapters.push({
      order,
      title: currentTitle || `第${order}章`,
      content,
      wordCount: content.length,
    });
  }

  // 如果没有识别到章节，按固定字数切分
  if (chapters.length === 0) {
    return splitByWordCount(text, 4000);
  }

  return chapters;
}

function splitByWordCount(text: string, chunkSize: number): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  let offset = 0;
  let order = 0;

  while (offset < text.length) {
    order++;
    let end = Math.min(offset + chunkSize, text.length);

    // 尝试在句号处断开
    if (end < text.length) {
      const searchStart = Math.max(offset, end - 500);
      const segment = text.slice(searchStart, end);
      const lastPeriod = Math.max(
        segment.lastIndexOf("。"),
        segment.lastIndexOf("！"),
        segment.lastIndexOf("？"),
      );
      if (lastPeriod > 0) {
        end = searchStart + lastPeriod + 1;
      }
    }

    const content = text.slice(offset, end).trim();
    if (content.length > 0) {
      chapters.push({
        order,
        title: `第${order}章`,
        content,
        wordCount: content.length,
      });
    }
    offset = end;
  }

  return chapters;
}

// ─── 文本摘要构建 ───

function buildTextSummary(chapters: ChapterInfo[]): string {
  const parts: string[] = [];

  // 前 8000 字
  const head = chapters
    .map((c) => c.content)
    .join("\n")
    .slice(0, 8000);
  parts.push("【开头部分】\n" + head);

  // 最后 3000 字
  const allContent = chapters.map((c) => c.content).join("\n");
  if (allContent.length > 8000) {
    parts.push("【结尾部分】\n" + allContent.slice(-3000));
  }

  // 每章首尾各 200 字（最多 20 章）
  if (chapters.length > 1) {
    const chapterSummaries = chapters
      .slice(0, 20)
      .map((c) => {
        const head200 = c.content.slice(0, 200);
        const tail200 = c.content.length > 400 ? "..." + c.content.slice(-200) : "";
        return `==${c.title}==\n${head200}${tail200}`;
      })
      .join("\n\n");
    parts.push("【各章摘要】\n" + chapterSummaries);
  }

  return parts.join("\n\n---\n\n");
}

// ─── 并发工具 ───

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index], index) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// ─── LLM 提取 Prompt ───

function buildCharacterPrompt(summary: string, title: string): string {
  return `你是一位专业的小说分析引擎。请从以下小说文本中提取所有出现的人物角色。

要求：
1. 提取所有有名字或明确称呼的角色
2. 主角、反派、重要配角必须提取
3. 龙套角色可以忽略
4. 信息尽量详细，但不要编造原文没有的内容

小说标题：${title}

文本内容：
${summary.slice(0, 12000)}

请输出 JSON 格式：
{
  "characters": [
    {
      "name": "角色名",
      "role": "主角/反派/配角/导师/盟友等",
      "identity": "身份背景",
      "motivation": "核心动机/目标",
      "appearance": "外貌描述",
      "background": "人物经历",
      "relationsText": "与其他角色的关系"
    }
  ]
}

只输出 JSON，不要其他文字。`;
}

function buildWorldviewPrompt(summary: string, title: string): string {
  return `你是一位专业的小说分析引擎。请从以下小说文本中提取世界观设定。

要求：
1. 提取世界的整体设定、规则体系
2. 提取势力、地理、力量体系等
3. 如果是现实背景，提取故事发生的社会环境
4. 不要编造原文没有的设定

小说标题：${title}

文本内容：
${summary.slice(0, 12000)}

请输出 JSON 格式：
{
  "worldviews": [
    {
      "name": "世界观名称（如：修仙世界/现代都市/末日废土）",
      "summary": "整体概述",
      "rules": "世界规则/法则",
      "geography": "地理环境",
      "factions": "势力分布",
      "powerSystem": "力量体系",
      "history": "背景历史"
    }
  ]
}

只输出 JSON，不要其他文字。`;
}

function buildPlotPrompt(summary: string, title: string): string {
  return `你是一位专业的小说分析引擎。请从以下小说文本中梳理已完成的剧情。

要求：
1. 概述已完成的主要剧情线
2. 提取核心卖点和追读钩子
3. 梳理主要故事线（主线、支线）
4. 提取已埋设但未解决的悬念/伏笔

小说标题：${title}

文本内容：
${summary.slice(0, 12000)}

请输出 JSON 格式：
{
  "plotSummary": "已完成剧情的详细概述（300-500字）",
  "outline": "后续可发展的剧情方向概述",
  "genre": "小说类型（如：玄幻/都市/科幻/言情）",
  "mainlines": [
    { "title": "主线名称", "description": "主线描述" }
  ],
  "hooks": [
    { "title": "悬念/钩子标题", "description": "详细描述", "type": "suspense/foreshadow/cliffhanger" }
  ]
}

只输出 JSON，不要其他文字。`;
}

function buildStylePrompt(summary: string, title: string): string {
  return `你是一位专业的小说分析引擎。请从以下小说文本中分析写作风格。

要求：
1. 分析叙事视角、时态、节奏
2. 分析语言特点、对话风格
3. 分析场景描写和情绪渲染方式
4. 提取可复用的写作规则

小说标题：${title}

文本内容：
${summary.slice(0, 12000)}

请输出 JSON 格式：
{
  "narrativePov": "third_omniscient/third_limited/first_person",
  "tense": "past/present",
  "pacing": "fast/balanced/slow",
  "sentenceLength": "short/mixed/long",
  "vocabulary": "modern/classical/mixed",
  "dialogueRatio": "high/balanced/low",
  "emotionIntensity": "high/medium/low",
  "humorLevel": "high/medium/low/none",
  "toneAndAtmosphere": "基调和氛围描述",
  "emotionalRhythm": "情绪节奏描述",
  "writingRules": ["写作规则1", "写作规则2"],
  "avoidList": ["需要避免的写法1", "需要避免的写法2"]
}

只输出 JSON，不要其他文字。`;
}

// ─── 主服务类 ───

export class ImportAnalysisService {
  /**
   * 分析 txt 文本并导入为小说
   */
  async analyzeAndImport(params: {
    text: string;
    title?: string;
    genre?: string;
  }): Promise<ImportResult> {
    const { text, title: inputTitle, genre } = params;

    // Step 1: 章节拆分
    console.log("[ImportAnalysis] 开始章节拆分...");
    const chapters = splitChapters(text);
    console.log(`[ImportAnalysis] 识别到 ${chapters.length} 个章节`);

    if (chapters.length === 0) {
      throw new Error("无法从文本中识别章节内容，请检查文本格式。");
    }

    // Step 2: 构建文本摘要
    const summary = buildTextSummary(chapters);
    const effectiveTitle = inputTitle || chapters[0]?.title || "未命名作品";

    // Step 3: 并发 LLM 提取
    console.log("[ImportAnalysis] 开始 LLM 提取...");
    const extractionTasks = [
      { name: "characters", prompt: buildCharacterPrompt(summary, effectiveTitle) },
      { name: "worldviews", prompt: buildWorldviewPrompt(summary, effectiveTitle) },
      { name: "plot", prompt: buildPlotPrompt(summary, effectiveTitle) },
      { name: "style", prompt: buildStylePrompt(summary, effectiveTitle) },
    ] as const;

    const results = await mapWithConcurrency(
      extractionTasks,
      4,
      async (task) => {
        console.log(`[ImportAnalysis] 提取 ${task.name}...`);
        const result = await llmService.completeText({
          prompt: task.prompt,
          temperature: 0.3,
          maxTokens: 3000,
        });
        return { name: task.name, result };
      },
    );

    // Step 4: 解析结果
    const extraction = this.parseExtraction(results);

    // Step 5: 数据落库
    console.log("[ImportAnalysis] 开始数据落库...");
    const novelId = await this.saveToDatabase(extraction, chapters, effectiveTitle, genre);

    console.log(`[ImportAnalysis] 完成，novelId=${novelId}`);
    return { novelId, extraction, chapters };
  }

  private parseExtraction(
    results: PromiseSettledResult<{ name: string; result: string | null }>[],
  ): ExtractionResult {
    const characters: ExtractedCharacter[] = [];
    const worldviews: ExtractedWorldview[] = [];
    let plot: ExtractedPlot = {
      plotSummary: "",
      outline: "",
      mainlines: [],
      hooks: [],
    };
    let style: ExtractedStyle = {};

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[ImportAnalysis] 提取任务失败:", r.reason);
        continue;
      }

      const { name, result } = r.value;
      if (!result) {
        console.warn(`[ImportAnalysis] ${name} 返回空结果`);
        continue;
      }

      const parsed = parseLlmJson<any>(result);
      if (!parsed) {
        console.warn(`[ImportAnalysis] ${name} JSON 解析失败`);
        continue;
      }

      switch (name) {
        case "characters":
          if (Array.isArray(parsed.characters)) {
            characters.push(...parsed.characters);
          }
          break;
        case "worldviews":
          if (Array.isArray(parsed.worldviews)) {
            worldviews.push(...parsed.worldviews);
          }
          break;
        case "plot":
          plot = {
            plotSummary: parsed.plotSummary || "",
            outline: parsed.outline || "",
            genre: parsed.genre,
            mainlines: Array.isArray(parsed.mainlines) ? parsed.mainlines : [],
            hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
          };
          break;
        case "style":
          style = parsed;
          break;
      }
    }

    return { characters, worldviews, plot, style };
  }

  private async saveToDatabase(
    extraction: ExtractionResult,
    chapters: ChapterInfo[],
    title: string,
    genre?: string,
  ): Promise<string> {
    // 1. 创建 Novel
    const novel = await prisma.novel.create({
      data: {
        title,
        genre: genre || extraction.plot.genre || null,
        inspiration: extraction.plot.plotSummary,
        outline: extraction.plot.outline || extraction.plot.plotSummary,
        status: "drafting",
      },
    });

    const novelId = novel.id;

    // 2. 创建 Character（去重）
    const existingNames = new Set<string>();
    for (const char of extraction.characters) {
      if (!char.name || existingNames.has(char.name)) continue;
      existingNames.add(char.name);
      await prisma.character.create({
        data: {
          novelId,
          name: char.name,
          role: char.role || null,
          identity: char.identity || null,
          motivation: char.motivation || null,
          appearance: char.appearance || null,
          background: char.background || null,
          relationsText: char.relationsText || null,
        },
      });
    }

    // 3. 创建 Worldview
    for (const wv of extraction.worldviews) {
      if (!wv.name) continue;
      await prisma.worldview.create({
        data: {
          novelId,
          name: wv.name,
          summary: wv.summary || null,
          rules: wv.rules || null,
          geography: wv.geography || null,
          factions: wv.factions || null,
          powerSystem: wv.powerSystem || null,
          history: wv.history || null,
        },
      });
    }

    // 4. 创建 StyleProfile
    if (extraction.style && Object.keys(extraction.style).length > 0) {
      const s = extraction.style;
      await prisma.styleProfile.create({
        data: {
          novelId,
          name: `${title} 风格`,
          isDefault: true,
          narrativePov: s.narrativePov || "third_person",
          tense: s.tense || "past",
          pacing: s.pacing || "balanced",
          sentenceLength: s.sentenceLength || "mixed",
          vocabulary: s.vocabulary || "modern",
          dialogueRatio: s.dialogueRatio || "balanced",
          emotionIntensity: s.emotionIntensity || "medium",
          humorLevel: s.humorLevel || "low",
          customRules: JSON.stringify({
            toneAndAtmosphere: s.toneAndAtmosphere,
            emotionalRhythm: s.emotionalRhythm,
            writingRules: s.writingRules,
            avoidList: s.avoidList,
          }),
        },
      });
    }

    // 5. 创建 Chapter（已有章节）
    for (const ch of chapters) {
      await prisma.chapter.create({
        data: {
          novelId,
          order: ch.order,
          title: ch.title,
          content: ch.content,
          wordCount: ch.wordCount,
          status: "drafted",
          source: "import",
        },
      });
    }

    // 6. 创建 Mainline
    for (const ml of extraction.plot.mainlines) {
      if (!ml.title) continue;
      await prisma.mainline.create({
        data: {
          novelId,
          title: ml.title,
          description: ml.description || null,
          type: "main",
          status: "active",
        },
      });
    }

    // 7. 创建 Hook
    for (const hook of extraction.plot.hooks) {
      if (!hook.title) continue;
      await prisma.hook.create({
        data: {
          novelId,
          title: hook.title,
          description: hook.description || null,
          type: hook.type || "suspense",
          intensity: 5,
          status: "active",
        },
      });
    }

    // 8. 创建 KnowledgeAsset（整合提取结果）
    await prisma.knowledgeAsset.create({
      data: {
        novelId,
        title: `${title} - 剧情概述`,
        category: "plot_summary",
        content: extraction.plot.plotSummary,
      },
    });

    // 9. 创建 Memory
    const memoryData = [
      {
        type: "plot",
        category: "剧情",
        title: "已完成剧情概述",
        content: extraction.plot.plotSummary,
        importance: 9,
      },
      ...extraction.characters.slice(0, 8).map((c) => ({
        type: "character",
        category: "人物",
        title: `${c.name}（${c.role || "角色"}）`,
        content: [c.identity, c.motivation, c.background].filter(Boolean).join("；"),
        importance: c.role === "主角" ? 10 : 7,
      })),
      ...extraction.worldviews.slice(0, 3).map((w) => ({
        type: "world",
        category: "世界观",
        title: w.name,
        content: [w.summary, w.rules, w.powerSystem].filter(Boolean).join("；"),
        importance: 8,
      })),
    ];

    for (const mem of memoryData) {
      if (!mem.title || !mem.content) continue;
      await prisma.memory.create({
        data: {
          novelId,
          type: mem.type,
          category: mem.category,
          title: mem.title,
          content: mem.content,
          importance: mem.importance,
        },
      });
    }

    // 10. 创建 StoryState
    const lastChapter = chapters[chapters.length - 1];
    await prisma.storyState.create({
      data: {
        novelId,
        currentVolume: 1,
        currentChapter: lastChapter?.order || 0,
        currentPhase: "continuation",
        currentEmotion: "neutral",
      },
    });

    return novelId;
  }
}
