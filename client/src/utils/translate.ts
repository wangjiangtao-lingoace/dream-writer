/**
 * 翻译工具函数
 * 用于将英文状态、类型等翻译为中文，配合图标显示
 */

// 章节状态翻译
export function translateChapterStatus(status: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    'planned': { icon: '📋', label: '已计划' },
    'drafted': { icon: '✏️', label: '已草稿' },
    'completed': { icon: '✅', label: '已完成' },
    'reviewing': { icon: '🔍', label: '审核中' },
    'published': { icon: '📢', label: '已发布' },
  };
  return map[status] || { icon: '❓', label: status };
}

// 章节来源翻译
export function translateChapterSource(source: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    'manual': { icon: '✋', label: '手动' },
    'ai_generated': { icon: '🤖', label: 'AI生成' },
    'imported': { icon: '📥', label: '导入' },
    'ai_continued': { icon: '🔄', label: 'AI续写' },
    'imitation_pipeline': { icon: '🏗️', label: '仿写流水线' },
    'pipeline': { icon: '⚙️', label: '流水线' },
  };
  return map[source] || { icon: '❓', label: source };
}

// Pipeline状态翻译
export function translatePipelineStatus(status: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    'pending': { icon: '⏳', label: '等待中' },
    'running': { icon: '🔄', label: '运行中' },
    'paused': { icon: '⏸️', label: '已暂停' },
    'completed': { icon: '✅', label: '已完成' },
    'failed': { icon: '❌', label: '失败' },
    'error': { icon: '❌', label: '出错' },
    'cancelled': { icon: '🚫', label: '已取消' },
  };
  return map[status] || { icon: '❓', label: status };
}

// Pipeline阶段翻译
export function translatePipelinePhase(phase: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    'planning': { icon: '📝', label: '规划' },
    'structuring': { icon: '🏗️', label: '结构化' },
    'generating': { icon: '✍️', label: '生成' },
    'reviewing': { icon: '🔍', label: '审核' },
    'polishing': { icon: '✨', label: '润色' },
  };
  return map[phase] || { icon: '❓', label: phase };
}

// 人物角色翻译
export function translateCharacterRole(role: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    '主角': { icon: '👑', label: '主角' },
    '反派': { icon: '😈', label: '反派' },
    '配角': { icon: '👥', label: '配角' },
    '龙套': { icon: '👤', label: '龙套' },
    '导师': { icon: '🎓', label: '导师' },
    '盟友': { icon: '🤝', label: '盟友' },
    '亦正亦邪': { icon: '🎭', label: '亦正亦邪' },
    // 网文类型
    '系统': { icon: '💻', label: '系统/金手指' },
    '后宫': { icon: '💕', label: '后宫' },
    '小弟': { icon: '👊', label: '小弟' },
    '师父': { icon: '🧘', label: '师父' },
    // 经典叙事类型
    '旁白': { icon: '📖', label: '旁白/叙述者' },
    '牺牲者': { icon: '🕯️', label: '牺牲者' },
    '守护者': { icon: '🛡️', label: '守护者' },
    '背叛者': { icon: '🗡️', label: '背叛者' },
    '催化剂': { icon: '⚡', label: '催化剂' },
    '信使': { icon: '🕊️', label: '信使' },
    '变形者': { icon: '🦋', label: '变形者' },
    '影子': { icon: '👤', label: '影子' },
  };
  return map[role] || { icon: '👤', label: role };
}

// 世界观字段翻译
export function translateWorldviewKey(key: string): string {
  const map: Record<string, string> = {
    'summary': '概述',
    'rules': '世界规则',
    'powerSystem': '力量体系',
    'geography': '地理环境',
    'factions': '势力派系',
    'history': '历史背景',
    'culture': '文化风俗',
    'magic': '魔法体系',
    'technology': '科技水平',
    'religion': '宗教信仰',
    'economy': '经济体系',
  };
  return map[key] || key;
}

