/**
 * Prompt 格式化工具
 * 所有 JSON 字符串字段进入 Prompt 前必须通过此文件格式化为人类可读文本。
 * ContextAssembler、Layer4、Layer6、Beat Prompt 全部复用。
 */

/**
 * 安全 JSON 解析
 */
export function safeParseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * JSON 数组 → "紧张、期待"
 * 处理：["紧张","期待"] / "紧张、期待" / null / undefined
 */
export function formatJsonArray(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join("、");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join("、");
      return value;
    } catch {
      return value;
    }
  }
  return String(value);
}

/**
 * pleasurePoint 对象/字符串 → 人类可读文本
 * 处理：{type, intensity, description} / "爽点描述" / null
 */
export function formatPleasurePoint(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed.description || JSON.stringify(parsed);
      }
      return value;
    } catch {
      return value;
    }
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (obj.description as string) || JSON.stringify(value);
  }
  return String(value);
}

/**
 * JSON 对象 → 人类可读文本
 * 处理：{key: value} / "{\"key\":\"value\"}" / null
 */
export function formatJsonObject(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return Object.entries(parsed)
          .map(([k, v]) => `${k}: ${v}`)
          .join("；");
      }
      return value;
    } catch {
      return value;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${v}`)
      .join("；");
  }
  return String(value);
}

/**
 * 通用：可能是 JSON 也可能是纯文本，统一输出可读文本
 */
export function formatMaybeJson(value: unknown): string {
  if (!value) return "";
  if (typeof value !== "string") return String(value);
  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join("、");
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join("；");
    }
    return String(parsed);
  } catch {
    return value;
  }
}

/**
 * worldview.rules 安全解析为字符串数组
 * rules 可能是 JSON 数组、普通文本、或以分号/句号分隔的规则
 */
export function safeParseRules(rules: string | null | undefined): string[] {
  if (!rules) return [];
  try {
    const parsed = JSON.parse(rules);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === "string") return [parsed];
    return [JSON.stringify(parsed)];
  } catch {
    return rules
      .split(/[；;。\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
