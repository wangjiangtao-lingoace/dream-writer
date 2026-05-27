import { prisma } from "../db/prisma";
import { parseLlmJson } from "../utils/parseJson";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { pipelineService, type PipelineConfig } from "./PipelineService";

const llmService = new LlmInvokeService();

function sectionContent(section: { editedContent?: string | null; aiContent?: string | null }): string {
  return section.editedContent?.trim() || section.aiContent?.trim() || "";
}

function safeJson(value: string | null, fallback: any) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializePlan(row: any) {
  return {
    ...row,
    sectionPlans: safeJson(row.sectionPlans, []),
    blueprint: safeJson(row.blueprint, {}),
    chapterTemplate: safeJson(row.chapterTemplate, {}),
    sampleDrafts: safeJson(row.sampleDrafts, []),
  };
}

function buildFallbackPlan(novel: { title: string; genre?: string | null; inspiration?: string | null }, analysis: any) {
  const sections = analysis.sections
    .filter((section: any) => section.usedForImitation !== false)
    .map((section: any) => ({
    sectionKey: section.sectionKey,
    title: section.title,
    transferableRules: [
      "只迁移结构方法、节奏安排和读者期待，不复刻原书人物、桥段和表达。",
      "把拆书结论转换为当前作品的目标、冲突、限制、爽点和章节功能。",
    ],
    localApplication: sectionContent(section).slice(0, 600) || `将「${section.title}」转化为《${novel.title}》的创作约束。`,
  }));

  return {
    sectionPlans: sections,
    blueprint: {
      title: novel.title,
      genre: novel.genre || "待定",
      premise: novel.inspiration || "围绕当前作品灵感建立主线。",
      corePromise: "用拆书得到的结构经验设计当前作品自己的核心承诺。",
      outline: {
        opening: "建立主角困境、核心目标和第一处不可逆选择。",
        development: "围绕资源、关系、压力和反转持续升级。",
        climax: "让前期伏笔和人物选择在高压场景中集中兑现。",
      },
      characters: [],
      worldview: {},
      styleRules: ["控制套话，优先使用动作、细节和对白推动信息。"],
      pleasureRhythm: ["每章至少有信息、关系、资源、危机或情绪变化之一。"],
    },
    chapterTemplate: {
      volumes: [
        {
          title: "第一卷",
          goal: "建立主角处境、核心冲突和长期期待。",
          chapters: [
            { order: 1, function: "开篇钩子", goal: "抛出主角困境和第一处异常。", hook: "留下一个必须继续追问的问题。" },
            { order: 2, function: "规则展示", goal: "展示限制条件和代价。", hook: "让主角被迫做选择。" },
            { order: 3, function: "小爽点兑现", goal: "给出第一次阶段回报。", hook: "引出更大的压力。" },
          ],
        },
      ],
    },
    sampleDrafts: [
      {
        chapterTitle: "第一章",
        draft: `《${novel.title}》第一章样章草稿：\n\n这里根据仿写蓝图写开篇。主角先遇到一个具体困境，再被一个异常事件推向选择。文本不复刻参考作品，只复用节奏和章节功能。`,
      },
    ],
  };
}

