import { prisma } from "../../db/prisma";
import { PhaseContext, safeJson, autoAdvanceOrPause } from "./pipelineUtils";
import { generateConsistencyCheck } from "./generators";
import { executeWritingPhase } from "./writingPhase";
import { PipelineConfig } from "../PipelineService";

const SIMILARITY_THRESHOLD = 0.7;

/**
 * 滑动窗口子串模糊匹配相似度（与 postProcessing.ts 逻辑一致）
 */
function substringSimilarity(short: string, long: string): number {
  if (!short || !long) return 0;
  if (long.includes(short)) return 1;

  const sLen = short.length;
  const lLen = long.length;
  if (sLen > lLen) return substringSimilarity(long, short);

  let best = 0;
  for (let i = 0; i <= lLen - sLen; i++) {
    let match = 0;
    for (let j = 0; j < sLen; j++) {
      if (short[j] === long[i + j]) match++;
    }
    const score = match / sLen;
    if (score > best) {
      best = score;
      if (best >= 1) return 1;
    }
  }
  return best;
}

/**
 * 提取关键短语：标题前20字 + 描述前20字
 */
function extractKeywords(title: string, description?: string | null): string[] {
  const keywords: string[] = [];
  if (title) {
    const t = title.slice(0, 20).trim();
    if (t.length >= 2) keywords.push(t);
  }
  if (description) {
    const d = description.slice(0, 20).trim();
    if (d.length >= 2) keywords.push(d);
  }
  return keywords;
}

