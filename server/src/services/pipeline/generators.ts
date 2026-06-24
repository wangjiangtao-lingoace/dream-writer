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
- 绝不能丢失用户创意中的任何重要细节、人物设定、情节设计

语言要求：
- 使用通俗白话，像真人作者写给编辑看的策划文档，不要书面腔
- 禁止 AI 味词汇：不禁、不由得、宛如、仿佛、似乎在诉说、一缕、一抹、一丝、缓缓、淡淡地、静静地、默默地、轻轻地、娓娓道来、令人叹为观止
- 禁止空洞修饰语和万能形容词：深刻地、极大地、令人震撼的、无与伦比的
- 每个字段的描述必须包含具体信息（人名、地名、事件、因果），不能用抽象概括代替

质量要求：
- 大纲必须足够详细，能支撑起一部 100 万字以上的长篇小说
- plotStructure 共 8 个阶段，每个阶段必须包含至少 3 个具体的情节事件（人名+地名+发生了什么），不能只写一句话概括
- protagonist 和 antagonist 必须有完整的动机链和行为逻辑
- mainConflict 必须说明冲突的起因、升级方式、最终如何收束`;

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
    "setup": "开篇建立（前5%）：世界观呈现、主角出场、核心冲突引入，必须有具体事件和场景",
    "rising_action": "上升发展（5%-20%）：主角被迫卷入冲突、初步对抗、能力/资源积累，至少3个具体事件",
    "first_climax": "第一高潮（20%-35%）：阶段性胜利或重大挫败，主角处境根本性改变",
    "deepening": "深度发展（35%-55%）：势力博弈、关系变化、世界观扩展、暗线推进，至少3个具体事件",
    "major_turning": "重大转折（55%-70%）：核心真相揭露、阵营变化、主角认知颠覆",
    "escalation": "冲突升级（70%-85%）：多方势力全面碰撞、代价升级、主角面临终极抉择",
    "final_climax": "最终高潮（85%-95%）：主线冲突的决定性对决，所有伏线汇聚",
    "resolution": "收束结局（95%-100%）：冲突收束、角色归宿、主题升华"
  },
  "highlights": "从素材中提取亮点，如无则提炼3个核心卖点",
  "targetAudience": "从素材中提取目标读者，如无则补充"
}

注意：输出的每个字段都应该尽量详细，保留原文的生动表达，不要压缩成干巴巴的概括。plotStructure 的 8 个阶段都必须填写。`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 6000 });
  return parseLlmJson(result) || {};
}