export class ImitationPlanService {
  async listByNovel(novelId: string) {
    const rows = await prisma.imitationPlan.findMany({
      where: { novelId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(serializePlan);
  }

  async createFromBookAnalysis(analysisId: string, novelId?: string | null) {
    if (!novelId) {
      throw new Error("生成仿写方案需要当前作品。");
    }
    const [novel, analysis] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId } }),
      prisma.bookAnalysis.findUnique({
        where: { id: analysisId },
        include: {
          bindings: true,
          sections: { orderBy: { sortOrder: "asc" } },
        },
      }),
    ]);
    if (!novel) throw new Error("作品不存在。");
    if (!analysis) throw new Error("拆书任务不存在。");
    if (analysis.status !== "succeeded") throw new Error("拆书完成后才能生成仿写方案。");
    if (!analysis.bindings.some((binding) => binding.novelId === novelId)) {
      throw new Error("该拆书记录未绑定当前作品。");
    }

    const enabledSections = analysis.sections.filter((section) => section.usedForImitation !== false);
    const sectionText = enabledSections.map((section) => [
      `## ${section.title} (${section.sectionKey})`,
      sectionContent(section) || "暂无内容。",
    ].join("\n")).join("\n\n");

    const prompt = [
      "你是 Dream Writer 的仿写方案设计器。任务是学习参考书的结构与技法，为当前作品生成原创创作方案。",
      "严禁复刻参考书具体人物、桥段、专有设定、连续表达或句段级风格；只迁移结构、节奏、章节功能、人物关系机制、文风原则和商业卖点。",
      "请只输出 JSON，不要 Markdown。",
      "",
      `当前作品：${novel.title}`,
      `类型：${novel.genre || "待定"}`,
      `灵感：${novel.inspiration || "未填写"}`,
      `拆书标题：${analysis.title}`,
      `来源标题：${analysis.sourceTitle || analysis.title}`,
      "",
      "拆书分区（仅包含用户开启“用于仿写”的分区）：",
      sectionText,
      "",
      "输出 JSON 结构：",
      `{
  "sectionPlans": [
    {
      "sectionKey": "overview",
      "title": "拆书总览",
      "transferableRules": ["可迁移规则1", "可迁移规则2"],
      "localApplication": "本书仿写落点，必须服务当前作品"
    }
  ],
  "blueprint": {
    "title": "当前作品建议书名",
    "genre": "类型",
    "premise": "一句话故事",
    "corePromise": "给读者的核心承诺",
    "outline": {
      "opening": "开篇设计",
      "development": "中段推进",
      "climax": "高潮兑现"
    },
    "characters": [
      { "name": "原创角色名", "role": "主角/反派/配角", "desire": "欲望", "pressure": "压力", "arc": "变化" }
    ],
    "worldview": { "rules": "规则", "limits": "限制", "resources": "资源" },
    "styleRules": ["写法规则"],
    "pleasureRhythm": ["爽点节奏"]
  },
  "chapterTemplate": {
    "volumes": [
      {
        "title": "卷名",
        "goal": "本卷目标",
        "chapters": [
          { "order": 1, "function": "章节功能", "goal": "章节目标", "conflict": "冲突", "hook": "章末钩子" }
        ]
      }
    ]
  },
  "sampleDrafts": [
    { "chapterTitle": "第一章", "draft": "原创样章草稿" }
  ]
}`,
    ].join("\n");

    const generated = parseLlmJson(await llmService.completeText({ prompt, temperature: 0.62, maxTokens: 3600 }));
    const plan = generated?.sectionPlans && generated?.blueprint && generated?.chapterTemplate
      ? generated
      : buildFallbackPlan(novel, analysis);

    const row = await prisma.imitationPlan.create({
      data: {
        novelId,
        bookAnalysisId: analysisId,
        title: `仿写方案：${analysis.title}`,
        status: "succeeded",
        sectionPlans: JSON.stringify(plan.sectionPlans ?? []),
        blueprint: JSON.stringify(plan.blueprint ?? {}),
        chapterTemplate: JSON.stringify(plan.chapterTemplate ?? {}),
        sampleDrafts: JSON.stringify(plan.sampleDrafts ?? []),
      },
    });

    return serializePlan(row);
  }

  async materialize(planId: string) {
    const plan = await prisma.imitationPlan.findUnique({
      where: { id: planId },
      include: { novel: true, bookAnalysis: true },
    });
    if (!plan) throw new Error("仿写方案不存在。");

    const sectionPlans = safeJson(plan.sectionPlans, []);
    const blueprint = safeJson(plan.blueprint, {});
    const chapterTemplate = safeJson(plan.chapterTemplate, {});
    const sampleDrafts = safeJson(plan.sampleDrafts, []);
    const content = [
      `# ${plan.title}`,
      "",
      `作品：${plan.novel.title}`,
      `来源拆书：${plan.bookAnalysis.title}`,
      "",
      "## 创作蓝图",
      "```json",
      JSON.stringify(blueprint, null, 2),
      "```",
      "",
      "## 章节模板",
      "```json",
      JSON.stringify(chapterTemplate, null, 2),
      "```",
      "",
      "## 8 分区仿写落点",
      ...sectionPlans.map((section: any) => [
        `### ${section.title || section.sectionKey}`,
        "",
        "可迁移规则：",
        ...(section.transferableRules ?? []).map((item: string) => `- ${item}`),
        "",
        `本书落点：${section.localApplication || ""}`,
      ].join("\n")),
      "",
      "## 样章草稿",
      ...sampleDrafts.map((sample: any) => [
        `### ${sample.chapterTitle || "样章"}`,
        "",
        sample.draft || "",
      ].join("\n")),
    ].join("\n");

    const asset = await prisma.knowledgeAsset.create({
      data: {
        novelId: plan.novelId,
        title: plan.title,
        category: "imitation_plan",
        content,
        tags: "仿写方案,创作蓝图,样章草稿",
      },
    });

    await prisma.memory.create({
      data: {
        novelId: plan.novelId,
        type: "plot",
        category: "imitation_plan:blueprint",
        title: `${plan.title}/创作蓝图`,
        content: JSON.stringify(blueprint, null, 2),
        importance: 9,
        metadata: JSON.stringify({ source: "imitation_plan", planId }),
      },
    });
    await prisma.memory.create({
      data: {
        novelId: plan.novelId,
        type: "style",
        category: "imitation_plan:chapter_template",
        title: `${plan.title}/章节模板`,
        content: JSON.stringify(chapterTemplate, null, 2),
        importance: 8,
        metadata: JSON.stringify({ source: "imitation_plan", planId }),
      },
    });

    const updated = await prisma.imitationPlan.update({
      where: { id: planId },
      data: { knowledgeAssetId: asset.id },
    });
    return serializePlan(updated);
  }

  async applyToPipeline(planId: string, config: PipelineConfig = {}) {
    const plan = await prisma.imitationPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error("仿写方案不存在。");
    const job = await pipelineService.startPipeline(plan.novelId, {
      ...config,
      imitationPlanId: plan.id,
      bookAnalysisId: plan.bookAnalysisId,
    });
    await prisma.imitationPlan.update({
      where: { id: planId },
      data: { pipelineJobId: job.id },
    });
    return job;
  }
}

export const imitationPlanService = new ImitationPlanService();