export async function executeConsistencyCheckPhase(ctx: PhaseContext, jobId: string) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { novel: true },
  });
  if (!job) return;

  try {
    const novelId = job.novelId;

    // 加载所有规划数据
    const [chapterOutlines, hooks, foreshadows, mainlines, pleasurePoints, emotionCurves] = await Promise.all([
      prisma.chapterOutline.findMany({ where: { novelId }, orderBy: { sortOrder: "asc" } }),
      prisma.hook.findMany({ where: { novelId }, orderBy: { plannedChapter: "asc" } }),
      prisma.foreshadow.findMany({ where: { novelId }, orderBy: { plantChapter: "asc" } }),
      prisma.mainline.findMany({ where: { novelId }, orderBy: { sortOrder: "asc" } }),
      prisma.pleasurePoint.findMany({ where: { novelId }, orderBy: { chapterOrder: "asc" } }),
      prisma.emotionCurve.findMany({ where: { novelId }, orderBy: { chapterOrder: "asc" } }),
    ]);

    // 加载核心资产（大纲、世界观、人物、风格）
    const [outlineAsset, worldviewAsset, characterAsset, styleAsset] = await Promise.all([
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "outline" }, orderBy: { updatedAt: "desc" } }),
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "worldview" }, orderBy: { updatedAt: "desc" } }),
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "character" }, orderBy: { updatedAt: "desc" } }),
      prisma.knowledgeAsset.findFirst({ where: { novelId, category: "style" }, orderBy: { updatedAt: "desc" } }),
    ]);

    const outline = outlineAsset ? safeJson(outlineAsset.content, null) : null;
    const worldview = worldviewAsset ? safeJson(worldviewAsset.content, null) : null;
    const characters = characterAsset ? safeJson(characterAsset.content, null) : null;
    const style = styleAsset ? safeJson(styleAsset.content, null) : null;

    // 程序化预检：多维度校验
    const programmaticChecks: Array<{ type: string; issues: Array<{ severity: string; description: string; evidence: string; suggestion: string }> }> = [];

    const milestoneIssues = validateMilestoneGoalMapping(mainlines, chapterOutlines);
    if (milestoneIssues.length > 0) programmaticChecks.push({ type: "mainline", issues: milestoneIssues });

    const hookRangeIssues = validateHookRange(hooks, chapterOutlines);
    if (hookRangeIssues.length > 0) programmaticChecks.push({ type: "hook", issues: hookRangeIssues });

    const foreshadowRangeIssues = validateForeshadowRange(foreshadows, chapterOutlines);
    if (foreshadowRangeIssues.length > 0) programmaticChecks.push({ type: "foreshadow", issues: foreshadowRangeIssues });

    const pleasureSpacingIssues = validatePleasurePointSpacing(pleasurePoints);
    if (pleasureSpacingIssues.length > 0) programmaticChecks.push({ type: "pleasure", issues: pleasureSpacingIssues });

    const emotionCoverageIssues = validateEmotionCurveCoverage(emotionCurves, chapterOutlines);
    if (emotionCoverageIssues.length > 0) programmaticChecks.push({ type: "emotion", issues: emotionCoverageIssues });

    // 加载角色列表用于人物出场校验
    const characterList = characterAsset ? safeJson(characterAsset.content, null) : null;
    const characterAppearanceIssues = validateCharacterAppearance(chapterOutlines, characterList);
    if (characterAppearanceIssues.length > 0) programmaticChecks.push({ type: "character", issues: characterAppearanceIssues });

    // 持久化所有程序化校验结果
    const allProgrammaticIssues = programmaticChecks.flatMap(check =>
      check.issues.map(issue => ({
        novelId,
        type: check.type,
        severity: issue.severity,
        description: issue.description,
        evidence: issue.evidence,
        suggestion: issue.suggestion,
        status: "open",
      })),
    );
    if (allProgrammaticIssues.length > 0) {
      await prisma.consistencyIssue.createMany({ data: allProgrammaticIssues });
    }

    // 构建规划摘要（包含 description 字段）
    const planSummary = buildPlanSummaryForConsistency(
      chapterOutlines, hooks, foreshadows, mainlines, pleasurePoints, emotionCurves,
    );

    // 将程序化预检结果格式化为 LLM 可读的文本
    const programmaticSummary = programmaticChecks.length > 0
      ? programmaticChecks.flatMap(check =>
          check.issues.map(issue => `[${issue.severity}][${check.type}] ${issue.description} — ${issue.suggestion}`)
        ).join("\n")
      : "";

    await ctx.updateJobProgress(jobId, "consistency_check", "consistency");
    const result = await generateConsistencyCheck(ctx, novelId, planSummary, outline, worldview, characters, style, programmaticSummary);
    await ctx.savePhaseResult(jobId, "consistency_check", "consistency",
      { planSummaryLength: planSummary.length, programmaticIssues: allProgrammaticIssues.length }, result);

    // 将一致性问题写入 ConsistencyIssue 表
    if (Array.isArray(result?.issues) && result.issues.length > 0) {
      await prisma.consistencyIssue.createMany({
        data: result.issues.map((issue: any) => ({
          novelId,
          type: issue.type || "character",
          severity: issue.severity || "medium",
          description: issue.description || "",
          evidence: Array.isArray(issue.chapters) ? `相关章节：第${issue.chapters.join("、")}章` : "",
          suggestion: issue.suggestion || "",
          status: "open",
        })),
      });
    }

    // 自动修复闭环：对 critical/high 问题生成修复建议（fire-and-forget，不阻塞主流程）
    const allIssues = [
      ...allProgrammaticIssues,
      ...(Array.isArray(result?.issues) ? result.issues.map((issue: any) => ({
        severity: issue.severity || "medium",
        description: issue.description || "",
        type: issue.type || "character",
      })) : []),
    ];
    // 非阻塞执行，最多 1 轮修复建议
    attemptAutoFix(ctx, novelId, jobId, allIssues).catch(() => {});

    // 伏笔回收检测：检查已写完的章节是否包含伏笔回收
    await detectForeshadowResolutions(novelId);
    // 钩子回收检测：检查已写完的章节是否包含钩子回收
    await detectHookResolutions(novelId);

    // P1 #3: 严重一致性问题阻断逻辑
    const config = JSON.parse(job.config) as PipelineConfig;
    const criticalIssues = allIssues.filter(i => i.severity === "critical");
    if (criticalIssues.length > 0) {
      if (config.autoContinue) {
        // 自动续写模式：暂停流程，等待用户确认
        await ctx.savePhaseResult(jobId, "consistency_check", "critical_block",
          { criticalCount: criticalIssues.length },
          {
            message: `发现 ${criticalIssues.length} 个严重一致性问题，已自动暂停等待确认`,
            issues: criticalIssues.map(i => ({ severity: i.severity, type: i.type, description: i.description })),
          },
        );
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "paused", currentPhase: "consistency_check", currentStep: "critical_issues_pending" },
        });
        return;
      }
      // 非自动续写模式：标记严重问题，继续进入等待确认状态
      await ctx.savePhaseResult(jobId, "consistency_check", "critical_warning",
        { criticalCount: criticalIssues.length },
        {
          message: `发现 ${criticalIssues.length} 个严重一致性问题，请在确认前仔细检查`,
          issues: criticalIssues.map(i => ({ severity: i.severity, type: i.type, description: i.description })),
        },
      );
    }

    await autoAdvanceOrPause(jobId, "consistency_check", async () => {
      await prisma.pipelineJob.update({
        where: { id: jobId },
        data: { status: "running", currentPhase: "writing", currentStep: "chapter_drafts" },
      });
      await executeWritingPhase(ctx, jobId);
    });
  } catch (error: any) {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: { status: "error", lastError: error.message },
    });
  }
}