export async function generateOutlineFromStructured(
  ctx: PhaseContext,
  novelId: string,
  structuredData: {
    title: string;
    genre?: string;
    synopsis?: string;
    characters: Array<{ name: string; role?: string; identity?: string; motivation?: string; background?: string; personality?: string }>;
    worldview: { name?: string; summary?: string; rules?: string; powerSystem?: string; geography?: string; factions?: string };
  },
  knowledge: string,
  config: PipelineConfig,
): Promise<any> {
  const system = `你是一位资深网文策划师。用户已提供结构化的人物卡片和世界观设定，你的任务是在此基础上构建完整的故事大纲。

工作原则：
- 用户提供的角色和世界观是核心素材，必须严格基于这些设定来构建大纲
- 不要重新发明角色或世界观，只在已有基础上扩展
- 重点补充：情节结构、冲突设计、角色关系网、剧情走向
- 大纲必须足够详细支撑百万字长篇

语言要求：
- 使用通俗白话，禁止 AI 味词汇：不禁、不由得、宛如、仿佛、缓缓、淡淡地
- 每个字段必须包含具体信息（人名、地名、事件、因果），不能用抽象概括代替`;

  const charactersText = structuredData.characters.map((c, i) =>
    `${i + 1}. ${c.name}${c.role ? `（${c.role}）` : ""}${c.identity ? ` — ${c.identity}` : ""}${c.motivation ? `，动机：${c.motivation}` : ""}${c.personality ? `，性格：${c.personality}` : ""}${c.background ? `，背景：${c.background}` : ""}`
  ).join("\n");

  const worldviewText = [
    structuredData.worldview.name && `名称：${structuredData.worldview.name}`,
    structuredData.worldview.summary && `概述：${structuredData.worldview.summary}`,
    structuredData.worldview.rules && `规则：${structuredData.worldview.rules}`,
    structuredData.worldview.powerSystem && `力量体系：${structuredData.worldview.powerSystem}`,
    structuredData.worldview.geography && `地理：${structuredData.worldview.geography}`,
    structuredData.worldview.factions && `势力：${structuredData.worldview.factions}`,
  ].filter(Boolean).join("\n");

  const prompt = `请基于以下已有的人物卡片和世界观设定，构建完整的故事大纲。

【作品信息】
标题：${structuredData.title}
类型：${config.genre || structuredData.genre || "自动判断"}
${structuredData.synopsis ? `简介：${structuredData.synopsis}` : ""}

【人物卡片】
${charactersText}

【世界观设定】
${worldviewText}

${knowledge ? `【参考知识】\n${knowledge}\n` : ""}

你的任务：
1. 以这些人物和世界观为基础，构建完整的情节结构
2. 设计角色之间的关系网络和冲突线
3. 规划从开篇到结局的剧情走向
4. 确保大纲中的所有角色和设定都来自用户提供的素材

请生成JSON格式的大纲：
{
  "title": "${structuredData.title}",
  "genre": "${config.genre || structuredData.genre || ""}",
  "theme": "核心主题（基于已有设定推导）",
  "hook": "开篇钩子（具体场景描述）",
  "coreSetting": "核心设定（整合世界观）",
  "mainConflict": "主要冲突（基于角色动机和世界观推导）",
  "protagonist": {
    "name": "主角名（从人物卡中选）",
    "identity": "身份",
    "goal": "短期和长期目标",
    "growth": "成长线"
  },
  "antagonist": {
    "name": "反派名（从人物卡中选或创建）",
    "identity": "身份",
    "motivation": "动机"
  },
  "characterRelations": "角色关系网概述",
  "plotStructure": {
    "setup": "开篇建立（前5%）：世界观呈现、主角出场、核心冲突引入，必须有具体事件",
    "rising_action": "上升发展（5%-20%）：至少3个具体事件",
    "first_climax": "第一高潮（20%-35%）：阶段性胜利或重大挫败",
    "deepening": "深度发展（35%-55%）：至少3个具体事件",
    "major_turning": "重大转折（55%-70%）：核心真相揭露",
    "escalation": "冲突升级（70%-85%）：多方势力碰撞",
    "final_climax": "最终高潮（85%-95%）：决定性对决",
    "resolution": "收束结局（95%-100%）：冲突收束"
  },
  "highlights": "3个核心卖点",
  "targetAudience": "目标读者"
}

注意：plotStructure 的 8 个阶段都必须填写，每个阶段至少包含 2-3 个具体情节事件（人名+事件）。`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 6000 });
  if (!result) {
    console.error("[generateOutlineFromStructured] LLM returned null - call failed");
  } else {
    const parsed = parseLlmJson(result);
    if (!parsed) {
      console.error("[generateOutlineFromStructured] JSON parse failed, raw output (first 500 chars):", result.substring(0, 500));
    }
    return parsed || {};
  }
  return {};
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
- 保留原文的生动表达和独特设定

