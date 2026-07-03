/**
 * 第三层：本书核心约束（动态）
 *
 * 这是最关键的一层，决定 AI 是否能抓住本书的核心卖点。
 * 从数据库 Novel 的 coreSellingPoint/corePayoffs/coreConflict/readerExpectations 字段读取。
 */

interface NovelSellingPoints {
  coreSellingPoint?: string;
  corePayoffs?: string;  // JSON array string
  coreConflict?: string;
  readerExpectations?: string;  // JSON array string
}

/**
 * 构建第三层：本书核心约束
 */
export function buildLayer3SellingPoints(novel: NovelSellingPoints): string {
  const parts: string[] = [];

  // 解析 JSON 数组
  const corePayoffs = safeJsonParse(novel.corePayoffs, []);
  const readerExpectations = safeJsonParse(novel.readerExpectations, []);

  // 核心卖点
  if (novel.coreSellingPoint) {
    parts.push(`核心卖点：${novel.coreSellingPoint}`);
  }

  // 核心爽点
  if (corePayoffs.length > 0) {
    parts.push(`核心爽点：${corePayoffs.join('、')}`);
  }

  // 核心矛盾
  if (novel.coreConflict) {
    parts.push(`核心矛盾：${novel.coreConflict}`);
  }

  // 读者期待
  if (readerExpectations.length > 0) {
    parts.push(`读者期待：${readerExpectations.join('、')}`);
  }

  // 如果没有任何核心信息，返回空字符串
  if (parts.length === 0) {
    return '';
  }

  return `【本书核心卖点】
${parts.join('\n')}

所有剧情必须围绕以上内容展开。
如果某段剧情无法服务于：
- 核心卖点
- 核心爽点
- 核心矛盾
则优先删除。`;
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