/**
 * 程序化检查：主线里程碑是否被章纲 goal 覆盖
 * 检查维度：
 * 1. 里程碑指向的章节是否存在
 * 2. 该章节的 goal 是否为空
 * 3. 里程碑是否超出章纲范围
 */
function validateMilestoneGoalMapping(
  mainlines: any[],
  chapterOutlines: any[],
): Array<{ severity: string; description: string; evidence: string; suggestion: string }> {
  const issues: Array<{ severity: string; description: string; evidence: string; suggestion: string }> = [];
  const outlineMap = new Map<number, any>();
  for (const co of chapterOutlines) {
    outlineMap.set(co.sortOrder, co);
  }
  const maxChapter = chapterOutlines.length;

  for (const ml of mainlines) {
    const milestones = safeJson(ml.milestones, []);
    if (!Array.isArray(milestones)) continue;

    for (const ms of milestones) {
      const chapter = ms.chapter;
      if (!chapter || typeof chapter !== "number") {
        issues.push({
          severity: "medium",
          description: `主线「${ml.title}」的里程碑缺少有效章节编号`,
          evidence: `里程碑事件：${ms.event || "未描述"}`,
          suggestion: "为里程碑指定明确的章节编号",
        });
        continue;
      }

      if (chapter > maxChapter) {
        issues.push({
          severity: "high",
          description: `主线「${ml.title}」的里程碑指向第${chapter}章，但章纲只规划到第${maxChapter}章`,
          evidence: `里程碑事件：${ms.event || "未描述"}`,
          suggestion: "扩展章纲范围或调整里程碑章节位置",
        });
        continue;
      }

      const outline = outlineMap.get(chapter);
      if (!outline) {
        issues.push({
          severity: "high",
          description: `主线「${ml.title}」的里程碑指向第${chapter}章，但该章无章纲`,
          evidence: `里程碑事件：${ms.event || "未描述"}`,
          suggestion: "补充第${chapter}章的章纲",
        });
        continue;
      }

      if (!outline.goal || outline.goal.trim().length === 0) {
        issues.push({
          severity: "medium",
          description: `主线「${ml.title}」的里程碑在第${chapter}章，但该章 goal 为空`,
          evidence: `里程碑事件：${ms.event || "未描述"}`,
          suggestion: "为该章补充明确的 goal，确保覆盖里程碑事件",
        });
      }
    }
  }

  return issues;
}

/**
 * 程序化检查：钩子的 plannedChapter/resolvedChapter 是否在有效章纲范围内
 */
