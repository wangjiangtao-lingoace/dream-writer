import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";

const llmService = new LlmInvokeService();

export interface AnalysisSections {
  overview?: string;
  plot_structure?: string;
  timeline?: string;
  character_system?: string;
  worldbuilding?: string;
  themes?: string;
  style_technique?: string;
  market_highlights?: string;
}

export interface ExtractedData {
  // 源作品信息
  source: {
    title: string;
    genre: string;
    synopsis: string;
    outline: string;
    protagonists: string[];  // 主角
    antagonists: string[];   // 配角/反派
    storylines: string[];    // 故事线
    highlights: string[];    // 亮点
  };
  // 新作品信息
  title: string;
  genre: string;
  synopsis: string;
  outline: string;
  protagonists: { name: string; role: string; description: string }[];
  antagonists: { name: string; role: string; description: string }[];
  storylines: string[];
  worldview: {
    name: string;
    summary: string;
    rules: string;
    geography: string;
    factions: string;
    history: string;
  };
  characters: {
    name: string;
    role: string;
    identity: string;
    motivation: string;
    appearance: string;
    background: string;
    relationsText: string;
  }[];
  mainlines: {
    title: string;
    description: string;
  }[];
  hooks: {
    title: string;
    description: string;
    type: string;
    intensity: number;
  }[];
  volumes: {
    title: string;
    goal: string;
    conflict: string;
    emotion: string;
    mapName: string;
    endHook: string;
  }[];
  style: {
    name: string;
    description: string;
    narrativePov: string;
    tense: string;
    pacing: string;
    sentenceLength: string;
    vocabulary: string;
    dialogueRatio: string;
    emotionIntensity: string;
    humorLevel: string;
  };
}

export class AnalysisToNovelService {
  /**
   * 从拆书结果中提取结构化数据
   */
  async extractDataFromAnalysis(sections: AnalysisSections): Promise<ExtractedData> {
    const prompt = `你是一位资深网文策划师。请从以下拆书分析结果中提取结构化数据，用于创建新作品。

【拆书总览】
${sections.overview || "无"}

【剧情结构】
${sections.plot_structure || "无"}

【人物系统】
${sections.character_system || "无"}

【世界观与设定】
${sections.worldbuilding || "无"}

【主题表达】
${sections.themes || "无"}

【文风与技法】
${sections.style_technique || "无"}

【商业化卖点】
${sections.market_highlights || "无"}

请提取并返回JSON格式的结构化数据：
{
  "source": {
    "title": "源作品名称",
    "genre": "源作品类型",
    "synopsis": "源作品简介（50-100字）",
    "outline": "源作品大纲（100-150字）",
    "protagonists": ["主角1简介", "主角2简介"],
    "antagonists": ["配角/反派1简介", "配角/反派2简介"],
    "storylines": ["故事线1", "故事线2"],
    "highlights": ["亮点1", "亮点2"]
  },
  "title": "基于拆书结果生成的新作品名称（要有吸引力，符合网文风格）",
  "genre": "作品类型（如：古言、仙侠、都市等）",
  "synopsis": "新作品简介（100-150字，吸引读者）",
  "outline": "新作品故事大纲（200-300字）",
  "protagonists": [
    {"name": "主角名", "role": "主角", "description": "简介"}
  ],
  "antagonists": [
    {"name": "配角名", "role": "配角/反派", "description": "简介"}
  ],
  "storylines": ["故事线1", "故事线2"],
  "worldview": {
    "name": "世界名称",
    "summary": "世界概述",
    "rules": "世界规则",
    "geography": "地理环境",
    "factions": "势力分布",
    "history": "历史背景"
  },
  "characters": [
    {
      "name": "人物名",
      "role": "主角/配角/反派",
      "identity": "身份",
      "motivation": "动机",
      "appearance": "外貌",
      "background": "背景",
      "relationsText": "关系"
    }
  ],
  "mainlines": [
    {
      "title": "主线名称",
      "description": "主线描述"
    }
  ],
  "hooks": [
    {
      "title": "钩子标题",
      "description": "钩子描述",
      "type": "suspense/foreshadow/cliffhanger",
      "intensity": 5
    }
  ],
  "volumes": [
    {
      "title": "卷标题",
      "goal": "本卷目标",
      "conflict": "主要冲突",
      "emotion": "情绪基调",
      "mapName": "主要场景",
      "endHook": "结尾钩子"
    }
  ],
  "style": {
    "name": "风格名称",
    "description": "风格描述",
    "narrativePov": "third_person",
    "tense": "past",
    "pacing": "balanced",
    "sentenceLength": "mixed",
    "vocabulary": "modern",
    "dialogueRatio": "balanced",
    "emotionIntensity": "medium",
    "humorLevel": "low"
  }
}`;

    const result = await llmService.completeText({
      prompt,
      temperature: 0.7,
      maxTokens: 3000,
    });

    console.log("LLM返回结果长度:", result?.length || 0);

    if (!result) {
      console.log("LLM返回null，使用默认数据");
      return this.getDefaultData();
    }

    try {
      const parsed = JSON.parse(result);
      console.log("JSON解析成功，标题:", parsed.title);
      return parsed;
    } catch (e) {
      console.log("JSON解析失败，尝试提取JSON块");
      // 尝试提取JSON块
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          console.log("从代码块提取JSON成功，标题:", parsed.title);
          return parsed;
        } catch (e2) {
          console.log("代码块JSON解析也失败");
        }
      }
      
