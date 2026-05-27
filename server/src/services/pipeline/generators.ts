import { parseLlmJson } from "../../utils/parseJson";
import { PipelineConfig } from "../PipelineService";
import { PhaseContext } from "./pipelineUtils";

// ===== 大纲/资产生成 =====

export async function generateOutline(
  ctx: PhaseContext,
  novelId: string,
  inspiration: string,
  knowledge: string,
  config: PipelineConfig,
  userHint?: string,
): Promise<any> {
  const system = `你是一位资深网文策划师。你的核心任务是：基于用户提供的创意素材，进行增量补充和结构化整理，而不是重新创作。

工作原则：
- 用户的创意是核心素材，必须最大程度保留原文内容和表达
- 只补充用户未涉及的部分，不改写已有内容
- 如果用户的创意已经非常完整，你只需要做结构化整理和少量补充
- 补充的内容要与用户的风格和调性保持一致
- 绝不能丢失用户创意中的任何重要细节、人物设定、情节设计`;

  const prompt = `请分析以下创意素材，将其整理为结构化的大纲。

【创意素材】
${inspiration}

【类型】
${config.genre || "自动判断"}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

你的任务：
1. 先分析创意素材中已包含哪些内容（标题、世界观、人物、故事线、风格等）
2. 将已有内容直接保留到对应字段，不要改写或压缩
3. 只对缺失的部分进行补充（如：素材中没有写到的具体情节细节、冲突升级节奏等）
4. 如果素材已经非常完整，补充量应尽可能少

请生成JSON格式的大纲：
{
  "title": "从素材中提取，如无则建议",
  "genre": "从素材中提取",
  "theme": "从素材中提取核心主题",
  "hook": "从素材中提取开篇钩子，如无则补充一个具体的开篇场景",
  "coreSetting": "从素材中提取核心设定，保留原文描述",
  "mainConflict": "从素材中提取主要冲突，保留原文描述",
  "protagonist": {
    "name": "从素材中提取",
    "identity": "从素材中提取，保留原文描述",
    "goal": "从素材中提取，如无则补充短期和长期目标",
    "growth": "从素材中提取成长线，如无则补充"
  },
  "antagonist": {
    "name": "从素材中提取",
    "identity": "从素材中提取",
    "motivation": "从素材中提取"
  },
  "plotStructure": {
    "beginning": "从素材中提取开篇情节，如无则补充具体的前10%情节",
    "development": "从素材中提取发展阶段，如无则补充10%-40%的具体情节",
    "climax": "从素材中提取高潮情节，如无则补充40%-80%的具体冲突升级",
    "resolution": "从素材中提取结局，如无则补充80%-100%的收尾"
  },
  "highlights": "从素材中提取亮点，如无则提炼3个核心卖点",
  "targetAudience": "从素材中提取目标读者，如无则补充"
}

注意：输出的每个字段都应该尽量详细，保留原文的生动表达，不要压缩成干巴巴的概括。`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
  return parseLlmJson(result) || {};
}