核心约束：
1. 所有生成内容必须与提供的大纲保持严格一致
2. 不得引入与已有设定矛盾的新元素
3. 力量体系、规则必须与大纲中的描述一致`;

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

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
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
- 保留原文的人物特色和关系描述

核心约束：
1. 所有生成内容必须与提供的大纲、世界观保持严格一致
2. 人物能力必须与世界观的力量体系匹配
3. 人物关系必须与大纲中的描述一致
4. 不得引入与已有设定矛盾的新元素`;

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
  worldview: any,
  characters: any,
  config: PipelineConfig,
  userHint?: string,
): Promise<any> {
  const system = `你是一位资深网文风格顾问，擅长设计能有效约束写作的风格体系。
你的核心任务是：基于大纲中的风格描述，设计一套具体、可执行的风格约束，让每一段文字都能体现出统一的风格调性。

工作原则：
- 大纲中的风格描述是核心素材，必须最大程度保留原文内容
- 风格约束必须具体到可执行层面，不能只是抽象标签
- 要考虑反差、幽默、紧张感等情绪节奏的控制方式
- 风格描述必须与世界观的时代背景、人物性格相匹配

核心约束：
1. 所有生成内容必须与提供的大纲、世界观、人物设定保持严格一致
2. 不得引入与已有设定矛盾的新元素
3. 风格基调必须与世界观的时代背景匹配（如古代背景不应出现现代网络用语）`;

  const worldviewBrief = worldview?.name ? `${worldview.name}：${worldview.summary || ""}\n规则：${worldview.rules || "无"}` : JSON.stringify(worldview || {}, null, 2);
  const characterBrief = Array.isArray(characters?.characters)
    ? characters.characters.map((c: any) => `${c.name}（${c.role || ""}）：${c.personality || c.motivation || ""}`).join("\n")
    : JSON.stringify(characters || {}, null, 2);

  const prompt = `请分析以下大纲中的风格描述，设计一套完整的风格约束体系。

【大纲】
${JSON.stringify(outline, null, 2)}

【世界观】
${worldviewBrief}

【人物设定】
${characterBrief}

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
  ],

  "masterWriterStyle": "模仿的作家风格描述。根据作品类型，指定模仿哪位白金大神的风格。例如都市类：「以起点白金大神的风格写作：开篇直接进入冲突，对话简洁有力，节奏明快，主角人设清晰（有能力但不无敌），配角有记忆点，每章末留钩子」。如果是玄幻类：「以网文大神的风格写作：爽点密集，升级节奏明确，战斗描写热血，配角有特色口头禅」。如果是言情类：「以晋江大神的风格写作：情感细腻但不拖沓，对话有张力，误会和解误会节奏好，配角有搞笑担当」。",

  "styleDna": {
    "readerEmotion": ["读者在每个阶段应感受到的情绪，如：开局就笑、三章一个反转、十章一个大高潮"],
    "payoffMechanisms": ["本书的核心爽点机制，如：身份反差、扮猪吃虎、打脸装逼"],
    "rhythmRules": {
      "hookEvery": 500,
      "jokeEvery": 700,
      "payoffEvery": 1500
    },
    "languageRules": {
      "sentence": "短句为主/长短句结合/长句为主",
      "dialogueRatio": 0.4,
      "narrationRatio": 0.6
    },
    "forbiddenPatterns": ["绝对禁止的写法模式，如：文青式环境渲染、哲学感悟、大段设定解释"],
    "requiredPatterns": ["每章必须遵守的写法，如：每段必须有信息增量、对话必须推进剧情"]
  }
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
- 卷与卷之间的衔接要自然，不能突兀跳转
- 每卷必须规划至少 2 个伏笔，注明预计回收时机
- 每卷必须说明主要角色的成长变化
- 根据总字数合理分配每卷字数

核心约束：
1. 所有生成内容必须与提供的大纲、世界观、人物设定、风格保持严格一致
2. 不得引入与已有设定矛盾的新元素
3. 卷中涉及的场景必须存在于世界观的地理设定中
4. 人物在各卷中的行为必须符合其性格和动机

语言要求：
- 使用通俗白话，禁止 AI 味词汇（不禁、不由得、宛如、仿佛、缓缓、淡淡地、静静地、默默地、轻轻地、娓娓道来）
- 禁止空洞修饰语，每个描述必须包含具体信息（人名、事件、因果关系）
- 不要写"本卷将探索…"、"读者将感受到…"这类 AI 套话

卷纲质量要求：
- 每卷的 keyEvents 至少包含 5 个具体事件，每个事件需说明涉及谁、发生了什么、导致什么结果
- turningPoint 必须说明转折的具体内容和对主角的影响
- climax 必须描述高潮场景的核心冲突和胜负手
- endHook 必须是具体的悬念事件，不能是抽象的"更大的挑战即将到来"
- 卷与卷之间必须有明确的承接关系：上一卷的 endHook 在下一卷如何被接住
- newChars 必须说明该角色为何在这一卷出场，与主线有什么关系`;

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
      "climax": "本卷高潮（最精彩的部分）",
      "foreshadowsPlanned": [
        {"title": "伏笔名称", "plantChapter": "预计埋设章节", "plannedPayoff": "预计回收时机", "description": "伏笔内容描述"}
      ],
      "characterArcs": [
        {"characterName": "角色名", "startState": "本卷开始时的状态", "endState": "本卷结束时的状态", "keyChange": "关键转变事件"}
      ],
      "targetWordCount": 本卷建议字数
    }
  ]
}

