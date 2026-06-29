/**
 * 第六层：章节任务 — 章节导演（动态）
 *
 * 从 ChapterOutline 动态生成。
 * 定义本章的场景、冲突、爽点、人物行为、硬性要求。
 */

import { formatJsonArray, formatPleasurePoint } from "../promptFormatters";

interface ChapterOutlineInfo {
  title?: string;
  goal?: string;
  conflict?: string;
  emotion?: string;
  hook?: string;
  mustDo?: string;     // JSON array string
  mustNotDo?: string;  // JSON array string
  // v2.5 章纲扩展字段
  chapterType?: string;
  chapterFunction?: string;
  readerPromise?: string;
  requiredReaderEmotion?: string;
  pleasurePoint?: string;     // JSON string
  payoffChainRefs?: string;   // JSON array string
  comedyMechanism?: string;
  endingQuestion?: string;
  // 场景与视角
  scene?: string;
  pov?: string;
  // 字数
  targetWordCount?: number;
}

/**
 * 构建第六层：章节导演指令
 */
export function buildLayer6ChapterTask(outline?: ChapterOutlineInfo | null): string {
  if (!outline) {
    return `【本章任务 — 章节导演指令】
本章没有章纲数据。请严格承接上一章结尾，保持人物口吻、世界规则和当前剧情状态，不得跳跃。
硬性要求：
1. 不得重新开局；
2. 不得跳过上一章结尾；
3. 不得用旁白总结代替具体场景；
4. 必须保持人物口吻一致。`;
  }

  const parts: string[] = [];

  // 章节类型
  if (outline.chapterType) {
    parts.push(`章节类型：${outline.chapterType}`);
  }

  // 章节功能
  if (outline.chapterFunction) {
    parts.push(`章节功能：${outline.chapterFunction}`);
  } else if (outline.goal) {
    parts.push(`章节作用：${outline.goal}`);
  }

  // 场景
  if (outline.scene) {
    parts.push(`场景：${outline.scene}`);
  }

  // 视角
  if (outline.pov) {
    parts.push(`叙事视角：${outline.pov}`);
  }

  // 读者承诺
  if (outline.readerPromise) {
    parts.push(`读者承诺：${outline.readerPromise}`);
  }

  // 目标读者情绪
  if (outline.requiredReaderEmotion) {
    parts.push(`目标读者情绪：${outline.requiredReaderEmotion}`);
  } else if (outline.emotion) {
    parts.push(`重点情绪：${outline.emotion}`);
  }

  // 核心冲突
  if (outline.conflict) {
    parts.push(`核心冲突：${outline.conflict}`);
  }

  // 爽点
  const pleasurePoint = formatPleasurePoint(outline.pleasurePoint);
  if (pleasurePoint) {
    parts.push(`本章爽点：${pleasurePoint}`);
  }

  // 喜剧机制
  if (outline.comedyMechanism) {
    parts.push(`喜剧机制：${outline.comedyMechanism}`);
  }

  // 爽点链引用
  const payoffRefs = formatJsonArray(outline.payoffChainRefs);
  if (payoffRefs) {
    parts.push(`爽点链关联：${payoffRefs}`);
  }

  // 必须完成
  const mustDo = formatJsonArray(outline.mustDo);
  if (mustDo) {
    parts.push(`必须完成：${mustDo}`);
  }

  // 禁止完成
  const mustNotDo = formatJsonArray(outline.mustNotDo);
  if (mustNotDo) {
    parts.push(`禁止完成：${mustNotDo}`);
  }

  // 章末钩子
  if (outline.hook) {
    parts.push(`章末钩子：${outline.hook}`);
  }

  // 结尾悬念
  if (outline.endingQuestion) {
    parts.push(`结尾悬念：${outline.endingQuestion}`);
  }

  // 字数硬性要求
  if (outline.targetWordCount) {
    const minWords = Math.round(outline.targetWordCount * 0.9);
    parts.push(`字数要求：不少于 ${minWords} 字（目标 ${outline.targetWordCount} 字）`);
  }

  // 硬性写作要求
  parts.push(`硬性要求：
1. 不得用旁白总结代替具体场景，必须写"谁在什么空间做了什么动作"
2. 每个 Beat 必须有可见动作（角色在做什么），不能只有内心独白
3. 对话必须有潜台词，不能只是信息交换
4. 场景转换必须有空行标记，不能混在同一段落`);

  if (parts.length === 0) {
    return '';
  }

  return `【本章任务 — 章节导演指令】
${parts.join('\n')}`;
}
