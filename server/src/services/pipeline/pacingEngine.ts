/**
 * 节奏检测规则引擎
 * 纯程序检测，无 LLM 调用
 * 从数据库读取 PleasurePoint / EmotionCurve / StoryState，对章节节奏做规则校验
 */

import { prisma } from "../../db/prisma";

// ===== 类型定义 =====

interface PacingRule {
  id: string;
  name: string;
  check: (ctx: PacingContext) => PacingIssue | null;
}

interface PacingContext {
  novelId: string;
  currentChapter: number;
  recentPleasurePoints: Array<{ chapterOrder: number; type: string; intensity: number }>;
  recentEmotionCurve: Array<{ chapterOrder: number; emotionType: string; intensity: number; tensionLevel: number }>;
  chapterContent: string;
}

interface PacingIssue {
  severity: "warning" | "critical";
  rule: string;
  message: string;
  suggestion: string;
}

// ===== 规则定义 =====

const pacingRules: PacingRule[] = [
  // 规则 1：连续无爽点
  {
    id: "no_payoff_streak",
    name: "连续无爽点",
    check: (ctx) => {
      const recent = ctx.recentPleasurePoints;
      if (recent.length === 0) {
        // 无爽点数据时，检查最近 8 章的范围
        return {
          severity: "critical",
          rule: "no_payoff_streak",
          message: "作品中尚无爽点记录，读者可能失去兴趣",
          suggestion: "立即安排一个高强度爽点章节，如金手指觉醒、逆袭打脸等",
        };
      }
      const latestPayoffChapter = Math.max(...recent.map((p) => p.chapterOrder));
      const gap = ctx.currentChapter - latestPayoffChapter;
      if (gap >= 8) {
        return {
          severity: "critical",
          rule: "no_payoff_streak",
          message: `最近 ${gap} 章无任何爽点（上次爽点在第${latestPayoffChapter}章），读者耐心已耗尽`,
          suggestion: "立即插入高密度爽点章节，建议强度 >= 8 的逆袭/打脸/实力展示类爽点",
        };
      }
      if (gap >= 5) {
        return {
          severity: "warning",
          rule: "no_payoff_streak",
          message: `最近 ${gap} 章无爽点（上次爽点在第${latestPayoffChapter}章），节奏偏慢`,
          suggestion: "建议在下一章安排爽点，保持读者期待感",
        };
      }
      return null;
    },
  },

  // 规则 2：爽点过于密集
  {
    id: "payoff_too_dense",
    name: "爽点过于密集",
    check: (ctx) => {
      const chapters = ctx.recentPleasurePoints.map((p) => p.chapterOrder).sort((a, b) => a - b);
      // 检查是否有连续 2 章都有爽点
      for (let i = 1; i < chapters.length; i++) {
        if (chapters[i] - chapters[i - 1] <= 1) {
          return {
            severity: "warning",
            rule: "payoff_too_dense",
            message: `第${chapters[i - 1]}章和第${chapters[i]}章连续出现爽点，可能导致爽感贬值`,
            suggestion: "爽点之间建议间隔至少 2-3 章，用铺垫和压抑提升爽点价值",
          };
        }
      }
      return null;
    },
  },

  // 规则 3：强度持续过高
  {
    id: "intensity_sustained_high",
    name: "强度持续过高",
    check: (ctx) => {
      const recent3 = ctx.recentEmotionCurve.slice(-3);
      if (recent3.length < 3) return null;
      if (recent3.every((e) => e.intensity > 7)) {
        return {
          severity: "warning",
          rule: "intensity_sustained_high",
          message: `最近 3 章情绪强度持续过高（${recent3.map((e) => e.intensity).join("/")}），读者可能产生疲劳`,
          suggestion: "建议插入喘息章（日常/温馨/搞笑），降低情绪强度至 3-5，为下一波高潮蓄力",
        };
      }
      return null;
    },
  },

  // 规则 4：强度持续过低
  {
    id: "intensity_sustained_low",
    name: "强度持续过低",
    check: (ctx) => {
      const recent3 = ctx.recentEmotionCurve.slice(-3);
      if (recent3.length < 3) return null;
      if (recent3.every((e) => e.intensity < 3)) {
        return {
          severity: "warning",
          rule: "intensity_sustained_low",
          message: `最近 3 章情绪强度持续过低（${recent3.map((e) => e.intensity).join("/")}），剧情缺乏张力`,
          suggestion: "建议增加冲突或危机，提升情绪强度至 5+，避免读者弃书",
        };
      }
      return null;
    },
  },

  // 规则 5：压抑无释放
  {
    id: "tension_no_release",
    name: "压抑无释放",
    check: (ctx) => {
      // 从 EmotionCurve 最近数据累积压抑值
      const recent = ctx.recentEmotionCurve;
      if (recent.length === 0) return null;
      const cumulativeTension = recent.reduce((sum, e) => sum + e.tensionLevel, 0);
      const latestPayoffChapter = ctx.recentPleasurePoints.length > 0
        ? Math.max(...ctx.recentPleasurePoints.map((p) => p.chapterOrder))
        : 0;
      const gap = ctx.currentChapter - latestPayoffChapter;

      if (cumulativeTension > 10 && gap >= 5) {
        return {
          severity: "critical",
          rule: "tension_no_release",
          message: `累积压抑值 ${cumulativeTension} 且最近爽点在 ${gap} 章前，读者情绪已到极限`,
          suggestion: "必须立即安排释放性爽点（打脸/逆袭/实力碾压），否则面临大规模弃书风险",
        };
      }
      return null;
    },
  },

  // 规则 6：类型单一
  {
    id: "payoff_type_monotony",
    name: "爽点类型单一",
    check: (ctx) => {
      const recent3 = ctx.recentPleasurePoints.slice(-3);
      if (recent3.length < 3) return null;
      const types = new Set(recent3.map((p) => p.type));
      if (types.size === 1) {
        return {
          severity: "warning",
          rule: "payoff_type_monotony",
          message: `最近 3 个爽点类型完全相同（均为「${recent3[0].type}」），缺乏新鲜感`,
          suggestion: "建议变换爽点类型，如从「实力提升」切换到「打脸逆袭」「资源获取」「感情线推进」等",
        };
      }
      return null;
    },
  },

  // 规则 7：节奏断裂
  {
    id: "emotion_jarring_shift",
    name: "节奏断裂",
    check: (ctx) => {
      const recent = ctx.recentEmotionCurve;
      if (recent.length < 2) return null;
      const prev = recent[recent.length - 2];
      const curr = recent[recent.length - 1];
      const diff = Math.abs(curr.intensity - prev.intensity);
      if (diff > 5) {
        return {
          severity: "warning",
          rule: "emotion_jarring_shift",
          message: `本章情绪强度（${curr.intensity}）与上一章（${prev.intensity}）差异 ${diff}，可能存在节奏突变`,
          suggestion: "建议增加过渡段落，平滑情绪变化，避免读者产生割裂感",
        };
      }
      return null;
    },
  },
];