注意：
- 每卷的 title 要有吸引力，能概括本卷主题
- goal 必须是具体的目标，不能是模糊的描述
- conflict 要说明具体的冲突双方和焦点
- endHook 要有具体的悬念，不能只是"留个钩子"
- keyEvents 列出本卷至少 5 个具体事件，每个事件需说明涉及谁、发生了什么、导致什么结果
- turningPoint 和 climax 必须是具体的事件描述
- foreshadowsPlanned 至少规划 2 个伏笔，注明预计埋设章节和回收时机
- characterArcs 说明本卷主要角色的起止状态和关键转变
- targetWordCount 根据总字数和卷数合理分配`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 16000 });
  if (!result) {
    console.error("[generateVolumeOutline] LLM returned null - call failed");
  } else {
    const parsed = parseLlmJson(result);
    if (!parsed) {
      console.error("[generateVolumeOutline] JSON parse failed, raw output (first 500 chars):", result.substring(0, 500));
    }
    return parsed || {};
  }
  return {};
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
- 人物成长和关系变化要有自然的过渡

核心约束：
1. 所有生成内容必须与提供的大纲、世界观、人物设定、风格保持严格一致
2. 章节中人物的行为必须符合其性格设定和能力水平
3. 场景必须存在于世界观设定中
4. 冲突必须符合世界观的力量体系规则

语言要求：
- 使用通俗白话，禁止 AI 味词汇（不禁、不由得、宛如、仿佛、缓缓、淡淡地、静静地、默默地、轻轻地）
- 禁止空洞修饰，每个字段都要有具体信息

章纲质量要求——每章必须独立可执行：
- goal：不能只写"推进剧情"，必须说明本章要完成什么具体事件
- conflict：不能只写"面临挑战"，必须说明谁和谁冲突、冲突的核心矛盾是什么
- hook：不能只写"留下悬念"，必须写出具体的悬念内容（某人说了什么话、发现了什么东西、做了什么决定）
- 以上字段即使脱离上下文，一个写手也能据此写出完整章节`;

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
- 要考虑风格调性：如果风格偏轻松幽默，钩子也可以有趣味性；如果风格偏压抑紧张，钩子要更有压迫感