export async function generateWorldview(
  ctx: PhaseContext,
  novelId: string,
  outline: any,
  knowledge: string,
  userHint?: string,
): Promise<any> {
  const system = `你是一位资深网文世界观架构师。你的核心任务是：基于大纲中已有的世界观设定，进行增量补充和结构化整理，而不是重新创作。

工作原则：
- 大纲中的世界观设定是核心素材，必须最大程度保留原文内容
- 只补充大纲中未涉及的部分（如：力量体系的具体等级、势力的详细分布等）
- 如果大纲中的世界观已经非常完整，你只需要做结构化整理和少量补充
- 保留原文的生动表达和独特设定`;

  const prompt = `请分析以下大纲中的世界观设定，进行增量补充和结构化整理。

【大纲】
${JSON.stringify(outline, null, 2)}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

你的任务：
1. 先分析大纲中已包含哪些世界观设定
2. 将已有内容直接保留到对应字段，不要改写或压缩
3. 只对缺失的部分进行补充（如：力量体系的具体等级、势力的详细分布等）

请生成JSON格式的世界观：
{
  "name": "从大纲中提取，如无则建议",
  "summary": "从大纲中提取世界概述，保留原文描述",
  "rules": "从大纲中提取世界规则，保留原文描述",
  "geography": "从大纲中提取地理环境，如无则补充关键地点",
  "factions": "从大纲中提取势力分布，如无则补充主要势力关系",
  "history": "从大纲中提取历史背景，如无则补充与故事相关的重大事件",
  "powerSystem": {
    "name": "从大纲中提取力量体系名称",
    "levels": "从大纲中提取等级，如无则补充合理的等级划分",
    "rules": "从大纲中提取力量规则，如无则补充获取方式和限制条件"
  },
  "specialElements": "从大纲中提取特殊元素，如无则补充"
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 1500 });
  const parsed = parseLlmJson(result) || {};
  return Object.keys(parsed).length ? parsed : ctx.buildFallbackWorldview(outline);
}

export async function generateCharacters(
  ctx: PhaseContext,
  novelId: string,
  outline: any,
  worldview: any,
  knowledge: string,
  userHint?: string,
): Promise<any> {
  const system = `你是一位资深网文人物设计师。你的核心任务是：基于大纲中已有的人物设定，进行增量补充和结构化整理，而不是重新设计人物。

工作原则：
- 大纲中的人物设定是核心素材，必须最大程度保留原文内容
- 只补充大纲中未涉及的部分（如：外貌细节、背景故事补充等）
- 如果大纲中的人物已经非常完整，你只需要做结构化整理和少量补充
- 保留原文的人物特色和关系描述`;

  const prompt = `请分析以下大纲中的人物设定，进行增量补充和结构化整理。

【大纲】
${JSON.stringify(outline, null, 2)}

【世界观】
${JSON.stringify(worldview, null, 2)}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

你的任务：
1. 先分析大纲中已包含哪些人物设定
2. 将已有内容直接保留到对应字段，不要改写或压缩
3. 只对缺失的部分进行补充（如：外貌特征、能力细节等）

请生成JSON格式的人物列表：
{
  "characters": [
    {
      "name": "从大纲中提取人物名",
      "role": "从大纲中提取角色定位",
      "identity": "从大纲中提取身份描述，保留原文",
      "motivation": "从大纲中提取动机，保留原文",
      "appearance": "从大纲中提取外貌特征，如无则补充有记忆点的描述",
      "background": "从大纲中提取背景故事，如无则补充与主线关联的背景",
      "personality": "从大纲中提取性格特点，保留原文描述",
      "abilities": "从大纲中提取能力/技能，如无则补充与世界观匹配的能力",
      "relationsText": "从大纲中提取人物关系，保留原文描述"
    }
  ]
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 2000 });
  return parseLlmJson(result) || {};
}