// 大纲字段翻译
export function translateOutlineKey(key: string): string {
  const map: Record<string, string> = {
    'title': '标题',
    'summary': '摘要',
    'chapters': '章节',
    'plot': '情节',
    'conflict': '冲突',
    'resolution': '结局',
    'theme': '主题',
    'setting': '背景',
    'characters': '人物',
    'timeline': '时间线',
    'foreshadow': '伏笔',
    'climax': '高潮',
  };
  return map[key] || key;
}

// 知识库类型翻译
export function translateKnowledgeType(type: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    'character': { icon: '👤', label: '人物' },
    'worldview': { icon: '🌍', label: '世界观' },
    'plot': { icon: '📖', label: '情节' },
    'setting': { icon: '🏙️', label: '背景' },
    'style': { icon: '✍️', label: '风格' },
    'template': { icon: '📋', label: '模板' },
    'reference': { icon: '📚', label: '参考' },
  };
  return map[type] || { icon: '📄', label: type };
}

// 记忆类型翻译
export function translateMemoryType(type: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    'character': { icon: '👤', label: '人物记忆' },
    'plot': { icon: '📖', label: '情节记忆' },
    'world': { icon: '🌍', label: '世界记忆' },
    'style': { icon: '✍️', label: '风格记忆' },
    'user': { icon: '👤', label: '用户偏好' },
    'feedback': { icon: '💬', label: '反馈' },
    'project': { icon: '📁', label: '项目' },
    'reference': { icon: '📚', label: '参考' },
  };
  return map[type] || { icon: '📝', label: type };
}

// 资产采用状态key翻译
export function translateAdoptionKey(key: string): string {
  const map: Record<string, string> = {
    'bookAnalysis': '拆书分析',
    'imitation': '仿写计划',
    'blueprint': '创作蓝图',
    'chapterTemplate': '章节模板',
    'knowledgeAssets': '知识资产',
    'memories': '记忆',
    'characters': '人物',
    'worldviews': '世界观',
    'outline': '大纲',
    'pipeline': '流水线',
  };
  return map[key] || key;
}

// 资产采用状态value翻译
export function translateAdoptionValue(value: string): string {
  const map: Record<string, string> = {
    'Pipeline completed': '流水线已完成',
    'Pipeline running': '流水线运行中',
    'Pipeline pending': '流水线等待中',
    'Pipeline failed': '流水线失败',
    'Not started': '未开始',
    'In progress': '进行中',
    'Completed': '已完成',
    'Failed': '失败',
    'Pending': '等待中',
    'Running': '运行中',
  };
  return map[value] || value;
}

// 钩子状态翻译
export function translateHookStatus(status: string): string {
  const map: Record<string, string> = {
    'planted': '已埋设',
    'paid_off': '已回收',
    'expired': '已过期',
    'active': '进行中',
  };
  return map[status] || status;
}

// 主线状态翻译
export function translateMainlineStatus(status: string): string {
  const map: Record<string, string> = {
    'active': '进行中',
    'completed': '已完成',
    'paused': '已暂停',
    'archived': '已归档',
  };
  return map[status] || status;
}

// Pipeline 阶段中文标签
export const pipelinePhaseLabels: Record<string, string> = {
  outline: "大纲规划",
  assets: "基础资产",
  planning: "完整规划",
  consistency_check: "一致性校验",
  writing: "正文生成",
  // legacy
  volumes: "卷纲规划",
  chapter_outline: "章纲规划",
  generation: "资产生成",
  structuring: "结构化阶段",
  quality_check: "质量校验",
};

// Pipeline 步骤中文标签
export const pipelineStepLabels: Record<string, string> = {
  material_import: "素材资产导入",
  analyze: "智能分析",
  decompose: "拆解入库",
  outline: "故事大纲",
  worldview: "世界观设定",
  characters: "人物设定",
  style: "写作风格",
  volume_outline: "卷纲规划",
  story_arcs: "故事弧线",
  consistency: "一致性校验",
  chapter_drafts: "正文样章",
  waiting_confirm: "等待确认",
  // legacy
  volume: "卷纲规划",
  chapter_outline: "章纲规划",
  mainline_hook: "主线钩子",
};