核心约束：
1. 所有生成内容必须与提供的大纲、世界观、人物设定保持严格一致
2. 主线和钩子必须与世界观规则和人物动机一致
3. 不得引入与已有设定矛盾的新元素`;

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
  batchStart?: number,
  batchEnd?: number,
): Promise<any> {
  const totalChaptersPerVolume = config.chaptersPerVolume || 30;
  const chaptersPerVolume = (batchStart !== undefined && batchEnd !== undefined)
    ? batchEnd - batchStart
    : totalChaptersPerVolume;
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
- 情绪曲线要有起伏，不能全是高潮或全是低谷
- 每章必须指定具体的场景地点，不能模糊
- 明确本章的视角角色，多视角小说每章需切换视角
- 根据章节重要性分配字数：开篇/高潮/转折章 4000-5000 字，普通推进章 2000-3000 字

核心约束：
1. 所有生成内容必须与提供的大纲、世界观、人物设定、风格保持严格一致
2. 章节中人物的行为必须符合其性格设定和能力水平
3. 场景必须存在于世界观设定中
4. 冲突必须符合世界观的力量体系规则
5. 不得引入与已有设定矛盾的新元素

语言要求：
- 使用通俗白话，禁止 AI 味词汇（不禁、不由得、宛如、仿佛、缓缓、淡淡地、静静地、默默地、轻轻地）
- 禁止空洞修饰，每个字段都要有具体信息

章纲质量要求——每章必须独立可执行：
- goal：不能只写"推进剧情"，必须说明本章要完成什么具体事件
- conflict：不能只写"面临挑战"，必须说明谁和谁冲突、核心矛盾是什么
- hook：不能只写"留下悬念"，必须写出具体的悬念内容
- characters：必须列出本章出场的角色及其在本章的具体行为
- 以上所有字段必须做到：一个写手即使不看上下文，仅凭单章章纲也能写出完整章节`;

  const characterProfiles = Array.isArray(characters?.characters)
    ? characters.characters.map((c: any) => `${c.name}（${c.role || ""}）：身份=${c.identity || ""}，性格=${c.personality || ""}，能力=${c.abilities || ""}，动机=${c.motivation || ""}`).join("\n")
    : JSON.stringify(characters || {}, null, 2);

  const chapterRangeDesc = (batchStart !== undefined && batchEnd !== undefined)
    ? `请为第${volumeNumber}卷的第${batchStart + 1}到第${batchEnd}章设计详细章纲。`
    : `请为第${volumeNumber}卷设计${chaptersPerVolume}章的详细章纲。`;

  const prompt = `${chapterRangeDesc}

【故事大纲】
${typeof outline === "string" ? outline : JSON.stringify(outline, null, 2)}

【第${volumeNumber}卷卷纲】
${JSON.stringify(volume, null, 2)}

【世界观规则】（创作时必须遵守）
${worldview?.name ? `${worldview.name}：${worldview.summary || ""}\n规则：${worldview.rules || "无"}\n力量体系：${typeof worldview.powerSystem === "string" ? worldview.powerSystem : JSON.stringify(worldview.powerSystem || {})}` : JSON.stringify(worldview || {}, null, 2)}

【人物档案】（创作时必须严格参照，人物行为不得与设定矛盾）
${characterProfiles}

【风格约束】
${style?.name ? `${style.name}：${style.description || ""}` : JSON.stringify(style || {}, null, 2)}
${previousSummary ? `\n【前序卷章纲摘要】\n${previousSummary}` : ""}
${userHint ? `\n【用户修改意见】\n${userHint}` : ""}

请生成JSON格式的富化章纲，每章必须包含以下字段：
{
  "chapters": [
    {
      "title": "章节标题（要有吸引力）",
      "chapterType": "章节类型（见下方说明）",
      "scene": "本章发生的具体场景/地点",
      "pov": "本章的视角角色名",
      "targetWordCount": 3000,
      "goal": "本章目标（推进什么剧情）",
      "conflict": "本章核心冲突",
      "emotion": "情绪基调（紧张/温馨/热血/压抑/轻松/悲伤等）",
      "hook": "章末钩子（如何吸引读者看下一章）",
      "readerPromise": "本章让读者看到什么（具体承诺）",
      "chapterFunction": "兑现什么+开启什么（一句话）",
      "requiredReaderEmotion": ["读者应感受到的情绪1", "情绪2"],
      "payoffChainRefs": ["爽点链名称.阶段描述"],
      "comedyMechanism": "喜剧机制（如适用，否则留空）",
      "endingQuestion": "章末悬念问题（读者会问什么）",
      "mustDo": ["必须完成的事项1（具体可执行）", "必须完成的事项2"],
      "mustNotDo": ["禁止完成的事项1（防止剧透或偏离）", "禁止完成的事项2"],
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

章节类型 chapterType 说明：
- task_trigger：任务触发章（开启新任务/新目标）
- mission：任务执行章（完成具体任务）
- payoff：爽点兑现章（释放爽点，读者情绪高涨）
- comedy_daily：喜剧日常章（轻松搞笑，缓冲节奏）
- relationship：人物关系章（升温/冲突/和解）
- danger_escalation：危机升级章（危险逼近，紧张感累积）
- info_reveal：信息揭露章（揭示秘密/真相）
- transition：过渡章（承上启下，铺垫下一阶段）

注意：
- scene 必须是世界观中已设定的具体地点，不能模糊写"某处"
- pov 必须是人物档案中的角色名
- targetWordCount 根据章节重要性分配：开篇/高潮/转折章 4000-5000，普通推进章 2000-3000
- 如果本章没有埋设钩子，hooksPlanted 设为空数组 []
- 如果本章没有回收钩子，hooksResolved 设为空数组 []
- 伏笔同理
- 每5-8章至少有一个爽点
- 情绪曲线要有起伏，连续高潮不超过3章，连续低谷不超过5章
- 开篇章节必须有强钩子
- 所有钩子和伏笔的 plannedResolveChapter/plannedPayoffChapter 必须是有效的章节编号`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 8000 });
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
  // 优先使用 enrichedSummary（含 conflict/emotion/characters/hooks/foreshadow），
  // 回退到原始 chapterOutlines 构建基础摘要
  const chapterSummary = allChapterOutlines?.enrichedSummary
    || (allChapterOutlines?.chapterOutlines || []).flatMap((group: any, volIdx: number) =>
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

  // 收集章纲中已埋的钩子和伏笔标题列表，供交叉引用提示使用
  const plantedHookTitles = chapterSummary
    .flatMap((ch: any) => ch.hooksPlanted || [])
    .filter(Boolean);
  const plantedForeshadowTitles = chapterSummary
    .flatMap((ch: any) => ch.foreshadowPlanted || [])
    .filter(Boolean);

  const system = `你是一位资深网文故事弧线设计师，擅长规划长篇小说的主线脉络和跨卷钩子。

设计原则：
- 主线必须贯穿全文，有明确的起点和终点
- 支线必须服务于主线，不能喧宾夺主，且需要有自身的起止、冲突和解决
- 跨卷钩子要有递进关系，强度逐步升级
- 情绪曲线要有整体节奏感：三章一小高潮，十章大高潮
- 伏笔的埋设和回收要形成完整闭环
- 主线的里程碑事件必须被章节的 goal 覆盖
- 每个里程碑必须标明类型（turning_point/climax/reveal/sacrifice/growth）和因果关系

核心约束：
1. 所有生成内容必须与提供的大纲、世界观、人物设定、风格保持严格一致
2. 主线和钩子必须与世界观规则和人物动机一致
3. 不得引入与已有设定矛盾的新元素
4. 跨卷钩子应与章纲中已埋的钩子关联或补充，避免重复`;

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

【风格要求】
${style?.name ? `${style.name}：${style.description || ""}\n基调：${style.toneAndAtmosphere || ""}\n情绪节奏：${style.emotionalRhythm || ""}` : JSON.stringify(style || {}, null, 2)}

${plantedHookTitles.length > 0 ? `【章纲中已埋的钩子（供交叉引用，避免重复）】\n${plantedHookTitles.join("、")}\n` : ""}
${plantedForeshadowTitles.length > 0 ? `【章纲中已埋的伏笔（供交叉引用）】\n${plantedForeshadowTitles.join("、")}\n` : ""}

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
        {
          "chapter": 15,
          "event": "里程碑事件描述",
          "type": "turning_point|climax|reveal|sacrifice|growth",
          "characters": ["相关角色A", "相关角色B"],
          "causeEffect": "因为X导致Y"
        }
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
      "resolvedChapter": 120,
      "relatedPlantedHook": "关联的章纲钩子标题（如有，否则留空）"
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
- 每条主线的 milestones 至少3个，分布于起始、中段、高潮
- 副线（type="sub"）必须包含 startChapter/endChapter，明确与主线的交汇点和自身冲突
- 跨卷钩子至少5-8个，分布 across 不同卷
- 跨卷钩子应检查是否与章纲中已埋的钩子关联，已有关联的用 relatedPlantedHook 字段标注
- 每个里程碑事件必须对应到具体的章节编号
- 里程碑的 type 字段必须是 turning_point/climax/reveal/sacrifice/growth 之一
- 情绪曲线的章节编号必须在 1-${totalChapters} 范围内`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 5000 });
  return parseLlmJson(result) || {};
}

export async function generateConsistencyCheck(
  ctx: PhaseContext,
  novelId: string,
  planSummary: string,
  outline?: any,
  worldview?: any,
  characters?: any,
  style?: any,
  programmaticSummary?: string,
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
7. 冲突递进：卷与卷之间的冲突是否有升级？是否有冲突重复？
8. 人物一致性：角色名、能力、性格是否前后一致，是否符合人物设定？人物行为是否符合其动机和性格？
9. 世界观一致性：场景、规则、力量体系是否前后一致？是否有违反世界观规则的情节？
10. 风格一致性：叙事风格、语调是否统一？是否有风格突变？`;

  let coreAssets = "";
  if (outline) {
    coreAssets += `\n\n【大纲】\n${typeof outline === "string" ? outline : JSON.stringify(outline, null, 2)}`;
  }
  if (worldview) {
    coreAssets += `\n\n【世界观】\n${JSON.stringify(worldview, null, 2)}`;
  }
  if (characters) {
    coreAssets += `\n\n【人物设定】\n${JSON.stringify(characters, null, 2)}`;
  }
  if (style) {
    coreAssets += `\n\n【风格设定】\n${JSON.stringify(style, null, 2)}`;
  }

  const programmaticSection = programmaticSummary
    ? `\n\n【程序化预检已发现的问题（需要重点关注和确认）】\n${programmaticSummary}`
    : "";

  const prompt = `请检查以下完整的故事规划，找出所有一致性问题。
${coreAssets}

【章节规划摘要】
${planSummary}
${programmaticSection}

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

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.3, maxTokens: 4000 });
  return parseLlmJson(result) || {};
}

// ===== Beat 级写作蓝图 =====

export async function generateChapterBeats(
  ctx: PhaseContext,
  chapterOutline: any,
  styleDna: any,
  chapterOrder: number,
  targetWordCount: number,
): Promise<any> {
  const system = `你是一位资深网文节奏设计师，擅长将章节规划拆解为精确的节奏单元（Beat）。

每个 Beat 是一个功能明确的节奏单元，章节正文将按 Beat 顺序生成。

Beat 类型定义：
- hook：开篇钩子，制造好奇（200-400字）
- conflict：冲突推进（400-800字）
- dialogue：对话场景，揭示人物/推进剧情（300-600字）
- payoff：爽点释放（300-500字）
- twist：反转（200-400字）
- transition：过渡/铺垫（200-300字）
- reveal：信息揭露（300-500字）
- emotional：情感场景（300-500字）
- hook_end：章末钩子（200-300字）

设计原则：
- 第一个 Beat 必须是 hook 类型（开篇必须吸引读者）
- 最后一个 Beat 必须是 hook_end 类型（章末必须留悬念）
- 每 2-3 个 Beat 必须有一个高能量类型（payoff/twist/reveal）
- 对话类 Beat 不超过总字数的 40%
- 过渡类 Beat 不超过 1 个
- 每个 Beat 必须有明确的目标，不能写"继续推进剧情"`;

  const dnaHint = styleDna?.rhythmRules
    ? `\n【风格 DNA 节奏规则】\n钩子间隔：每 ${styleDna.rhythmRules.hookEvery || 500} 字\n笑点间隔：每 ${styleDna.rhythmRules.jokeEvery || 700} 字\n爽点间隔：每 ${styleDna.rhythmRules.payoffEvery || 1500} 字`
    : '';

  const prompt = `请为以下章节设计 Beat 列表。

【章节信息】
第${chapterOrder}章 ${chapterOutline.title || "未命名"}
目标字数：${targetWordCount}字
章节目标：${chapterOutline.goal || "无"}
核心冲突：${chapterOutline.conflict || "无"}
情绪基调：${chapterOutline.emotion || "无"}
章末钩子：${chapterOutline.hook || "无"}
${chapterOutline.mustDo ? `必须完成：${chapterOutline.mustDo}` : ""}
${chapterOutline.mustNotDo ? `禁止完成：${chapterOutline.mustNotDo}` : ""}
${dnaHint}

请生成JSON格式的Beat列表：
{
  "beats": [
    {
      "type": "hook/conflict/dialogue/payoff/twist/transition/reveal/emotional/hook_end",
      "goal": "本Beat的具体目标（必须可执行，写手据此能写出完整段落）",
      "wordTarget": 300,
      "mustInclude": ["必须包含的元素1", "必须包含的元素2"],
      "mustAvoid": ["必须避免的元素1", "必须避免的元素2"]
    }
  ]
}

要求：
- 总字数目标 = ${targetWordCount}字（各 Beat wordTarget 之和应接近此值）
- 第一个 Beat 必须是 hook 类型
- 最后一个 Beat 必须是 hook_end 类型
- 每 2-3 个 Beat 必须有一个高能量类型（payoff/twist/reveal）
- dialogue 类型 Beat 的总字数不超过 ${Math.round(targetWordCount * 0.4)}字
- transition 类型最多 1 个
- 每个 goal 必须具体（谁+做什么+达到什么效果）
- mustInclude：列出该 Beat 必须包含的具体元素（人物、场景、动作、情绪等）
- mustAvoid：列出该 Beat 必须避免的问题（跳章、水字数、AI味等）`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 2000 });
  return parseLlmJson(result) || {};
}

// ===== 爽点链生成 =====

export async function generatePayoffChains(
  ctx: PhaseContext,
  novelId: string,
  outline: any,
  volumes: any,
  config: PipelineConfig,
): Promise<any> {
  const totalChapters = (config.volumeCount || 5) * (config.chaptersPerVolume || 30);

  const system = `你是一位资深网文爽点设计师，擅长规划跨章节的爽点节奏链。

核心理念：网文读者追的不是剧情，是爽点节奏。
爽点链是一个递进式的情绪释放序列，读者追的就是这个链条的逐步升级。

设计原则：
- 每条爽点链必须有明确的递进关系：轻度爽 → 中度爽 → 高度爽 → 终极释放
- 链与链之间要有交叉和联动，不能完全独立
- 阶段之间必须有因果关系，不能跳跃
- 每个事件必须具体（谁+做了什么+导致什么结果）
- 爽点类型要多样：实力展示、身份反差、打脸、逆袭、关系升级、意外收获

语言要求：
- 使用通俗白话，禁止 AI 味词汇
- 每个事件描述必须包含具体信息`;

  const outlineBrief = typeof outline === "string"
    ? outline
    : `标题：${outline?.title || "未命名"}\n类型：${config.genre || outline?.genre || "自动判断"}\n主题：${outline?.theme || "无"}\n主角：${outline?.protagonist?.name || "无"}\n冲突：${outline?.mainConflict || "无"}`;

  const volumeBrief = volumes?.volumes
    ? volumes.volumes.map((v: any, i: number) => `第${i + 1}卷：${v.title || "未命名"} — ${v.goal || "无目标"}`).join("\n")
    : "无卷纲";

  const prompt = `请根据以下信息，规划核心爽点链。

【故事大纲】
${outlineBrief}

【卷纲】
${volumeBrief}

【总章数】${totalChapters}章

请生成JSON格式的爽点链：
{
  "payoffChains": [
    {
      "name": "链名称（如：老祖打工链、身份反差链、实力升级链）",
      "description": "链描述（一句话说明这条链的核心爽点）",
      "stages": [
        {"chapter": 3, "event": "第一阶段事件（轻度爽，具体描述谁做了什么）"},
        {"chapter": 15, "event": "第二阶段事件（中度爽）"},
        {"chapter": 40, "event": "第三阶段事件（高度爽）"},
        {"chapter": 80, "event": "第四阶段事件（超级爽）"},
        {"chapter": 120, "event": "终极释放（最爽的时刻）"}
      ]
    }
  ]
}

要求：
- 至少 2-3 条爽点链，覆盖不同类型（升级/反转/关系变化/实力展示）
- 每条链 4-6 个阶段，分布在整个作品中（不能全集中在前半段）
- 阶段之间必须有递进关系，后面的事件要比前面的更爽
- 每个事件必须具体（人名+具体行为+结果）
- 链与链之间可以有交叉点（某个事件同时推进两条链）`;

  const result = await ctx.llmService.completeText({ system, prompt, temperature: 0.7, maxTokens: 3000 });
  return parseLlmJson(result) || {};
}
