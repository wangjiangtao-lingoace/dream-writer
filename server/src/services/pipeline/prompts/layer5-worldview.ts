/**
 * 第五层：世界观约束（动态）
 *
 * 从数据库 Worldview 动态生成。
 * 定义世界观的核心规则和限制。
 */

interface WorldviewInfo {
  name?: string;
  summary?: string;
  rules?: string;  // JSON array string or plain text
  powerSystem?: string;
}

/**
 * 构建第五层：世界观约束
 */
export function buildLayer5Worldview(worldview?: WorldviewInfo | null): string {
  if (!worldview) {
    return '';
  }

  const parts: string[] = [];

  // 世界名称
  if (worldview.name) {
    parts.push(`世界：${worldview.name}`);
  }

  // 世界概述
  if (worldview.summary) {
    parts.push(`概述：${worldview.summary.slice(0, 200)}`);
  }

  // 世界规则
  if (worldview.rules) {
    const rules = parseRules(worldview.rules);
    if (rules.length > 0) {
      parts.push(`核心规则：
${rules.map(r => `- ${r}`).join('\n')}`);
    }
  }

  // 力量体系
  if (worldview.powerSystem) {
    parts.push(`力量体系：
${worldview.powerSystem.slice(0, 300)}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `【世界观规则】
${parts.join('\n')}

禁止出现与既有规则冲突的能力。`;
}

/**
 * 解析规则（支持 JSON 数组或纯文本）
 */
function parseRules(rules: string): string[] {
  // 尝试 JSON 解析
  try {
    const parsed = JSON.parse(rules);
    if (Array.isArray(parsed)) {
      return parsed.filter(r => typeof r === 'string');
    }
  } catch {}

  // 按换行分割
  return rules.split('\n').filter(r => r.trim().length > 0);
}