// ===== 数据获取 =====

/**
 * 从数据库构建 PacingContext
 */
async function buildPacingContext(
  novelId: string,
  chapterOrder: number,
  chapterContent: string,
): Promise<PacingContext> {
  // 查询最近 10 章的爽点
  const recentPleasurePoints = await prisma.pleasurePoint.findMany({
    where: {
      novelId,
      chapterOrder: { gte: chapterOrder - 10, lte: chapterOrder },
    },
    select: { chapterOrder: true, type: true, intensity: true },
    orderBy: { chapterOrder: "asc" },
  });

  // 查询最近 10 章的情绪曲线
  const recentEmotionCurve = await prisma.emotionCurve.findMany({
    where: {
      novelId,
      chapterOrder: { gte: chapterOrder - 10, lte: chapterOrder },
    },
    select: { chapterOrder: true, emotionType: true, intensity: true, tensionLevel: true },
    orderBy: { chapterOrder: "asc" },
  });

  return {
    novelId,
    currentChapter: chapterOrder,
    recentPleasurePoints,
    recentEmotionCurve,
    chapterContent,
  };
}

// ===== 导出函数 =====

/**
 * 运行所有节奏规则检查
 */
export async function checkPacing(
  novelId: string,
  chapterOrder: number,
  chapterContent: string,
): Promise<PacingIssue[]> {
  const ctx = await buildPacingContext(novelId, chapterOrder, chapterContent);
  const issues: PacingIssue[] = [];

  for (const rule of pacingRules) {
    const issue = rule.check(ctx);
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

/**
 * 生成节奏建议（用于 Prompt 注入）
 */
export async function buildPacingSuggestion(
  novelId: string,
  chapterOrder: number,
): Promise<string> {
  // 构建 context 时 chapterContent 传空，因为此函数用于写作前的建议
  const ctx = await buildPacingContext(novelId, chapterOrder, "");
  const issues: PacingIssue[] = [];

  for (const rule of pacingRules) {
    const issue = rule.check(ctx);
    if (issue) {
      issues.push(issue);
    }
  }

  if (issues.length === 0) {
    return "";
  }

  const lines: string[] = ["【节奏检测提醒】"];
  for (const issue of issues) {
    const tag = issue.severity === "critical" ? "[严重]" : "[注意]";
    lines.push(`${tag} ${issue.message}`);
    lines.push(`  建议: ${issue.suggestion}`);
  }
  return lines.join("\n");
}