      // 尝试找到第一个{和最后一个}
      const start = result.indexOf("{");
      const end = result.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        try {
          const parsed = JSON.parse(result.substring(start, end + 1));
          console.log("从花括号提取JSON成功，标题:", parsed.title);
          return parsed;
        } catch (e3) {
          console.log("花括号JSON解析也失败");
        }
      }

      console.log("所有解析方式都失败，使用默认数据");
      return this.getDefaultData();
    }
  }

  /**
   * 将提取的数据保存到数据库
   */
  async saveToNovel(novelId: string, data: ExtractedData): Promise<void> {
    // 1. 更新小说信息（标题、类型、简介、大纲）
    await prisma.novel.update({
      where: { id: novelId },
      data: { 
        title: data.title,
        outline: data.outline,
        inspiration: data.synopsis,
        genre: data.genre,
      },
    });

    // 2. 创建世界观
    const worldview = await prisma.worldview.create({
      data: {
        name: data.worldview.name,
        summary: data.worldview.summary,
        rules: data.worldview.rules,
        geography: data.worldview.geography,
        factions: data.worldview.factions,
        history: data.worldview.history,
      },
    });

    // 世界观已通过novelId关联，无需额外操作

    // 3. 创建人物（去重）
    const existingCharacters = await prisma.character.findMany({
      where: { novelId },
      select: { name: true },
    });
    const existingNames = new Set(existingCharacters.map(c => c.name));

    for (const char of data.characters) {
      // 跳过已存在的人物
      if (existingNames.has(char.name)) {
        continue;
      }
      existingNames.add(char.name);
      
      await prisma.character.create({
        data: {
          novelId,
          name: char.name,
          role: char.role,
          identity: char.identity,
          motivation: char.motivation,
          appearance: char.appearance,
          background: char.background,
          relationsText: char.relationsText,
        },
      });
    }

    // 4. 创建主线
    for (let i = 0; i < data.mainlines.length; i++) {
      await prisma.mainline.create({
        data: {
          novelId,
          title: data.mainlines[i].title,
          description: data.mainlines[i].description,
          sortOrder: i,
        },
      });
    }

    // 5. 创建钩子
    for (const hook of data.hooks) {
      await prisma.hook.create({
        data: {
          novelId,
          title: hook.title,
          description: hook.description,
          type: hook.type,
          intensity: hook.intensity,
        },
      });
    }

    // 6. 创建卷纲
    if (data.volumes && data.volumes.length > 0) {
      for (let i = 0; i < data.volumes.length; i++) {
        const vol = data.volumes[i];
        await prisma.volume.create({
          data: {
            novelId,
            sortOrder: i,
            title: vol.title,
            goal: vol.goal,
            conflict: vol.conflict,
            emotion: vol.emotion,
            mapName: vol.mapName,
            endHook: vol.endHook,
          },
        });
      }
    }

    // 7. 创建风格配置
    await prisma.styleProfile.create({
      data: {
        novelId,
        name: data.style.name,
        description: data.style.description,
        narrativePov: data.style.narrativePov,
        tense: data.style.tense,
        pacing: data.style.pacing,
        sentenceLength: data.style.sentenceLength,
        vocabulary: data.style.vocabulary,
        dialogueRatio: data.style.dialogueRatio,
        emotionIntensity: data.style.emotionIntensity,
        humorLevel: data.style.humorLevel,
        isDefault: true,
      },
    });

    // 8. 保存到知识库
    await prisma.knowledgeAsset.create({
      data: {
        novelId,
        title: `拆书分析结果`,
        category: "book_analysis",
        content: JSON.stringify(data, null, 2),
        tags: "拆书,世界观,人物,主线,风格",
      },
    });
  }

  /**
   * 完整的拆书落库流程
   */
  async processAnalysisToNovel(novelId: string, analysisId: string): Promise<void> {
    // 1. 获取拆书结果
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });

    if (!analysis || analysis.status !== "succeeded") {
      throw new Error("拆书任务不存在或未完成");
    }

    // 2. 整理拆书内容
    const sections: AnalysisSections = {};
    for (const section of analysis.sections) {
      sections[section.sectionKey as keyof AnalysisSections] = section.aiContent || section.editedContent || "";
    }

    // 3. 提取结构化数据
    const extractedData = await this.extractDataFromAnalysis(sections);

    // 4. 保存到数据库
    await this.saveToNovel(novelId, extractedData);

    // 5. 更新拆书任务状态
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: { 
        status: "succeeded",
        currentStage: "done",
        currentItemLabel: "已落库到作品",
      },
    });
  }

  /**
   * 获取默认数据
   */
  private getDefaultData(): ExtractedData {
    return {
      source: {
        title: "源作品",
        genre: "待定",
        synopsis: "源作品简介",
        outline: "源作品大纲",
        protagonists: ["主角"],
        antagonists: ["配角"],
        storylines: ["主线"],
        highlights: ["亮点"],
      },
      title: "新作品",
      genre: "待定",
      synopsis: "一个精彩的故事等待展开。",
      outline: "一个普通人意外获得特殊能力，在都市中展开冒险的故事。",
      protagonists: [{ name: "主角", role: "主角", description: "故事主角" }],
      antagonists: [{ name: "配角", role: "配角", description: "故事配角" }],
      storylines: ["成长主线"],
      worldview: {
        name: "现代都市",
        summary: "表面平静的现代都市，暗藏着超自然力量",
        rules: "超能力者隐藏在普通人中，有自己的规则和组织",
        geography: "现代城市，但存在隐藏的超自然空间",
        factions: "普通人类、超能力者、神秘组织",
        history: "超自然力量一直存在，但被少数人掌控和隐藏",
      },
      characters: [
        {
          name: "主角",
          role: "主角",
          identity: "普通上班族",
          motivation: "保护家人，探索真相",
          appearance: "普通外表，但眼神坚定",
          background: "普通家庭，意外获得能力",
          relationsText: "有家人和朋友需要保护",
        },
      ],
      mainlines: [
        {
          title: "成长主线",
          description: "从普通人成长为有能力保护他人的强者",
        },
      ],
      hooks: [
        {
          title: "神秘能力觉醒",
          description: "主角意外获得神秘能力",
          type: "suspense",
          intensity: 7,
        },
      ],
      volumes: [
        {
          title: "第一卷：觉醒",
          goal: "主角发现并适应新能力",
          conflict: "来自敌对势力的威胁",
          emotion: "紧张与兴奋",
          mapName: "现代都市",
          endHook: "更大的危机即将来临",
        },
      ],
      style: {
        name: "都市爽文",
        description: "节奏明快，爽点密集的都市风格",
        narrativePov: "third_person",
        tense: "past",
        pacing: "fast",
        sentenceLength: "short",
        vocabulary: "modern",
        dialogueRatio: "high",
        emotionIntensity: "high",
        humorLevel: "medium",
      },
    };
  }
}

export const analysisToNovelService = new AnalysisToNovelService();
