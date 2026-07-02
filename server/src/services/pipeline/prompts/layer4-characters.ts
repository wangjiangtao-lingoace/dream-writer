/**
 * 第四层：角色约束（动态）
 *
 * 从数据库 Character 动态生成。
 * 重点是行为规则，不是人物传记。
 */

import { formatJsonArray } from "../promptFormatters";

interface CharacterInfo {
  name: string;
  role?: string;
  identity?: string;
  personality?: string;
  motivation?: string;
  speechStyle?: string;
  notes?: string;  // JSON string with canDo/cannotDo
  // v3.0 新增字段
  behaviorRules?: string;      // JSON array string
  forbiddenBehavior?: string;  // JSON array string
  signatureLines?: string;     // JSON array string
  signatureScenes?: string;    // JSON array string
  comedyMechanisms?: string;   // JSON array string
  emotionalHooks?: string;     // JSON array string
}

interface CharacterNotes {
  canDo?: string[];
  cannotDo?: string[];
}

/**
 * 构建第四层：角色约束
 */
export function buildLayer4Characters(characters: CharacterInfo[]): string {
  if (!characters || characters.length === 0) {
    return '';
  }

  // 限制最多8个角色，优先保留：主角 > 反派 > 配角 > 其他
  const MAX_CHARACTERS = 8;
  const rolePriority: Record<string, number> = { "主角": 0, "反派": 1, "配角": 2 };
  const sortedCharacters = [...characters].sort((a, b) => {
    const pa = rolePriority[a.role ?? ""] ?? 3;
    const pb = rolePriority[b.role ?? ""] ?? 3;
    return pa - pb;
  });
  const displayCharacters = sortedCharacters.slice(0, MAX_CHARACTERS);
  const hasMore = characters.length > MAX_CHARACTERS;

  const charBlocks = displayCharacters.map(char => {
    const parts: string[] = [];

    // 基本信息
    parts.push(`${char.name}（${char.role || '角色'}）`);

    // 性格
    if (char.personality) {
      parts.push(`性格：${char.personality}`);
    }

    // 行为原则（从 notes 中提取）
    const notes: CharacterNotes = safeJsonParse(char.notes, {});
    if (notes.canDo && notes.canDo.length > 0) {
      parts.push(`行为原则：${notes.canDo.join('、')}`);
    }

    // 绝不会（从 notes 中提取）
    if (notes.cannotDo && notes.cannotDo.length > 0) {
      parts.push(`绝不会：${notes.cannotDo.join('、')}`);
    }

    // 行为规则
    const behaviorRules = formatJsonArray(char.behaviorRules);
    if (behaviorRules) {
      parts.push(`行为规则：${behaviorRules}`);
    }

    // 禁止行为
    const forbiddenBehavior = formatJsonArray(char.forbiddenBehavior);
    if (forbiddenBehavior) {
      parts.push(`禁止行为：${forbiddenBehavior}`);
    }

    // 标志台词
    const signatureLines = formatJsonArray(char.signatureLines);
    if (signatureLines) {
      parts.push(`标志台词：${signatureLines}`);
    }

    // 标志场景
    const signatureScenes = formatJsonArray(char.signatureScenes);
    if (signatureScenes) {
      parts.push(`标志场景：${signatureScenes}`);
    }

    // 喜剧机制
    const comedyMechanisms = formatJsonArray(char.comedyMechanisms);
    if (comedyMechanisms) {
      parts.push(`喜剧机制：${comedyMechanisms}`);
    }

    // 情绪触发点
    const emotionalHooks = formatJsonArray(char.emotionalHooks);
    if (emotionalHooks) {
      parts.push(`情绪触发点：${emotionalHooks}`);
    }

    // 说话风格
    if (char.speechStyle) {
      parts.push(`说话风格：${char.speechStyle}`);
    }

    return parts.join('\n');
  });

  return `【角色约束】
${charBlocks.join('\n\n')}${hasMore ? `\n\n（共${characters.length}个角色，仅显示最重要的${MAX_CHARACTERS}个）` : ''}`;
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