export async function generateStyle(
  ctx: PhaseContext,
  novelId: string,
  outline: any,
  config: PipelineConfig,
  userHint?: string,
): Promise<any> {
  const system = `你是一位资深网文风格顾问，擅长设计能有效约束写作的风格体系。
你的核心任务是：基于大纲中的风格描述，设计一套具体、可执行的风格约束，让每一段文字都能体现出统一的风格调性。

工作原则：
- 大纲中的风格描述是核心素材，必须最大程度保留原文内容
- 风格约束必须具体到可执行层面，不能只是抽象标签
- 要考虑反差、幽默、紧张感等情绪节奏的控制方式`;

  const prompt = `请分析以下大纲中的风格描述，设计一套完整的风格约束体系。

【大纲】
${JSON.stringify(outline, null, 2)}

【配置】
类型：${config.genre || outline.genre || "自动判断"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式的风格配置：
{
  "name": "风格名称，如「轻松幽默的都市修仙」「压抑暗黑的权谋复仇」",
  "description": "一句话概括整体风格调性",

  "toneAndAtmosphere": "整体基调与氛围。例如：「表面轻松搞笑，底层有暗流涌动的紧张感」「压抑沉重中穿插温情时刻」",
  "emotionalRhythm": "情绪节奏设计。例如：「每章前半段轻松日常，后半段反转制造紧张」「三章一个小高潮，十章一个大高潮」",
  "contrastPatterns": "反差设计。例如：「主角外表废物vs内在天才的反差」「搞笑日常vs生死危机的反差」「温馨日常vs阴谋暗涌的反差」",

  "humorStyle": "幽默方式。例如：「毒舌吐槽型：主角内心OS犀利搞笑」「冷幽默：用一本正经的方式说荒诞的事」「自嘲式：主角自嘲化解尴尬」「无」",
  "tensionTechniques": "紧张感制造技巧。例如：「信息不对称：读者知道危险但角色不知道」「倒计时：限时压力」「信任危机：盟友突然可疑」",
  "suspenseTechniques": "悬念技巧。例如：「每章末尾留一个未解问题」「关键信息分段揭露」「真假线索混杂」",

  "narrativePov": "叙事视角：first_person / third_person_limited / third_person_omniscient",
  "tense": "时态：past / present",
  "pacing": "整体节奏：fast / balanced / slow",
  "sentenceRhythm": "句式节奏。例如：「短句为主制造紧张，长句铺垫制造氛围」「长短交错，像呼吸一样有节奏」",
  "vocabularyLevel": "用词层级。例如：「口语化为主，偶尔用文言点缀」「现代白话，避免生僻字」「古风用语，但不晦涩」",
  "dialogueStyle": "对话风格。例如：「简洁有力，潜台词丰富」「日常口语化，关键时刻突然严肃」「话少但每句都有信息量」",

  "chapterOpeningStyle": "开篇方式。例如：「直接进入冲突，不要铺垫」「先展示日常，再打破平静」「以悬念或疑问开篇」",
  "chapterEndingStyle": "收尾方式。例如：「必须留钩子，让读者想看下一章」「以角色的内心独白收尾」「以新信息或反转收尾」",

  "writingRules": [
    "具体的写作规则1，例如：每章必须有一个情绪高点（爽点/泪点/笑点）",
    "具体的写作规则2，例如：避免大段心理描写，用行动和对话推进",
    "具体的写作规则3，例如：专业判断必须给出可见证据，避免无根据开挂"
  ],

  "avoidList": [
    "需要避免的写法1，例如：不要用「他心想」开头的大段内心独白",
    "需要避免的写法2，例如：不要在紧张场景中插入搞笑",
    "需要避免的写法3，例如：不要用「突然」作为转折词"
  ]
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.6, maxTokens: 2000 });
  const parsed = parseLlmJson(result) || {};
  return Object.keys(parsed).length ? parsed : ctx.buildFallbackStyle(outline, config);
}

// ===== 卷纲/章纲生成 =====

export async function generateVolumeOutline(
  ctx: PhaseContext,
  novelId: string,
  outline: any,
  worldview: any,
  characters: any,
  style: any,
  config: PipelineConfig,
  inspiration?: string,
  userHint?: string,
): Promise<any> {
  const volumeCount = config.volumeCount || 5;
  const chaptersPerVolume = config.chaptersPerVolume || 30;
  const totalChapters = volumeCount * chaptersPerVolume;

  const system = `你是一位资深网文结构师，擅长规划长篇小说的卷结构。

设计原则：
- 卷与卷之间要有递进关系：冲突升级、世界观扩展、人物成长
- 每卷要有核心爽点和标志性事件
- 每卷结尾要留钩子，吸引读者继续阅读
- 新角色引入要有节奏，不要一卷塞太多
- 情绪基调要有变化，不能每卷都一样
- 要考虑整体字数分配的合理性
- 每卷的目标、冲突、情绪必须明确且可执行
- 卷与卷之间的衔接要自然，不能突兀跳转`;

  const characterSummary = Array.isArray(characters?.characters)
    ? characters.characters.map((c: any) => `${c.name}（${c.role || "未知"}）：${c.motivation || ""}`).join("\n")
    : typeof characters === "string" ? characters : JSON.stringify(characters, null, 2);

  const prompt = `请根据以下信息，规划${volumeCount}卷的内容（共${totalChapters}章，每卷${chaptersPerVolume}章）。

【用户创意/灵感】
${inspiration || outline?.title ? `作品：${outline?.title || "未命名"}` : "无"}
${typeof outline === "string" ? outline : ""}

【故事大纲】
${typeof outline === "object" ? JSON.stringify(outline, null, 2) : "见上方创意"}

【世界观】
${worldview?.name ? `${worldview.name}：${worldview.summary || ""}\n规则：${worldview.rules || "无"}\n力量体系：${typeof worldview.powerSystem === "string" ? worldview.powerSystem : JSON.stringify(worldview.powerSystem || {})}` : JSON.stringify(worldview, null, 2)}

【主要人物】
${characterSummary}

【写作风格】
${style?.name ? `${style.name}：${style.description || ""}` : JSON.stringify(style, null, 2)}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式的卷纲，每卷必须包含明确的目标、冲突和情绪设计：
{
  "volumes": [
    {
      "title": "卷标题（要有概括性，体现本卷核心主题）",
      "goal": "本卷目标（主角在本卷要达成什么，必须具体可衡量）",
      "conflict": "主要冲突（本卷的核心矛盾，要说明冲突双方和冲突焦点）",
      "emotion": "情绪基调（如：热血、悬疑、温情、压抑、轻松、悲壮）",
      "newChars": ["新角色1", "新角色2"],
      "mapName": "主要场景（与世界观关联的具体地点）",
      "endHook": "结尾钩子（用什么悬念吸引读者看下一卷，要具体）",
      "keyEvents": ["关键事件1", "关键事件2"],
      "turningPoint": "本卷转折点（剧情发生重大变化的事件）",
      "climax": "本卷高潮（最精彩的部分）"
    }
  ]
}

注意：
- 每卷的 title 要有吸引力，能概括本卷主题
- goal 必须是具体的目标，不能是模糊的描述
- conflict 要说明具体的冲突双方和焦点
- endHook 要有具体的悬念，不能只是"留个钩子"
- keyEvents 列出本卷 2-3 个最重要的事件
- turningPoint 和 climax 必须是具体的事件描述`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
  return parseLlmJson(result) || {};
}

export async function generateChapterOutlines(
  ctx: PhaseContext,
  novelId: string,
  volumes: any,
  outline: any,
  worldview: any,
  characters: any,
  style: any,
  config: PipelineConfig,
): Promise<any> {
  const chaptersPerVolume = config.chaptersPerVolume || 10;
  const system = `你是一位资深网文章纲设计师，擅长将宏观故事拆解为引人入胜的章节。

设计原则：
- 每章要有明确的目标和冲突，不能流水账
- 章节之间要有节奏变化：紧张→舒缓→紧张
- 每章结尾要有钩子（悬念、反转、新信息），让读者想看下一章
- 关键章节（开篇、转折、高潮）要有更高的信息密度和情感强度
- 要考虑每章的字数目标和阅读时长
- 人物成长和关系变化要有自然的过渡`;

  const prompt = `请为每卷设计${chaptersPerVolume}章的章纲。

【大纲】
${JSON.stringify(outline, null, 2)}

【卷纲】
${JSON.stringify(volumes, null, 2)}

【世界观】
${JSON.stringify(worldview, null, 2)}

【人物】
${JSON.stringify(characters, null, 2)}

【风格】
${JSON.stringify(style, null, 2)}

请生成JSON格式的章纲：
{
  "chapterOutlines": [
    {
      "volumeIndex": 0,
      "chapters": [
        {
          "title": "章节标题（要有吸引力）",
          "goal": "章节目标（本章要推进什么）",
          "conflict": "冲突（本章的核心矛盾）",
          "emotion": "情绪（如：紧张、温馨、热血、压抑）",
          "hook": "章末钩子（如何吸引读者看下一章）"
        }
      ]
    }
  ]
}`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
  return parseLlmJson(result) || {};
}

export async function generateMainlinesAndHooks(
  ctx: PhaseContext,
  novelId: string,
  outline: any,
  volumes: any,
  worldview: any,
  characters: any,
  style?: any,
  knowledge?: string,
  userHint?: string,
): Promise<any> {
  const system = `你是一位资深网文剧情架构师，擅长设计贯穿全文的主线和层层递进的钩子。

设计原则：
- 主线要清晰，贯穿全文，有明确的起点和终点
- 支线要服务于主线，不能喧宾夺主
- 钩子要有层次：小钩子（每章）→ 中钩子（每卷）→ 大钩子（全文）
- 钩子类型要多样：悬念、反转、新信息、情感冲突、实力展示
- 钩子强度要递进，越到后面越强
- 主线和钩子要与人物成长弧线紧密结合
- 要考虑风格调性：如果风格偏轻松幽默，钩子也可以有趣味性；如果风格偏压抑紧张，钩子要更有压迫感`;

  const prompt = `请根据以下信息，规划主线和钩子。

【大纲】
${JSON.stringify(outline, null, 2)}

【卷纲】
${JSON.stringify(volumes, null, 2)}

【世界观】
${JSON.stringify(worldview, null, 2)}

【人物】
${JSON.stringify(characters, null, 2)}

【风格】
${JSON.stringify(style || {}, null, 2)}

【参考知识】
${knowledge || "无"}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式（必须包含 mainlines 和 hooks 两个数组）：
{
  "mainlines": [
    { "title": "主线名称", "description": "主线描述（要具体，包含起承转合，说明起点、发展、高潮、结局）" }
  ],
  "hooks": [
    { "title": "钩子标题", "description": "钩子描述（要具体，说明在哪个节点、如何吸引读者）", "type": "suspense/foreshadow/cliffhanger/reversal/power_display", "intensity": 1-10 }
  ]
}

注意：
1. mainlines 至少要有 2-3 条主线（主线、情感线、成长线等）
2. hooks 至少要有 5-8 个钩子，分布在不同卷和章节
3. 每个描述都要具体，不要泛泛而谈`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 2000 });
  const parsed = parseLlmJson(result) || {};
  if (!parsed.mainlines && !parsed.hooks) {
    console.warn("主线钩子解析失败，LLM返回:", result?.substring(0, 200));
    return {
      mainlines: [{ title: "主线剧情", description: "待补充" }],
      hooks: [],
    };
  }
  return parsed;
}

export async function generateEnrichedChapterOutlines(
  ctx: PhaseContext,
  novelId: string,
  volumes: any,
  volumeIndex: number,
  outline: any,
  worldview: any,
  characters: any,
  style: any,
  previousSummary: string,
  config: PipelineConfig,
  userHint?: string,
): Promise<any> {
  const chaptersPerVolume = config.chaptersPerVolume || 30;
  const volume = volumes?.volumes?.[volumeIndex] || {};
  const volumeNumber = volumeIndex + 1;

  const system = `你是一位资深网文章纲设计师，擅长为长篇小说设计详细的章节规划。

设计原则：
- 每章必须有明确的目标和冲突，不能流水账
- 章节之间要有节奏变化：紧张→舒缓→紧张
- 每章结尾要有钩子（悬念、反转、新信息），让读者想看下一章
- 关键章节（开篇、转折、高潮）要有更高的信息密度和情感强度
- 人物成长和关系变化要有自然的过渡
- 钩子和伏笔必须在后续章节有明确回收计划，不能悬空
- 爽点分布要有节奏，不能连续出现也不能长期缺失
- 角色出场要有逻辑，不能凭空出现
- 情绪曲线要有起伏，不能全是高潮或全是低谷`;

  const characterNames = Array.isArray(characters?.characters)
    ? characters.characters.map((c: any) => c.name).join("、")
    : "未知";

  const prompt = `请为第${volumeNumber}卷设计${chaptersPerVolume}章的详细章纲。

【故事大纲】
${typeof outline === "string" ? outline : JSON.stringify(outline, null, 2)}

【第${volumeNumber}卷卷纲】
${JSON.stringify(volume, null, 2)}

【世界观摘要】
${worldview?.name ? `${worldview.name}：${worldview.summary || ""}` : JSON.stringify(worldview, null, 2)}

【可用角色】
${characterNames}

【风格约束】
${style?.name ? `${style.name}：${style.description || ""}` : JSON.stringify(style, null, 2)}
${previousSummary ? `\n【前序卷章纲摘要】\n${previousSummary}` : ""}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式的富化章纲，每章必须包含以下字段：
{
  "chapters": [
    {
      "title": "章节标题（要有吸引力）",
      "goal": "本章目标（推进什么剧情）",
      "conflict": "本章核心冲突",
      "emotion": "情绪基调（紧张/温馨/热血/压抑/轻松/悲伤等）",
      "hook": "章末钩子（如何吸引读者看下一章）",
      "characters": [
        {"name": "角色名", "goal": "本章该角色的目标", "action": "关键行动"}
      ],
      "hooksPlanted": [
        {"title": "钩子标题", "description": "具体内容", "type": "suspense/foreshadow/cliffhanger/reversal/comedy/mystery/power_up/romance", "intensity": 7, "plannedResolveChapter": 15}
      ],
      "hooksResolved": [
        {"title": "之前埋的钩子标题", "resolvedDescription": "如何揭示/回收"}
      ],
      "foreshadowPlanted": [
        {"title": "伏笔标题", "description": "具体内容", "plannedPayoffChapter": 20}
      ],
      "foreshadowPayoff": [
        {"title": "之前埋的伏笔标题", "payoffDescription": "如何回收"}
      ],
      "pleasurePoint": {
        "type": "power_up/revenge/shock/romance/resource/status/golden_finger",
        "intensity": 8,
        "description": "爽点描述"
      },
      "emotionData": {
        "emotionType": "tension/release/depression/climax/neutral",
        "intensity": 7,
        "isClimax": false,
        "isTurningPoint": false,
        "isBreathing": false
      }
    }
  ]
}

注意：
- 如果本章没有埋设钩子，hooksPlanted 设为空数组 []
- 如果本章没有回收钩子，hooksResolved 设为空数组 []
- 伏笔同理
- 每5-8章至少有一个爽点
- 情绪曲线要有起伏，连续高潮不超过3章，连续低谷不超过5章
- 开篇章节必须有强钩子
- 所有钩子和伏笔的 plannedResolveChapter/plannedPayoffChapter 必须是有效的章节编号`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 6000 });
  return parseLlmJson(result) || {};
}

export async function generateStoryArcs(
  ctx: PhaseContext,
  novelId: string,
  outline: any,
  allChapterOutlines: any,
  volumes: any,
  worldview: any,
  characters: any,
  style: any,
  config: PipelineConfig,
): Promise<any> {
  const chapterSummary = (allChapterOutlines?.chapterOutlines || []).flatMap((group: any, volIdx: number) =>
    (group.chapters || []).map((ch: any, chIdx: number) => ({
      volume: volIdx + 1,
      chapter: chIdx + 1,
      title: ch.title,
      goal: ch.goal,
      hook: ch.hook,
    }))
  );
  const totalChapters = chapterSummary.length;
  const volumeCount = volumes?.volumes?.length || 0;

  const system = `你是一位资深网文故事弧线设计师，擅长规划长篇小说的主线脉络和跨卷钩子。

设计原则：
- 主线必须贯穿全文，有明确的起点和终点
- 支线必须服务于主线，不能喧宾夺主
- 跨卷钩子要有递进关系，强度逐步升级
- 情绪曲线要有整体节奏感：三章一小高潮，十章大高潮
- 伏笔的埋设和回收要形成完整闭环
- 主线的里程碑事件必须被章节的 goal 覆盖`;

  const prompt = `请根据以下完整的章纲规划，设计跨卷故事弧线。

【故事大纲】
${typeof outline === "string" ? outline : JSON.stringify(outline, null, 2)}

【卷纲】
${JSON.stringify(volumes, null, 2)}

【全局章纲摘要（共${totalChapters}章，${volumeCount}卷）】
${JSON.stringify(chapterSummary, null, 2)}

【世界观】
${worldview?.name ? `${worldview.name}：${worldview.summary || ""}` : JSON.stringify(worldview, null, 2)}

【人物】
${Array.isArray(characters?.characters) ? characters.characters.map((c: any) => `${c.name}（${c.role}）`).join("、") : JSON.stringify(characters, null, 2)}

请生成JSON格式的故事弧线：
{
  "mainlines": [
    {
      "title": "主线名称",
      "description": "详细描述（包含起因、发展、高潮、结局）",
      "type": "main/sub/emotional/mystery",
      "startChapter": 1,
      "endChapter": ${totalChapters},
      "milestones": [
        {"chapter": 15, "event": "里程碑事件描述"},
        {"chapter": 50, "event": "里程碑事件描述"}
      ],
      "resolution": "结局方向"
    }
  ],
  "crossVolumeHooks": [
    {
      "title": "跨卷钩子标题",
      "description": "具体内容",
      "type": "suspense/foreshadow/cliffhanger/mystery/reversal",
      "intensity": 9,
      "plantedChapter": 5,
      "resolvedChapter": 120
    }
  ],
  "emotionCurveSummary": {
    "rhythmPattern": "节奏模式描述（如：三章一小高潮，十章大高潮）",
    "climaxChapters": [10, 25, 50, 75, 100, 125, ${totalChapters}],
    "breathingChapters": [5, 15, 30, 45, 60, 80, 110, 140],
    "turningPoints": [50, 100]
  }
}

注意：
- 主线至少2-3条（主剧情线、感情线、成长线）
- 跨卷钩子至少5-8个，分布 across 不同卷
- 每个里程碑事件必须对应到具体的章节编号
- 情绪曲线的章节编号必须在 1-${totalChapters} 范围内`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
  return parseLlmJson(result) || {};
}

export async function generateConsistencyCheck(
  ctx: PhaseContext,
  novelId: string,
  planSummary: string,
): Promise<any> {
  const system = `你是一位资深网文故事编辑，擅长检查长篇小说规划的一致性和逻辑性。

你的任务是对完整的故事规划进行全面的一致性校验，找出所有潜在问题。

校验项目：
1. 钩子一致性：所有埋设的钩子是否都有对应的回收章节？是否有钩子计划在不存在的章节回收？
2. 伏笔一致性：所有埋设的伏笔是否都有对应的回收章节？埋设/回收配对是否完整？
3. 角色出场逻辑：是否有角色在死亡/离场后又出现？新角色首次出场是否合理？
4. 主线覆盖：主线的里程碑事件是否都被章节目标覆盖？主线的结局方向是否在最后几卷有铺垫？
5. 情绪节奏：是否有连续3章以上都是高潮？是否有连续5章以上都是低谷？开篇和结尾章节的情绪是否合适？
6. 爽点分布：爽点间隔是否合理（不能太密也不能太稀）？爽点类型是否多样？
7. 冲突递进：卷与卷之间的冲突是否有升级？是否有冲突重复？`;

  const prompt = `请检查以下完整的故事规划，找出所有一致性问题。

${planSummary}

请以JSON格式返回校验结果：
{
  "overallScore": 8,
  "passed": true,
  "summary": "整体规划质量评估",
  "issues": [
    {
      "type": "hook/foreshadow/character/mainline/emotion/pleasure/conflict",
      "severity": "critical/high/medium/low",
      "description": "问题描述",
      "chapters": [3, 45],
      "suggestion": "修复建议"
    }
  ],
  "hookStatus": {
    "total": 45,
    "resolved": 42,
    "unresolved": ["未回收钩子1", "未回收钩子2"]
  },
  "emotionRhythm": {
    "climaxDensity": "合理/过密/过疏",
    "breathingSpacing": "合理/过密/过疏",
    "issues": ["连续高潮：第10-13章"]
  }
}

评分标准：
- 9-10分：完美规划，无任何问题
- 7-8分：良好规划，有少量小问题
- 5-6分：一般规划，有中等问题需要修复
- 3-4分：较差规划，有严重问题
- 1-2分：不可用，需要重新规划

passed = overallScore >= 6`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 2000 });
  return parseLlmJson(result) || {};
}
