import { prisma } from "../db/prisma";

// 获取或创建剧情状态
export async function getOrCreateStoryState(novelId: string) {
  let state = await prisma.storyState.findUnique({
    where: { novelId },
  });

  if (!state) {
    state = await prisma.storyState.create({
      data: { novelId },
    });
  }

  return state;
}

// 更新剧情状态
export async function updateStoryState(novelId: string, data: {
  currentVolume?: number;
  currentChapter?: number;
  currentPhase?: string;
  mainPlotProgress?: string;
  mainConflict?: string;
  protagonistLevel?: string;
  protagonistGoal?: string;
  protagonistStatus?: string;
  currentEmotion?: string;
  emotionIntensity?: number;
  tensionAccumulation?: number;
  lastPleasureChapter?: number;
  pleasureType?: string;
  pleasureCooldown?: number;
  activeForeshadows?: string[];
  pendingPayoffs?: string[];
  forbiddenActions?: string[];
  allowedActions?: string[];
  readerExpectation?: string;
  readerFatigue?: number;
}) {
  const updateData: Record<string, unknown> = {};
  
  if (data.currentVolume !== undefined) updateData.currentVolume = data.currentVolume;
  if (data.currentChapter !== undefined) updateData.currentChapter = data.currentChapter;
  if (data.currentPhase !== undefined) updateData.currentPhase = data.currentPhase;
  if (data.mainPlotProgress !== undefined) updateData.mainPlotProgress = data.mainPlotProgress;
  if (data.mainConflict !== undefined) updateData.mainConflict = data.mainConflict;
  if (data.protagonistLevel !== undefined) updateData.protagonistLevel = data.protagonistLevel;
  if (data.protagonistGoal !== undefined) updateData.protagonistGoal = data.protagonistGoal;
  if (data.protagonistStatus !== undefined) updateData.protagonistStatus = data.protagonistStatus;
  if (data.currentEmotion !== undefined) updateData.currentEmotion = data.currentEmotion;
  if (data.emotionIntensity !== undefined) updateData.emotionIntensity = data.emotionIntensity;
  if (data.tensionAccumulation !== undefined) updateData.tensionAccumulation = data.tensionAccumulation;
  if (data.lastPleasureChapter !== undefined) updateData.lastPleasureChapter = data.lastPleasureChapter;
  if (data.pleasureType !== undefined) updateData.pleasureType = data.pleasureType;
  if (data.pleasureCooldown !== undefined) updateData.pleasureCooldown = data.pleasureCooldown;
  if (data.activeForeshadows !== undefined) updateData.activeForeshadows = JSON.stringify(data.activeForeshadows);
  if (data.pendingPayoffs !== undefined) updateData.pendingPayoffs = JSON.stringify(data.pendingPayoffs);
  if (data.forbiddenActions !== undefined) updateData.forbiddenActions = JSON.stringify(data.forbiddenActions);
  if (data.allowedActions !== undefined) updateData.allowedActions = JSON.stringify(data.allowedActions);
  if (data.readerExpectation !== undefined) updateData.readerExpectation = data.readerExpectation;
  if (data.readerFatigue !== undefined) updateData.readerFatigue = data.readerFatigue;

  return prisma.storyState.update({
    where: { novelId },
    data: updateData,
  });
}

// 记录爽点
export async function recordPleasurePoint(novelId: string, data: {
  chapterId?: string;
  chapterOrder: number;
  type: string;
  subType?: string;
  intensity: number;
  description?: string;
  characters?: string[];
  conflict?: string;
}) {
  // 记录爽点
  const point = await prisma.pleasurePoint.create({
    data: {
      novelId,
      chapterId: data.chapterId,
      chapterOrder: data.chapterOrder,
      type: data.type,
      subType: data.subType || "",
      intensity: data.intensity,
      description: data.description || "",
      characters: JSON.stringify(data.characters || []),
      conflict: data.conflict || "",
    },
  });

  // 更新剧情状态
  await updateStoryState(novelId, {
    lastPleasureChapter: data.chapterOrder,
    pleasureType: data.type,
    pleasureCooldown: Math.max(0, data.intensity - 5), // 根据强度设置冷却
  });

  return point;
}

// 记录情绪曲线
export async function recordEmotionCurve(novelId: string, data: {
  chapterOrder: number;
  emotionType: string;
  intensity: number;
  tensionLevel?: number;
  releaseLevel?: number;
  isClimax?: boolean;
  isTurningPoint?: boolean;
  isBreathing?: boolean;
  description?: string;
}) {
  return prisma.emotionCurve.create({
    data: {
      novelId,
      chapterOrder: data.chapterOrder,
      emotionType: data.emotionType,
      intensity: data.intensity,
      tensionLevel: data.tensionLevel || 0,
      releaseLevel: data.releaseLevel || 0,
      isClimax: data.isClimax || false,
      isTurningPoint: data.isTurningPoint || false,
      isBreathing: data.isBreathing || false,
      description: data.description || "",
    },
  });
}

// 获取爽点历史
export async function getPleasureHistory(novelId: string, limit = 20) {
  return prisma.pleasurePoint.findMany({
    where: { novelId },
    orderBy: { chapterOrder: "desc" },
    take: limit,
  });
}

// 获取情绪曲线
export async function getEmotionCurve(novelId: string, limit = 30) {
  return prisma.emotionCurve.findMany({
    where: { novelId },
    orderBy: { chapterOrder: "asc" },
    take: limit,
  });
}

