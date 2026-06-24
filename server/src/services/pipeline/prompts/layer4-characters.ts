/**
 * 第四层：角色约束（动态）
 *
 * 从数据库 Character 动态生成。
 * 重点是行为规则，不是人物传记。
 */

interface CharacterInfo {
  name: string;
  role?: string;
  identity?: string;
  personality?: string;
  motivation?: string;
  speechStyle?: string;
  notes?: string;  // JSON string with canDo/cannotDo
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

  const charBlocks = characters.map(char => {
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

    // 说话风格
    if (char.speechStyle) {
      parts.push(`说话风格：${char.speechStyle}`);
    }

    return parts.join('\n');
  });

  return `【角色约束】
${charBlocks.join('\n\n')}`;
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
