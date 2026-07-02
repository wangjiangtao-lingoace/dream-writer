import { prisma } from "../../db/prisma";

/**
 * 从 LLM 后处理结果中提取快照，持久化到 ChapterSnapshot 表
 */
export async function captureSnapshot(
  novelId: string,
  chapterOrder: number,
  chapterId: string,
  postProcessingResult: any,
): Promise<void> {
  const ss = postProcessingResult?.storyState;
  const chapterSummary = postProcessingResult?.chapterSummary;
  const characterUpdates = postProcessingResult?.characterUpdates;

  // 提取主角状态
  const protagonistStatus = ss?.protagonistStatus || null;
  const protagonistEmotion = ss?.currentEmotion || null;
  // protagonistLocation 从 chapterSummary.endingState 或 storyState 中提取
  const protagonistLocation = extractLocation(chapterSummary?.endingState, ss);

  // 提取配角状态
  const activeCharacters = Array.isArray(characterUpdates)
    ? characterUpdates.map((c: any) => ({
        name: c.name,
        status: c.arcSummary || "",
        location: "",
        emotion: "",
      }))
    : [];

  // 剧情状态
  const currentPhase = ss?.currentPhase || null;
  const mainConflictProgress = ss?.mainConflict || null;
  const tensionLevel = ss?.emotionIntensity || null;

  // 伏笔/钩子状态
  const resolvedHookTitles: string[] = postProcessingResult?.resolvedHooks || [];
  const resolvedForeshadowTitles: string[] = postProcessingResult?.paidOffForeshadows || [];
  const resolvedInChapter = (resolvedHookTitles.length + resolvedForeshadowTitles.length) > 0
    ? JSON.stringify({ hooks: resolvedHookTitles, foreshadows: resolvedForeshadowTitles })
    : null;

  // 查询活跃伏笔和未回收钩子数量
  const [activeForeshadowCount, unresolvedHookCount] = await Promise.all([
    prisma.foreshadow.count({
      where: { novelId, status: { in: ["planted", "active"] } },
    }),
    prisma.hook.count({
      where: { novelId, status: { in: ["planted", "active"] } },
    }),
  ]);

  // 章节元数据
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { wordCount: true },
  }).catch(() => null);

  // 情绪类型：从 emotionCurve 或 storyState 获取
  const emotionCurve = await prisma.emotionCurve.findFirst({
    where: { novelId, chapterOrder },
    select: { emotionType: true },
  }).catch(() => null);
  const emotionType = emotionCurve?.emotionType || ss?.currentEmotion || null;

  // 爽点类型
  const pleasurePoint = await prisma.pleasurePoint.findFirst({
    where: { novelId, chapterOrder },
    select: { type: true },
  }).catch(() => null);
  const pleasurePointType = pleasurePoint?.type || null;

  await prisma.chapterSnapshot.upsert({
    where: {
      // 使用复合唯一约束
      novelId_chapterOrder: { novelId, chapterOrder },
    },
    create: {
      novelId,
      chapterOrder,
      chapterId,
      protagonistStatus,
      protagonistEmotion,
      protagonistLocation,
      activeCharacters: activeCharacters.length > 0 ? JSON.stringify(activeCharacters) : null,
      currentPhase,
      mainConflictProgress,
      tensionLevel,
      activeForeshadowCount,
      unresolvedHookCount,
      resolvedInChapter,
      storyTimeline: chapterSummary?.endingState || null,
      wordCount: chapter?.wordCount || null,
      emotionType,
      pleasurePointType,
    },
    update: {
      chapterId,
      protagonistStatus,
      protagonistEmotion,
      protagonistLocation,
      activeCharacters: activeCharacters.length > 0 ? JSON.stringify(activeCharacters) : null,
      currentPhase,
      mainConflictProgress,
      tensionLevel,
      activeForeshadowCount,
      unresolvedHookCount,
      resolvedInChapter,
      storyTimeline: chapterSummary?.endingState || null,
      wordCount: chapter?.wordCount || null,
      emotionType,
      pleasurePointType,
    },
  }).catch((e) => {
    console.warn(`[snapshotService] 快照保存失败 (chapterOrder=${chapterOrder}):`, e);
  });
}

/**
 * 获取最近 N 章的快照
 */
export async function getRecentSnapshots(
  novelId: string,
  chapterOrder: number,
  count: number,
) {
  return prisma.chapterSnapshot.findMany({
    where: {
      novelId,
      chapterOrder: { lt: chapterOrder, gte: chapterOrder - count },
    },
    orderBy: { chapterOrder: "desc" },
  });
}

/**
 * 构建快照上下文文本（用于注入 Prompt）
 * 将最近 3 章的快照精简为 ~300 tokens 的上下文
 */
export async function buildSnapshotContext(
  novelId: string,
  chapterOrder: number,
): Promise<string> {
  const snapshots = await getRecentSnapshots(novelId, chapterOrder, 3);
  if (snapshots.length === 0) return "";

  const lines: string[] = [];
  for (const snap of snapshots) {
    const parts: string[] = [];

    // 主角状态
    const stateParts: string[] = [];
    if (snap.protagonistStatus) stateParts.push(`处境：${snap.protagonistStatus}`);
    if (snap.protagonistEmotion) stateParts.push(`情绪：${snap.protagonistEmotion}`);
    if (snap.protagonistLocation) stateParts.push(`位置：${snap.protagonistLocation}`);
    if (stateParts.length > 0) {
      parts.push(`主角${stateParts.join("，")}`);
    }

    // 剧情状态
    if (snap.currentPhase) parts.push(`阶段：${snap.currentPhase}`);
    if (snap.tensionLevel) parts.push(`张力：${snap.tensionLevel}/10`);

    // 本章回收
    if (snap.resolvedInChapter) {
      try {
        const resolved = JSON.parse(snap.resolvedInChapter);
        const items = [...(resolved.hooks || []), ...(resolved.foreshadows || [])];
        if (items.length > 0) parts.push(`回收：${items.join("、")}`);
      } catch { /* ignore */ }
    }

    // 爽点
    if (snap.pleasurePointType) parts.push(`爽点：${snap.pleasurePointType}`);

    lines.push(`第${snap.chapterOrder}章快照：${parts.join("；")}`);
  }

  return `【前章快照 — 用于承接剧情状态】\n${lines.join("\n")}`;
}

/**
 * 从 endingState 和 storyState 中提取位置信息
 */
function extractLocation(endingState?: string | null, ss?: any): string | null {
  // 尝试从 endingState 中提取位置（通常包含场景描述）
  if (endingState && endingState.length > 0) {
    // 取 endingState 的前 30 字作为位置描述
    return endingState.slice(0, 30).replace(/\n/g, " ");
  }
  return null;
}
