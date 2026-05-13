import {
  BOOK_ANALYSIS_SECTIONS,
  type BookAnalysisSectionKey,
  type BookAnalysisEvidenceItem,
} from "@dream-writer/shared/types/bookAnalysis";
import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";

export interface CreateBookAnalysisInput {
  title: string;
  sourceTitle?: string;
  sourceText?: string;
  novelId?: string | null;
}

export interface ListBookAnalysesInput {
  novelId?: string | null;
  scope?: "novel" | "global" | "all";
}

const llmService = new LlmInvokeService();

function clipSourceText(text?: string): string {
  return (text || "").trim().slice(0, 12000);
}

function sectionInstruction(key: BookAnalysisSectionKey, title: string): string {
  const instructions: Record<BookAnalysisSectionKey, string> = {
    overview: "提炼作品定位、核心卖点、读者期待、最值得学习的结构经验。",
    plot_structure: "拆解开端、冲突升级、关键转折、阶段目标、章节钩子和爽点兑现。",
    timeline: "按事件顺序梳理故事推进，并标出因果链、伏笔和回收节点。",
    character_system: "分析主角、配角、反派、关系张力、人物欲望和成长变化。",
    worldbuilding: "拆解世界规则、势力、资源、地图、限制条件，以及这些设定如何服务剧情。",
    themes: "提炼主题、价值冲突、情绪底色和读者共鸣点。",
    style_technique: "分析语言风格、叙事视角、节奏控制、场景写法、对白和反 AI 套话经验。",
    market_highlights: "拆解商业化卖点、追读钩子、题材标签、差异化和可迁移模板。",
  };
  return `请完成「${title}」分区：${instructions[key]}`;
}

function buildPrompt(input: CreateBookAnalysisInput, key: BookAnalysisSectionKey, title: string): string {
  return [
    "你是 Dream Writer 的拆书分析引擎。请基于给定原文做结构化拆书，不要泛泛而谈。",
    "输出格式要求：",
    "1. 用 Markdown。",
    "2. 先给 3-5 条结论。",
    "3. 再给可迁移到新作品的做法。",
    "4. 最后给 2-4 条原文依据，引用要短，不要大段复述。",
    "",
    `拆书标题：${input.title}`,
    `来源标题：${input.sourceTitle || input.title}`,
    sectionInstruction(key, title),
    "",
    "原文：",
    clipSourceText(input.sourceText),
  ].join("\n");
}

function fallbackSection(input: CreateBookAnalysisInput, key: BookAnalysisSectionKey, title: string): string {
  const source = clipSourceText(input.sourceText);
  const firstParagraph = source.split(/\n+/).find((item) => item.trim().length > 20)?.trim() || source.slice(0, 120);
  const map: Record<BookAnalysisSectionKey, string[]> = {
    overview: ["作品需要先看清核心承诺：主角为何行动、读者为何继续读。", "最可迁移的是开篇问题、持续压力和阶段性回报。"],
    plot_structure: ["剧情应按目标、阻力、代价、反转推进。", "每章结尾需要保留一个具体未解决问题。"],
    timeline: ["时间线要服务因果，而不是罗列事件。", "关键事件应能解释人物选择如何一步步变得不可逆。"],
    character_system: ["人物系统的核心是欲望冲突。", "主角、对手和盟友都应承担推进情节的功能。"],
    worldbuilding: ["设定要形成限制和机会。", "世界观条目只有影响选择、资源或冲突时才有价值。"],
    themes: ["主题来自人物选择中的代价。", "最好让主题通过行动呈现，而不是旁白解释。"],
    style_technique: ["语言要优先服务场景与节奏。", "减少概念解释，多用动作、细节和对话承载信息。"],
    market_highlights: ["商业卖点需要高频出现但不重复。", "题材标签、爽点和反转要形成稳定期待。"],
  };

  return [
    `## ${title}`,
    "",
    "### 核心结论",
    ...map[key].map((item) => `- ${item}`),
    "",
    "### 可迁移做法",
    "- 先把目标读者期待写成一句话，再倒推章节功能。",
    "- 每一章至少保留一个明确推进：信息、关系、资源、危机或情绪变化。",
    "- 生成新作品时，把本分区结论放进章节目标，而不是只放在总设定里。",
    "",
    "### 原文依据",
    `- 依据片段：${firstParagraph.slice(0, 160)}`,
    "",
    "> 当前为本地兜底拆书。配置 OpenAI 兼容模型密钥后，会生成更细的分区分析。",
  ].join("\n");
}

function evidenceFromSource(input: CreateBookAnalysisInput): BookAnalysisEvidenceItem[] {
  const excerpt = clipSourceText(input.sourceText).replace(/\s+/g, " ").slice(0, 180);
  return excerpt
    ? [{ label: "来源片段", excerpt, sourceLabel: input.sourceTitle || input.title }]
    : [];
}

