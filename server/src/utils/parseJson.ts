/**
 * Parse JSON from LLM response text.
 * Handles: direct JSON, markdown-fenced JSON (```json ... ```), JSON embedded in prose.
 * Returns null on failure (callers provide their own fallback).
 */
export function parseLlmJson<T = any>(text: string | null): T | null {
  if (!text) return null;

  // 1. Try direct parse
  try {
    return JSON.parse(text) as T;
  } catch {}

  // 2. Try extracting from ```json ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {}
  }

  // 3. Try finding first { or [ and matching closing bracket
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  let start = -1;
  let end = -1;

  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    start = objStart;
    end = text.lastIndexOf("}");
  } else if (arrStart !== -1) {
    start = arrStart;
    end = text.lastIndexOf("]");
  }

  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {}
  }

  // Failed to parse
  console.warn("JSON parse failed:", text.substring(0, 200));
  return null;
}