function validateHookRange(
  hooks: any[],
  chapterOutlines: any[],
): Array<{ severity: string; description: string; evidence: string; suggestion: string }> {
  const issues: Array<{ severity: string; description: string; evidence: string; suggestion: string }> = [];
  const maxChapter = chapterOutlines.length;
  const outlineSet = new Set(chapterOutlines.map((co: any) => co.sortOrder));

  for (const h of hooks) {
    if (h.plannedChapter && h.plannedChapter > maxChapter) {
      issues.push({
        severity: "high",
        description: `钩子「${h.title}」的埋设章节第${h.plannedChapter}章超出章纲范围（共${maxChapter}章）`,
        evidence: `plannedChapter=${h.plannedChapter}`,
        suggestion: "扩展章纲范围或调整钩子埋设位置",
      });
    } else if (h.plannedChapter && !outlineSet.has(h.plannedChapter)) {
      issues.push({
        severity: "medium",
        description: `钩子「${h.title}」的埋设章节第${h.plannedChapter}章无章纲`,
        evidence: `plannedChapter=${h.plannedChapter}`,
        suggestion: "补充该章章纲或调整钩子位置",
      });
    }

    if (h.resolvedChapter && h.resolvedChapter > maxChapter) {
      issues.push({
        severity: "high",
        description: `钩子「${h.title}」的回收章节第${h.resolvedChapter}章超出章纲范围（共${maxChapter}章）`,
        evidence: `resolvedChapter=${h.resolvedChapter}`,
        suggestion: "扩展章纲范围或调整钩子回收位置",
      });
    } else if (h.resolvedChapter && !outlineSet.has(h.resolvedChapter)) {
      issues.push({
        severity: "medium",
        description: `钩子「${h.title}」的回收章节第${h.resolvedChapter}章无章纲`,
        evidence: `resolvedChapter=${h.resolvedChapter}`,
        suggestion: "补充该章章纲或调整钩子回收位置",
      });
    }

    if (h.plannedChapter && h.resolvedChapter && h.resolvedChapter < h.plannedChapter) {
      issues.push({
        severity: "high",
        description: `钩子「${h.title}」的回收章节（第${h.resolvedChapter}章）早于埋设章节（第${h.plannedChapter}章）`,
        evidence: `plannedChapter=${h.plannedChapter}, resolvedChapter=${h.resolvedChapter}`,
        suggestion: "调整回收章节使其晚于埋设章节",
      });
    }
  }

  return issues;
}

/**
 * 程序化检查：伏笔的 plantChapter/payoffChapter 是否在有效章纲范围内
 */
function validateForeshadowRange(
  foreshadows: any[],
  chapterOutlines: any[],
): Array<{ severity: string; description: string; evidence: string; suggestion: string }> {
  const issues: Array<{ severity: string; description: string; evidence: string; suggestion: string }> = [];
  const maxChapter = chapterOutlines.length;
  const outlineSet = new Set(chapterOutlines.map((co: any) => co.sortOrder));

  for (const f of foreshadows) {
    if (f.plantChapter && f.plantChapter > maxChapter) {
      issues.push({
        severity: "high",
        description: `伏笔「${f.title}」的埋设章节第${f.plantChapter}章超出章纲范围（共${maxChapter}章）`,
        evidence: `plantChapter=${f.plantChapter}`,
        suggestion: "扩展章纲范围或调整伏笔埋设位置",
      });
    } else if (f.plantChapter && !outlineSet.has(f.plantChapter)) {
      issues.push({
        severity: "medium",
        description: `伏笔「${f.title}」的埋设章节第${f.plantChapter}章无章纲`,
        evidence: `plantChapter=${f.plantChapter}`,
        suggestion: "补充该章章纲或调整伏笔位置",
      });
    }

    if (f.payoffChapter && f.payoffChapter > maxChapter) {
      issues.push({
        severity: "high",
        description: `伏笔「${f.title}」的回收章节第${f.payoffChapter}章超出章纲范围（共${maxChapter}章）`,
        evidence: `payoffChapter=${f.payoffChapter}`,
        suggestion: "扩展章纲范围或调整伏笔回收位置",
      });
    } else if (f.payoffChapter && !outlineSet.has(f.payoffChapter)) {
      issues.push({
        severity: "medium",
        description: `伏笔「${f.title}」的回收章节第${f.payoffChapter}章无章纲`,
        evidence: `payoffChapter=${f.payoffChapter}`,
        suggestion: "补充该章章纲或调整伏笔回收位置",
      });
    }

    if (f.plantChapter && f.payoffChapter && f.payoffChapter < f.plantChapter) {
      issues.push({
        severity: "high",
        description: `伏笔「${f.title}」的回收章节（第${f.payoffChapter}章）早于埋设章节（第${f.plantChapter}章）`,
        evidence: `plantChapter=${f.plantChapter}, payoffChapter=${f.payoffChapter}`,
        suggestion: "调整回收章节使其晚于埋设章节",
      });
    }
  }

  return issues;
}

