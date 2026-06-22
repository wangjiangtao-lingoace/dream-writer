/**
 * Parse JSON from LLM response text.
 * Handles: direct JSON, markdown-fenced JSON (```json ... ```), JSON embedded in prose.
 * Returns null on failure (callers provide their own fallback).
 */
export function parseLlmJson<T = any>(text: string | null): T | null {
  if (!text) return null;

  // 0. Pre-strip markdown fences (handles mimo and similar providers)
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    // Remove opening fence: ```json\n or ```\n
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, "");
    // Remove closing fence
    cleaned = cleaned.replace(/\n?```\s*$/, "");
    cleaned = cleaned.trim();
  }

  // 1. Try direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch {}

  // 2. Try extracting from ```json ... ``` fences (in case stripping left nested fences)
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {}
  }

  // 3. Try finding first { or [ and matching closing bracket
  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  let start = -1;
  let end = -1;

  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    start = objStart;
    end = cleaned.lastIndexOf("}");
  } else if (arrStart !== -1) {
    start = arrStart;
    end = cleaned.lastIndexOf("]");
  }

  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {}
  }

  // Failed to parse
  console.warn("JSON parse failed:", text.substring(0, 200));
  return null;
}