function encodeEvidence(items: BookAnalysisEvidenceItem[]): string {
  return JSON.stringify(items);
}

function decodeEvidence(value: string | null): BookAnalysisEvidenceItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as BookAnalysisEvidenceItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sectionContent(section: { editedContent?: string | null; aiContent?: string | null }): string {
  return section.editedContent?.trim() || section.aiContent?.trim() || "";
}

function memoryTypeForSection(key: string): string {
  const map: Record<string, string> = {
    overview: "plot",
    plot_structure: "plot",
    timeline: "plot",
    character_system: "character",
    worldbuilding: "world",
    themes: "plot",
    style_technique: "style",
    market_highlights: "pleasure",
  };
  return map[key] ?? "plot";
}

export class BookAnalysisService {
  listBookAnalyses(input: ListBookAnalysesInput = {}) {
    const where = input.novelId && input.scope !== "all"
      ? { bindings: { some: { novelId: input.novelId } } }
      : input.scope === "global"
        ? { bindings: { none: {} } }
        : {};

    return prisma.bookAnalysis.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        bindings: true,
        sections: { orderBy: { sortOrder: "asc" } },
      },
    }).then((rows) => rows.map(this.serializeDetail));
  }

  async getBookAnalysis(id: string) {
    const row = await prisma.bookAnalysis.findUnique({
      where: { id },
      include: {
        bindings: true,
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });
    return row ? this.serializeDetail(row) : null;
  }

  async createBookAnalysis(input: CreateBookAnalysisInput) {
    // 如果没有原文，基于书名生成一个简短的描述
    const sourceText = input.sourceText || `《${input.sourceTitle || input.title}》是一部引人入胜的小说作品。`;
    
    const analysis = await prisma.bookAnalysis.create({
      data: {
        title: input.title,
        sourceTitle: input.sourceTitle || null,
        sourceText: sourceText,
        status: "running",
        progress: 5,
        currentStage: "prepare",
        currentItemLabel: "初始化拆书分区",
        bindings: input.novelId
          ? {
              create: {
                novelId: input.novelId,
                source: "created_in_novel",
              },
            }
          : undefined,
        sections: {
          create: BOOK_ANALYSIS_SECTIONS.map((section, index) => ({
            sectionKey: section.key,
            title: section.title,
            sortOrder: index + 1,
            status: "idle",
          })),
        },
      },
    });
    return this.rebuildBookAnalysis(analysis.id);
  }

  async rebuildBookAnalysis(id: string) {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!analysis) {
      throw new Error("拆书任务不存在。");
    }

    const input = {
      title: analysis.title,
      sourceTitle: analysis.sourceTitle ?? undefined,
      sourceText: analysis.sourceText,
    };

    await prisma.bookAnalysis.update({
      where: { id },
      data: { status: "running", progress: 8, currentStage: "analysis", lastError: null },
    });

    try {
      for (let index = 0; index < BOOK_ANALYSIS_SECTIONS.length; index += 1) {
        const section = BOOK_ANALYSIS_SECTIONS[index];
        await prisma.bookAnalysisSection.update({
          where: { analysisId_sectionKey: { analysisId: id, sectionKey: section.key } },
          data: { status: "running" },
        });
        await prisma.bookAnalysis.update({
          where: { id },
          data: {
            progress: Math.round((index / BOOK_ANALYSIS_SECTIONS.length) * 86) + 8,
            currentItemKey: section.key,
            currentItemLabel: section.title,
          },
        });

        const aiContent = await llmService.completeText({
          prompt: buildPrompt(input, section.key, section.title),
          temperature: 0.28,
          maxTokens: 1800,
        }) ?? fallbackSection(input, section.key, section.title);

        await prisma.bookAnalysisSection.update({
          where: { analysisId_sectionKey: { analysisId: id, sectionKey: section.key } },
          data: {
            status: "succeeded",
            aiContent,
            evidence: encodeEvidence(evidenceFromSource(input)),
          },
        });
      }

      const detail = await prisma.bookAnalysis.findUniqueOrThrow({
        where: { id },
        include: {
          bindings: true,
          sections: { orderBy: { sortOrder: "asc" } },
        },
      });
      const summary = detail.sections.find((section) => section.sectionKey === "overview");
      await prisma.bookAnalysis.update({
        where: { id },
        data: {
          status: "succeeded",
          progress: 100,
          currentStage: "done",
          currentItemKey: null,
          currentItemLabel: "拆书完成",
          summary: sectionContent(summary ?? {}).slice(0, 500),
        },
      });
      return this.getBookAnalysis(id);
    } catch (error) {
      await prisma.bookAnalysis.update({
        where: { id },
        data: {
          status: "failed",
          lastError: error instanceof Error ? error.message : "拆书失败。",
        },
      });
      throw error;
    }
  }

  async updateSection(id: string, sectionKey: string, input: {
    editedContent?: string | null;
    notes?: string | null;
    frozen?: boolean;
    usedForImitation?: boolean;
  }) {
    await prisma.bookAnalysisSection.update({
      where: { analysisId_sectionKey: { analysisId: id, sectionKey } },
      data: input,
    });
    return this.getBookAnalysis(id);
  }

  async publishToKnowledge(id: string, novelId?: string | null) {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!analysis) {
      throw new Error("拆书任务不存在。");
    }
    if (analysis.status !== "succeeded") {
      throw new Error("拆书完成后才能发布到知识库。");
    }

    const content = [
      `# ${analysis.title}`,
      "",
      `来源：${analysis.sourceTitle || analysis.title}`,
      "",
      ...analysis.sections.map((section) => [
        `## ${section.title}`,
        "",
        sectionContent(section) || "暂无内容。",
      ].join("\n")),
    ].join("\n");

    const asset = await prisma.knowledgeAsset.create({
      data: {
        novelId: novelId || null,
        title: `拆书：${analysis.title}`,
        category: "book_analysis",
        content,
        tags: "拆书,结构分析,可迁移模板",
      },
    });
    await prisma.bookAnalysis.update({
      where: { id },
      data: { publishedAssetId: asset.id },
    });
    if (novelId) {
      await prisma.bookAnalysisBinding.upsert({
        where: {
          novelId_analysisId: {
            novelId,
            analysisId: id,
          },
        },
        update: { source: "published_to_knowledge" },
        create: {
          novelId,
          analysisId: id,
          source: "published_to_knowledge",
        },
      });
    }

    return {
      analysisId: id,
      novelId: novelId || null,
      knowledgeAssetId: asset.id,
      bindingCount: novelId ? 1 : 0,
      publishedAt: new Date().toISOString(),
    };
  }

  async materializeToKnowledge(id: string, novelId?: string | null) {
    if (!novelId) {
      throw new Error("沉淀拆书结果需要先绑定当前作品。");
    }
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id },
      include: {
        bindings: true,
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!analysis) {
      throw new Error("拆书任务不存在。");
    }
    if (analysis.status !== "succeeded") {
      throw new Error("拆书完成后才能沉淀到知识库。");
    }
    const isBound = analysis.bindings.some((binding) => binding.novelId === novelId);
    if (!isBound) {
      throw new Error("该拆书记录未绑定当前作品，不能沉淀。");
    }

    const sections = analysis.sections.map((section) => ({
      key: section.sectionKey,
      title: section.title,
      content: sectionContent(section),
      evidence: decodeEvidence(section.evidence),
      frozen: section.frozen,
      usedForImitation: section.usedForImitation,
    }));
    const content = [
      `# 拆书沉淀：${analysis.title}`,
      "",
      `来源：${analysis.sourceTitle || analysis.title}`,
      "",
      "## 分区结论",
      "",
      ...sections.map((section) => [
        `### ${section.title}`,
        "",
        section.content || "暂无内容。",
      ].join("\n")),
    ].join("\n");

    const asset = await prisma.knowledgeAsset.create({
      data: {
        novelId,
        title: `拆书沉淀：${analysis.title}`,
        category: "book_analysis_materialized",
        content,
        tags: "拆书,仿写准备,结构化记忆",
      },
    });

    for (const section of sections) {
      await prisma.memory.create({
        data: {
          novelId,
          type: memoryTypeForSection(section.key),
          category: `book_analysis:${section.key}`,
          title: `拆书/${section.title}：${analysis.title}`,
          content: section.content || "暂无内容。",
          importance: section.key === "plot_structure" || section.key === "character_system" ? 8 : 6,
          metadata: JSON.stringify({
            source: "book_analysis",
            analysisId: id,
            sourceTitle: analysis.sourceTitle || analysis.title,
            evidence: section.evidence,
          }),
        },
      });
    }

    await prisma.bookAnalysis.update({
      where: { id },
      data: { publishedAssetId: asset.id },
    });

    return {
      analysisId: id,
      novelId,
      knowledgeAssetId: asset.id,
      memoryCount: sections.length,
      materializedAt: new Date().toISOString(),
    };
  }

  private serializeDetail(row: any) {
    return {
      ...row,
      sections: row.sections.map((section: any) => ({
        ...section,
        evidence: decodeEvidence(section.evidence),
        structuredData: section.structuredData ? JSON.parse(section.structuredData) : null,
        usedForImitation: section.usedForImitation,
      })),
    };
  }
}