/**
 * 程序化检查：爽点间隔是否合理（相邻爽点至少间隔 3 章）
 */
function validatePleasurePointSpacing(
  pleasurePoints: any[],
): Array<{ severity: string; description: string; evidence: string; suggestion: string }> {
  const issues: Array<{ severity: string; description: string; evidence: string; suggestion: string }> = [];
  const MIN_GAP = 3;

  const sorted = [...pleasurePoints].sort((a, b) => a.chapterOrder - b.chapterOrder);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].chapterOrder - sorted[i - 1].chapterOrder;
    if (gap < MIN_GAP) {
      issues.push({
        severity: "medium",
        description: `爽点间隔过密：第${sorted[i - 1].chapterOrder}章与第${sorted[i].chapterOrder}章之间仅隔${gap}章（建议至少${MIN_GAP}章）`,
        evidence: `前一个：${sorted[i - 1].type}（强度${sorted[i - 1].intensity}），后一个：${sorted[i].type}（强度${sorted[i].intensity}）`,
        suggestion: "调整爽点位置以拉开间隔，避免读者审美疲劳",
      });
    }
  }

  return issues;
}

/**
 * 程序化检查：情绪曲线是否覆盖了所有章节
 */
function validateEmotionCurveCoverage(
  emotionCurves: any[],
  chapterOutlines: any[],
): Array<{ severity: string; description: string; evidence: string; suggestion: string }> {
  const issues: Array<{ severity: string; description: string; evidence: string; suggestion: string }> = [];
  const curveSet = new Set(emotionCurves.map((ec: any) => ec.chapterOrder));
  const missingChapters: number[] = [];

  for (const co of chapterOutlines) {
    if (!curveSet.has(co.sortOrder)) {
      missingChapters.push(co.sortOrder);
    }
  }

  if (missingChapters.length > 0) {
    const severity = missingChapters.length > chapterOutlines.length * 0.3 ? "high" : "medium";
    issues.push({
      severity,
      description: `情绪曲线未覆盖${missingChapters.length}个章节（共${chapterOutlines.length}章）`,
      evidence: `缺失章节：第${missingChapters.slice(0, 10).join("、")}${missingChapters.length > 10 ? "..." : ""}章`,
      suggestion: "补充缺失章节的情绪曲线标注",
    });
  }

  return issues;
}

/**
 * 程序化检查：章纲中出场的角色是否在人物库中存在
 * 扫描章纲的 goal/conflict/emotion/hook 字段，提取疑似角色名并校验
 */
function validateCharacterAppearance(
  chapterOutlines: any[],
  characterList: any,
): Array<{ severity: string; description: string; evidence: string; suggestion: string }> {
  const issues: Array<{ severity: string; description: string; evidence: string; suggestion: string }> = [];

  if (!characterList) return issues;

  // 支持 characterList 为数组或对象（含 characters 字段）
  const characters: any[] = Array.isArray(characterList)
    ? characterList
    : (characterList.characters || []);

  if (characters.length === 0) return issues;

  // 构建已知角色名集合（长度 >= 2）
  const nameSet = new Set<string>();
  for (const c of characters) {
    if (c.name && c.name.length >= 2) nameSet.add(c.name);
  }

  // 扫描章纲文本字段，收集所有出现的角色名
  const textFields = ["goal", "conflict", "emotion", "hook"];
  const appearedNames = new Set<string>();
  for (const co of chapterOutlines) {
    for (const field of textFields) {
      const text = co[field];
      if (!text || typeof text !== "string") continue;
      for (const name of nameSet) {
        if (text.includes(name)) appearedNames.add(name);
      }
    }
  }

  // 找出 Character 表中有但章纲中从未出现的角色
  const unusedCharacters = [...nameSet].filter(name => !appearedNames.has(name));
  for (const name of unusedCharacters) {
    issues.push({
      severity: "low",
      description: `角色「${name}」在人物库中存在，但在所有章纲中从未出场`,
      evidence: `人物库中有 ${nameSet.size} 个角色，章纲中引用了 ${appearedNames.size} 个`,
      suggestion: "考虑在章纲中为该角色安排出场场景，或确认其为背景角色无需出场",
    });
  }

  return issues;
}

