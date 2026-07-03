import { prisma } from "../db/prisma";

/**
 * 主线里程碑追踪服务
 * 在章节写完后自动校验主线里程碑是否被覆盖
 */

// 中文停用词（高频无意义词）
const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
  "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
  "自己", "这", "他", "她", "它", "们", "那", "里", "为", "什么", "被", "把", "从",
  "而", "但", "又", "与", "或", "如果", "虽然", "因为", "所以", "这个", "那个",
  "可以", "已经", "还是", "只是", "不是", "没有", "然后", "之后", "之前",
]);

interface Milestone {
  chapter: number;
  event: string;
  type?: string;
  characters?: string[];
  causeEffect?: string;
}

interface MilestoneStatus {
  [index: number]: number; // milestoneIndex -> chapterOrder
}

/**
 * 从里程碑事件描述中提取关键词
 */
function extractKeywords(event: string): string[] {
  // 按标点和空格分词，过滤停用词和短词
  const words = event
    .replace(/[，。！？、；：""''（）《》【】\s]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

/**
 * 检查章节内容是否覆盖了里程碑事件
 * 简化版：关键词匹配 + 角色名匹配
 */
function isMilestoneCovered(
  milestone: Milestone,
  chapterContent: string,
): boolean {
  const contentLower = chapterContent.toLowerCase();
  const keywords = extractKeywords(milestone.event);

  if (keywords.length === 0) return false;

  // 关键词匹配：至少 40% 的关键词出现在章节内容中
  const matchedCount = keywords.filter((kw) =>
    contentLower.includes(kw.toLowerCase()),
  ).length;
  const keywordMatchRatio = matchedCount / keywords.length;

  // 角色名匹配：里程碑涉及的角色在章节中出现
  let characterMatch = true;
  if (milestone.characters && milestone.characters.length > 0) {
    const charAppearCount = milestone.characters.filter((char) =>
      contentLower.includes(char.toLowerCase()),
    ).length;
    characterMatch = charAppearCount > 0;
  }

  // 综合判断：关键词匹配率 >= 40% 且角色匹配（如有角色信息）
  return keywordMatchRatio >= 0.4 && characterMatch;
}

/**
 * 更新里程碑状态
 */
export async function updateMilestoneStatus(
  mainlineId: string,
  milestoneIndex: number,
  chapterOrder: number,
): Promise<void> {
  const mainline = await prisma.mainline.findUnique({
    where: { id: mainlineId },
    select: { milestoneStatus: true },
  });
  if (!mainline) return;

  let status: MilestoneStatus = {};
  try {
    status = JSON.parse(mainline.milestoneStatus || "{}");
  } catch {
    status = {};
  }

  // 仅在未覆盖时更新
  if (status[milestoneIndex] == null) {
    status[milestoneIndex] = chapterOrder;
    await prisma.mainline.update({
      where: { id: mainlineId },
      data: { milestoneStatus: JSON.stringify(status) },
    });
  }
}

/**
 * 检查章节内容是否覆盖了主线里程碑
 * 在 mergedPostProcessing 中调用
 */
export async function checkMilestoneCoverage(
  novelId: string,
  chapterContent: string,
  chapterOrder: number,
): Promise<void> {
  // 获取该章节范围内的所有活跃主线
  const mainlines = await prisma.mainline.findMany({
    where: {
      novelId,
      status: "active",
      OR: [
        { startChapter: { lte: chapterOrder }, endChapter: { gte: chapterOrder } },
        { startChapter: null },
        { endChapter: null },
      ],
    },
  });

  if (mainlines.length === 0) return;

  for (const mainline of mainlines) {
    let milestones: Milestone[] = [];
    try {
      milestones = JSON.parse(mainline.milestones || "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(milestones) || milestones.length === 0) continue;

    // 检查本章对应的里程碑
    for (let i = 0; i < milestones.length; i++) {
      const ms = milestones[i];
      // 里程碑目标章节与当前章节匹配（允许 ±2 章的容差）
      if (
        ms.chapter &&
        Math.abs(ms.chapter - chapterOrder) <= 2 &&
        isMilestoneCovered(ms, chapterContent)
      ) {
        await updateMilestoneStatus(mainline.id, i, chapterOrder);
      }
    }
  }
}