// 分析爽点节奏
export async function analyzePleasureRhythm(novelId: string) {
  const points = await getPleasureHistory(novelId, 50);
  
  if (points.length === 0) {
    return {
      totalPoints: 0,
      averageInterval: 0,
      typeDistribution: {},
      recentTypes: [],
      suggestion: "还没有爽点记录。",
    };
  }

  // 计算平均间隔
  const intervals = [];
  for (let i = 1; i < points.length; i++) {
    intervals.push(points[i - 1].chapterOrder - points[i].chapterOrder);
  }
  const averageInterval = intervals.length > 0
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : 0;

  // 类型分布
  const typeDistribution: Record<string, number> = {};
  for (const point of points) {
    typeDistribution[point.type] = (typeDistribution[point.type] || 0) + 1;
  }

  // 最近 5 个爽点类型
  const recentTypes = points.slice(0, 5).map((p) => p.type);

  // 生成建议
  let suggestion = "";
  if (averageInterval < 3) {
    suggestion = "爽点过于密集，建议增加间隔，避免读者疲劳。";
  } else if (averageInterval > 10) {
    suggestion = "爽点间隔过长，建议增加爽点频率，保持读者兴趣。";
  } else {
    suggestion = "爽点节奏良好。";
  }

  // 检查类型重复
  const recentTypeSet = new Set(recentTypes);
  if (recentTypeSet.size === 1) {
    suggestion += " 最近爽点类型过于单一，建议多样化。";
  }

  return {
    totalPoints: points.length,
    averageInterval: Math.round(averageInterval * 10) / 10,
    typeDistribution,
    recentTypes,
    suggestion,
  };
}

// 分析情绪曲线
export async function analyzeEmotionRhythm(novelId: string) {
  const curve = await getEmotionCurve(novelId, 50);
  
  if (curve.length === 0) {
    return {
      totalEntries: 0,
      emotionDistribution: {},
      climaxCount: 0,
      tensionAccumulation: 0,
      suggestion: "还没有情绪曲线记录。",
    };
  }

  // 情绪分布
  const emotionDistribution: Record<string, number> = {};
  for (const entry of curve) {
    emotionDistribution[entry.emotionType] = (emotionDistribution[entry.emotionType] || 0) + 1;
  }

  // 高潮次数
  const climaxCount = curve.filter((e) => e.isClimax).length;

  // 累积压抑值
  const tensionAccumulation = curve.reduce((sum, e) => sum + e.tensionLevel, 0);

  // 生成建议
  let suggestion = "";
  const tensionRatio = (emotionDistribution["tension"] || 0) / curve.length;
  const releaseRatio = (emotionDistribution["release"] || 0) / curve.length;

  if (tensionRatio > 0.6) {
    suggestion = "压抑情绪过多，建议增加释放和喘息章节。";
  } else if (releaseRatio > 0.6) {
    suggestion = "释放情绪过多，建议增加压抑和紧张章节，增强对比。";
  } else {
    suggestion = "情绪节奏良好。";
  }

  if (climaxCount === 0 && curve.length > 10) {
    suggestion += " 缺少高潮章节，建议设置爆点。";
  }

  return {
    totalEntries: curve.length,
    emotionDistribution,
    climaxCount,
    tensionAccumulation,
    suggestion,
  };
}

// 生成 AI 生成上下文
export async function buildStoryContext(novelId: string): Promise<string> {
  const state = await getOrCreateStoryState(novelId);
  const pleasureRhythm = await analyzePleasureRhythm(novelId);
  const emotionRhythm = await analyzeEmotionRhythm(novelId);

  const forbidden = JSON.parse(state.forbiddenActions || "[]");
  const allowed = JSON.parse(state.allowedActions || "[]");
  const activeForeshadows = JSON.parse(state.activeForeshadows || "[]");
  const pendingPayoffs = JSON.parse(state.pendingPayoffs || "[]");

  const context = [
    "【剧情状态】",
    `当前阶段: 第${state.currentVolume}卷·第${state.currentChapter}章`,
    `剧情阶段: ${state.currentPhase}`,
    `主线进度: ${state.mainPlotProgress || "未设定"}`,
    `核心矛盾: ${state.mainConflict || "未设定"}`,
    "",
    "【角色状态】",
    `主角实力: ${state.protagonistLevel || "未设定"}`,
    `主角目标: ${state.protagonistGoal || "未设定"}`,
    `主角处境: ${state.protagonistStatus || "未设定"}`,
    "",
    "【情绪状态】",
    `当前情绪: ${state.currentEmotion}`,
    `情绪强度: ${state.emotionIntensity}/10`,
    `累积压抑: ${state.tensionAccumulation}`,
    "",
    "【爽点状态】",
    `上次爽点: 第${state.lastPleasureChapter}章`,
    `爽点类型: ${state.pleasureType || "无"}`,
    `冷却值: ${state.pleasureCooldown}`,
    `平均间隔: ${pleasureRhythm.averageInterval}章`,
    "",
    "【读者状态】",
    `读者期待: ${state.readerExpectation || "未设定"}`,
    `疲劳度: ${state.readerFatigue}/100`,
    "",
  ];

  if (forbidden.length > 0) {
    context.push("【禁止内容】");
    for (const item of forbidden) {
      context.push(`- ${item}`);
    }
    context.push("");
  }

  if (allowed.length > 0) {
    context.push("【允许内容】");
    for (const item of allowed) {
      context.push(`- ${item}`);
    }
    context.push("");
  }

  if (activeForeshadows.length > 0) {
    context.push("【活跃伏笔】");
    for (const item of activeForeshadows) {
      context.push(`- ${item}`);
    }
    context.push("");
  }

  if (pendingPayoffs.length > 0) {
    context.push("【待回收伏笔】");
    for (const item of pendingPayoffs) {
      context.push(`- ${item}`);
    }
    context.push("");
  }

  context.push("【节奏建议】");
  context.push(pleasureRhythm.suggestion);
  context.push(emotionRhythm.suggestion);

  return context.join("\n");
}