/**
 * 自动修复闭环：对 critical/high 问题调用 LLM 生成修复建议
 * 最多执行 1 轮，fire-and-forget，不阻塞主流程，不自动覆盖原始数据
 */
async function attemptAutoFix(
  ctx: PhaseContext,
  novelId: string,
  jobId: string,
  issues: Array<{ severity: string; description: string; type: string }>,
): Promise<void> {
  const criticalHighIssues = issues.filter(i => i.severity === "critical" || i.severity === "high");
  if (criticalHighIssues.length === 0) return;

  try {
    const issueList = criticalHighIssues
      .map((issue, i) => `${i + 1}. [${issue.severity}][${issue.type}] ${issue.description}`)
      .join("\n");

    const prompt = `以下是一致性校验发现的严重问题，请针对每个问题给出具体的修复建议（只需建议，不要直接修改数据）：

${issueList}

请以JSON格式返回：
{
  "fixes": [
    {
      "issueIndex": 1,
      "action": "具体修复动作描述",
      "target": "需要修改的数据对象",
      "details": "详细修复方案"
    }
  ]
}`;

    const result = await ctx.llmService.completeText({
      system: "你是一位故事编辑助手，擅长为小说规划一致性问题提供修复建议。只提供修复建议，不要直接修改数据。",
      prompt,
      temperature: 0.3,
      maxTokens: 2000,
    });

    const fixResult = safeJson(result, null);
    if (fixResult?.fixes && Array.isArray(fixResult.fixes)) {
      // 记录修复建议到 PhaseResult，status 为 auto_fixed
      await ctx.savePhaseResult(jobId, "consistency_fix", "consistency",
        { originalIssueCount: criticalHighIssues.length },
        { fixes: fixResult.fixes, status: "auto_fixed" },
      );

      // 将修复建议写回 ConsistencyIssue
      for (const fix of fixResult.fixes) {
        if (fix.issueIndex && fix.details) {
          const issue = criticalHighIssues[fix.issueIndex - 1];
          if (issue) {
            await prisma.consistencyIssue.updateMany({
              where: { novelId, description: issue.description, status: "open" },
              data: { suggestion: fix.details },
            }).catch(() => {});
          }
        }
      }
    }
  } catch {
    // fire-and-forget，失败不影响主流程
  }
}

/**
 * 检测已写完章节中的伏笔回收
 * 使用滑动窗口模糊匹配（与 postProcessing.ts detectResolutionsInContent 逻辑一致，阈值 0.7）
 */
async function detectForeshadowResolutions(novelId: string) {
  const plantedForeshadows = await prisma.foreshadow.findMany({
    where: { novelId, status: { in: ["planted", "active", "payoff_pending"] } },
  });
  if (plantedForeshadows.length === 0) return;

  const chapters = await prisma.chapter.findMany({
    where: { novelId, content: { not: "" } },
    orderBy: { order: "asc" },
    select: { order: true, content: true, title: true },
  });
  if (chapters.length === 0) return;

  for (const fs of plantedForeshadows) {
    const plantOrder = fs.plantChapter || 0;
    const relevantChapters = chapters.filter(ch => ch.order > plantOrder);
    const keywords = extractKeywords(fs.title, fs.description);

    for (const ch of relevantChapters) {
      let resolved = false;
      for (const kw of keywords) {
        if (substringSimilarity(kw, ch.content) >= SIMILARITY_THRESHOLD) {
          resolved = true;
          break;
        }
      }
      if (resolved) {
        await prisma.foreshadow.update({
          where: { id: fs.id },
          data: { status: "paid_off", payoffChapter: ch.order },
        });
        break;
      }
    }
  }
}