// 翻译 Pipeline 阶段名
export function translatePipelinePhaseLabel(phase: string): string {
  if (pipelinePhaseLabels[phase]) return pipelinePhaseLabels[phase];
  return phase;
}

// 翻译 Pipeline 步骤名（支持 chapter_outline_vol_N 动态格式）
export function translatePipelineStepLabel(step: string): string {
  if (pipelineStepLabels[step]) return pipelineStepLabels[step];
  const volMatch = step.match(/^chapter_outline_vol_(\d+)$/);
  if (volMatch) return `第${volMatch[1]}卷章纲`;
  return step;
}

// 通用字段 labelMap（用于 SmartJsonViewer 等组件）
export const defaultLabelMap: Record<string, string> = {
  // 通用
  title: "标题",
  name: "名称",
  description: "描述",
  summary: "摘要",
  content: "内容",
  status: "状态",
  type: "类型",
  genre: "类型",
  theme: "主题",
  setting: "背景设定",
  tone: "基调",
  style: "风格",
  conflict: "核心冲突",
  resolution: "结局",
  climax: "高潮",
  hook: "钩子",
  goal: "目标",
  motivation: "动机",
  role: "角色",
  tags: "标签",
  order: "序号",
  wordCount: "字数",
  progress: "进度",
  // 人物
  protagonist: "主角设定",
  antagonist: "反派设定",
  characters: "人物",
  age: "年龄",
  gender: "性别",
  appearance: "外貌",
  personality: "性格",
  background: "背景",
  abilities: "能力",
  relationships: "关系",
  // 世界观
  worldview: "世界观",
  rules: "世界规则",
  powerSystem: "力量体系",
  geography: "地理环境",
  factions: "势力派系",
  history: "历史背景",
  culture: "文化风俗",
  magic: "魔法体系",
  technology: "科技水平",
  religion: "宗教信仰",
  economy: "经济体系",
  // 大纲
  outline: "大纲",
  chapters: "章节",
  plot: "情节",
  timeline: "时间线",
  foreshadow: "伏笔",
  foreshadows: "伏笔设计",
  hooks: "钩子设计",
  emotions: "情感曲线",
  pacing: "节奏控制",
  // 蓝图
  targetAudience: "目标读者",
  uniqueSellingPoint: "独特卖点",
  synopsis: "故事梗概",
  openingHook: "开篇钩子",
  themes: "主题列表",
  motifs: "母题列表",
  symbolism: "象征意义",
  // 卷纲
  volumes: "卷结构",
  volumeTitle: "卷标题",
  volumeGoal: "卷目标",
  // 章纲
  chapterOutlines: "章纲列表",
  chapterTitle: "章节标题",
  chapterGoal: "章节目标",
  chapterConflict: "章节冲突",
  // 主线
  mainlines: "主线",
  mainline: "主线",
  // 知识库
  category: "分类",
  assetType: "资产类型",
  usageStage: "使用阶段",
  createdAt: "创建时间",
  updatedAt: "更新时间",
  // Pipeline
  phase: "阶段",
  step: "步骤",
  output: "输出",
  selfScore: "AI评分",
  selfComment: "AI评语",
  currentPhase: "当前阶段",
  currentStep: "当前步骤",
};

// snake_case 转可读中文（fallback）
export function snakeCaseToReadable(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

// 资产类型翻译
export function translateAssetType(type: string): string {
  const map: Record<string, string> = {
    'bookAnalysis': '拆书分析',
    'imitation': '仿写计划',
    'blueprint': '创作蓝图',
    'chapterTemplate': '章节模板',
    'knowledgeAsset': '知识资产',
    'memory': '记忆',
    'character': '人物',
    'worldview': '世界观',
    'outline': '大纲',
    'chapter': '章节',
    'pipeline': '流水线',
  };
  return map[type] || type;
}
