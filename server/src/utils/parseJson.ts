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

  // 4. Try fixing truncated JSON (LLM output cut off by maxTokens)
  if (start !== -1) {
    const truncated = cleaned.slice(start);
    const fixed = fixTruncatedJson(truncated);
    if (fixed) {
      try {
        return JSON.parse(fixed) as T;
      } catch {}
    }
  }

  // Failed to parse
  console.warn("JSON parse failed:", text.substring(0, 200));
  return null;
}

/**
 * Attempt to fix JSON truncated by maxTokens cutoff.
 * Closes open brackets/strings and removes trailing incomplete entries.
 */
function fixTruncatedJson(json: string): string | null {
  // Remove trailing incomplete string or value
  let fixed = json;

  // If ends mid-string (no closing quote), close it
  let inString = false;
  let escapeNext = false;
  let lastCompletePos = -1;

  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === '"') {
      inString = !inString;
      if (!inString) lastCompletePos = i;
    }
  }

  // If we're inside an unclosed string, truncate to last complete value and close it
  if (inString) {
    // Find the last complete key-value pair (last comma before the incomplete string)
    const lastComma = fixed.lastIndexOf(',', lastCompletePos);
    if (lastComma > 0) {
      fixed = fixed.slice(0, lastComma);
    } else {
      // Try to close the string
      fixed = fixed.slice(0, lastCompletePos + 1);
    }
  }

  // Count open brackets and close them
  const stack: string[] = [];
  inString = false;
  escapeNext = false;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }

  // Close any remaining open brackets
  while (stack.length > 0) {
    const open = stack.pop()!;
    fixed += open === '{' ? '}' : ']';
  }

  // Final cleanup: remove trailing commas before closing brackets
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  return fixed;
}
