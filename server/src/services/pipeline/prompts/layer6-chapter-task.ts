/**
 * 第六层：章节任务（动态）
 *
 * 从 ChapterOutline 动态生成。
 * 定义本章必须完成什么、禁止完成什么。
 */

interface ChapterOutlineInfo {
  title?: string;
  goal?: string;
  conflict?: string;
  emotion?: string;
  hook?: string;
  mustDo?: string;     // JSON array string
  mustNotDo?: string;  // JSON array string
}

/**
 * 构建第六层：章节任务
 */
export function buildLayer6ChapterTask(outline?: ChapterOutlineInfo | null): string {
  if (!outline) {
    return '';
  }

  const parts: string[] = [];

  // 章节作用
  if (outline.goal) {
    parts.push(`章节作用：${outline.goal}`);
  }

  // 必须完成
  const mustDo = safeJsonParse(outline.mustDo, []);
  if (mustDo.length > 0) {
    parts.push(`必须完成：
${mustDo.map((m, i) => `${i + 1}. ${m}`).join('\n')}`);
  }

  // 禁止完成
  const mustNotDo = safeJsonParse(outline.mustNotDo, []);
  if (mustNotDo.length > 0) {
    parts.push(`禁止完成：
${mustNotDo.map((m, i) => `${i + 1}. ${m}`).join('\n')}`);
  }

  // 重点情绪
  if (outline.emotion) {
    parts.push(`重点情绪：${outline.emotion}`);
  }

  // 章末钩子
  if (outline.hook) {
    parts.push(`章末钩子：${outline.hook}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `【本章任务】
${parts.join('\n')}`;
}

/**
 * 安全解析 JSON 字符串
 */
function safeJsonParse<T>(json: string | undefined | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
