/**
 * P0-P3 优先级 Prompt 架构系统
 *
 * 从"平铺 7 层"改为"优先级驱动"：
 * - P0 最高优先级：章节任务 + 爽点链 + Beat 蓝图 → 模型必须完成
 * - P1 角色驱动：角色约束 + 关系状态 → 人物行为驱动剧情
 * - P2 剧情状态：剧情状态 + 活跃伏笔 + 活跃钩子 → 连续性保障
 * - P3 世界背景：世界观 + 风格 DNA + 读者期待 → 背景支撑
 */

import { LAYER1_WRITING_ENGINE } from "./layer1-engine";
import { buildLayer2Style } from "./layer2-style";
import { buildLayer3SellingPoints } from "./layer3-selling-points";
import { buildLayer4Characters } from "./layer4-characters";
import { buildLayer5Worldview } from "./layer5-worldview";
import { buildLayer6ChapterTask } from "./layer6-chapter-task";
import { buildLayer7ReaderExpect } from "./layer7-reader-expect";

// 7 层 Prompt 架构接口（保持向后兼容）
export interface PromptLayers {
  layer1_engine: string;           // 基础写作引擎（固定）
  layer2_style: string;            // 作品风格模板（动态）
  layer3_sellingPoints: string;    // 本书核心约束（动态）
  layer4_characters: string;       // 角色约束（动态）
  layer5_worldview: string;        // 世界观约束（动态）
  layer6_chapterTask: string;      // 章节任务（动态）
  layer7_readerExpect: string;     // 读者期待约束（动态）
}

/**
 * 组装 7 层 Prompt 为完整的 System Prompt（向后兼容）
 */
export function assembleSystemPrompt(layers: PromptLayers): string {
  return [
    layers.layer1_engine,
    layers.layer2_style,
    layers.layer3_sellingPoints,
    layers.layer4_characters,
    layers.layer5_worldview,
    layers.layer6_chapterTask,
    layers.layer7_readerExpect,
  ].filter(Boolean).join('\n\n---\n\n');
}

/**
 * 从数据库数据构建完整的 P0-P3 优先级 Prompt
 */
export async function buildFullSystemPrompt(params: {
  novel: any;
  style: any;
  characters: any[];
  worldview: any;
  chapterOutline: any;
  previousChapterEnding?: string;
}): Promise<string> {
  const { novel, style, characters, worldview, chapterOutline, previousChapterEnding } = params;

  // 构建各层内容
  const engine = LAYER1_WRITING_ENGINE;
  const styleLayer = buildLayer2Style(novel, style);
  const sellingPoints = buildLayer3SellingPoints(novel);
  const characterLayer = buildLayer4Characters(characters);
  const worldviewLayer = buildLayer5Worldview(worldview);
  const chapterTask = buildLayer6ChapterTask(chapterOutline);
  const readerExpect = buildLayer7ReaderExpect(
    JSON.parse(novel.readerExpectations || '[]')
  );

  // 按 P0-P3 优先级组装
  const parts: string[] = [];

  // 基础引擎（始终在最前面）
  parts.push(engine);

  // P0: 最高优先级 — 章节任务 + 上一章结尾
  if (chapterTask || sellingPoints || previousChapterEnding) {
    const p0Parts: string[] = [];
    p0Parts.push('【★★★ P0 最高优先级 — 本章核心任务 ★★★】');
    p0Parts.push('以下内容是本章写作的首要目标，必须全部完成。如果与其他约束冲突，以 P0 为准。');

    // 上一章结尾（防止跳章）
    if (previousChapterEnding) {
      p0Parts.push('【上一章结尾】');
      p0Parts.push(previousChapterEnding);
      p0Parts.push('【本章开头承接要求】');
      p0Parts.push('本章前300字必须承接上一章结尾，不得跳过关键事件。这个优先级要高于 Beat 蓝图。');
    }

    if (chapterTask) p0Parts.push(chapterTask);
    if (sellingPoints) p0Parts.push(sellingPoints);
    parts.push(p0Parts.join('\n\n'));
  }

  // P1: 角色驱动 — 人物行为决定剧情
  if (characterLayer) {
    const p1Parts: string[] = [];
    p1Parts.push('【★★ P1 角色驱动 — 人物行为决定剧情 ★★】');
    p1Parts.push('角色的性格、动机和关系是剧情推进的核心驱动力。每个角色的言行必须符合其设定。');
    p1Parts.push(characterLayer);
    parts.push(p1Parts.join('\n\n'));
  }

  // P2: 剧情状态 — 连续性保障
  const p2Parts: string[] = [];
  p2Parts.push('【★ P2 剧情状态 — 保持连续性 ★】');
  if (worldviewLayer) p2Parts.push(worldviewLayer);
  if (readerExpect) p2Parts.push(readerExpect);
  if (p2Parts.length > 1) {
    parts.push(p2Parts.join('\n\n'));
  }

  // P3: 世界背景 — 风格和世界观约束
  if (styleLayer) {
    parts.push(styleLayer);
  }

  return parts.filter(Boolean).join('\n\n---\n\n');
}

// 重新导出各层构建函数
export { LAYER1_WRITING_ENGINE } from "./layer1-engine";
export { buildLayer2Style } from "./layer2-style";
export { buildLayer3SellingPoints } from "./layer3-selling-points";
export { buildLayer4Characters } from "./layer4-characters";
export { buildLayer5Worldview } from "./layer5-worldview";
export { buildLayer6ChapterTask } from "./layer6-chapter-task";
export { buildLayer7ReaderExpect } from "./layer7-reader-expect";