/**
 * 检测已写完章节中的钩子回收
 * 扫描章节内容中是否包含钩子标题，如果包含则标记为已回收
 */
async function detectHookResolutions(novelId: string) {
  const activeHooks = await prisma.hook.findMany({
    where: { novelId, status: { in: ["planted", "active"] } },
  });
  if (activeHooks.length === 0) return;

  const chapters = await prisma.chapter.findMany({
    where: { novelId, content: { not: "" } },
    orderBy: { order: "asc" },
    select: { order: true, content: true },
  });
  if (chapters.length === 0) return;

  for (const hook of activeHooks) {
    const plannedOrder = hook.plannedChapter || 0;
    const relevantChapters = chapters.filter(ch => ch.order > plannedOrder);

    for (const ch of relevantChapters) {
      if (ch.content.includes(hook.title)) {
        await prisma.hook.update({
          where: { id: hook.id },
          data: { status: "resolved", resolvedChapter: ch.order },
        });
        break;
      }
    }
  }
}

export function buildPlanSummaryForConsistency(
  chapterOutlines: any[], hooks: any[], foreshadows: any[],
  mainlines: any[], pleasurePoints: any[], emotionCurves: any[],
): string {
  const parts: string[] = [];

  // 章纲摘要
  parts.push("## 章纲规划");
  for (const ch of chapterOutlines) {
    parts.push(`第${ch.sortOrder}章 [${ch.title}]：目标=${ch.goal || "无"} | 冲突=${ch.conflict || "无"} | 情绪=${ch.emotion || "无"} | 钩子=${ch.hook || "无"}`);
  }

  // 钩子状态
  parts.push("\n## 钩子状态");
  for (const h of hooks) {
    const desc = h.description ? ` | 描述：${h.description}` : "";
    parts.push(`[${h.status}] ${h.title}（类型:${h.type}，强度:${h.intensity}）：埋设于第${h.plannedChapter || "?"}章，计划回收于第${h.resolvedChapter || "?"}章${desc}`);
  }

  // 伏笔状态
  parts.push("\n## 伏笔状态");
  for (const f of foreshadows) {
    const desc = f.description ? ` | 描述：${f.description}` : "";
    parts.push(`[${f.status}] ${f.title}：埋设于第${f.plantChapter}章，计划回收于第${f.payoffChapter || "?"}章${desc}`);
  }

  // 主线
  parts.push("\n## 主线规划");
  for (const m of mainlines) {
    const milestones = safeJson(m.milestones, []);
    const milestoneStr = milestones.map((ms: any) => `第${ms.chapter}章:${ms.event}`).join("、");
    const desc = m.description ? ` | 描述：${m.description}` : "";
    parts.push(`[${m.type}] ${m.title}：第${m.startChapter || "?"}章→第${m.endChapter || "?"}章 | 里程碑：${milestoneStr || "无"} | 结局：${m.resolution || "未定"}${desc}`);
  }

  // 爽点分布
  parts.push("\n## 爽点分布");
  for (const pp of pleasurePoints) {
    parts.push(`第${pp.chapterOrder}章 [${pp.type}] 强度${pp.intensity}：${pp.description || ""}`);
  }

  // 情绪曲线
  parts.push("\n## 情绪曲线");
  const climaxChapters = emotionCurves.filter(e => e.isClimax).map(e => e.chapterOrder);
  const turningPoints = emotionCurves.filter(e => e.isTurningPoint).map(e => e.chapterOrder);
  const breathingChapters = emotionCurves.filter(e => e.isBreathing).map(e => e.chapterOrder);
  parts.push(`高潮章节：${climaxChapters.join(",") || "无"}`);
  parts.push(`转折点：${turningPoints.join(",") || "无"}`);
  parts.push(`呼吸章节：${breathingChapters.join(",") || "无"}`);
  for (const ec of emotionCurves) {
    parts.push(`第${ec.chapterOrder}章：${ec.emotionType}（强度${ec.intensity}）`);
  }

  return parts.join("\n");
}
