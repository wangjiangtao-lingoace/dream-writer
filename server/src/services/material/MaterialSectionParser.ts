export type MaterialSectionType =
  | "character_card"
  | "worldview"
  | "core_selling_point"
  | "overall_plan"
  | "creative_document"
  | "hook_table"
  | "writing_constraints"
  | "canonical_chapters"
  | "unknown";

export interface MaterialSection {
  type: MaterialSectionType;
  title: string;
  content: string;
  startLine: number;
  endLine: number;
}

interface Marker {
  type: MaterialSectionType;
  title: string;
  lineIndex: number;
}

const CHARACTER_HEADER = /^(?:#\s*)?人物卡[:：].+|^男主-.+设定$/;
const SECTION_HEADERS: Array<{ type: MaterialSectionType; pattern: RegExp }> = [
  { type: "worldview", pattern: /^世界观\s*$/ },
  { type: "core_selling_point", pattern: /^核心卖点\s*$/ },
  { type: "overall_plan", pattern: /^整体规划\s*$/ },
  { type: "creative_document", pattern: /^完整创作文档\s*$/ },
  { type: "hook_table", pattern: /^钩子预埋与回收全表\s*$/ },
  { type: "writing_constraints", pattern: /^强制约束规则\s*$/ },
  { type: "canonical_chapters", pattern: /^第\s*[一二三四五六七八九十百千万零〇\d]+\s*章\s*.*$/ },
];

function cleanHeader(line: string): string {
  return line.trim().replace(/^#+\s*/, "").trim();
}

function markerForLine(line: string, lineIndex: number): Marker | null {
  const header = cleanHeader(line);
  if (!header) return null;
  if (CHARACTER_HEADER.test(header)) {
    return { type: "character_card", title: header, lineIndex };
  }
  for (const candidate of SECTION_HEADERS) {
    if (candidate.pattern.test(header)) {
      return { type: candidate.type, title: header, lineIndex };
    }
  }
  return null;
}

function looksLikeCanonicalChapterStart(lines: string[], lineIndex: number): boolean {
  const bodyLines: string[] = [];
  for (let i = lineIndex + 1; i < Math.min(lines.length, lineIndex + 35); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (markerForLine(line, i)?.type === "canonical_chapters") break;
    bodyLines.push(line);
  }
  const sample = bodyLines.join("\n");
  if (sample.length < 300) return false;

  const listLikeLines = bodyLines.filter(line => /^[-*|>]|^\d+[\.、]/.test(line)).length;
  if (listLikeLines > bodyLines.length / 3) return false;

  const novelSignals = /[“"「」]|他[说道喊叫想看]|她[说道喊叫想看]|我[说道喊叫想看]|走过来|看了看|笑了笑|沉默|房间|门口|夜色|街道|声音|心里|眼前/;
  return novelSignals.test(sample);
}

export function parseMaterialSections(text: string): MaterialSection[] {
  const lines = text.split(/\r?\n/);
  const markers: Marker[] = [];

  for (let i = 0; i < lines.length; i++) {
    const marker = markerForLine(lines[i], i);
    if (!marker) continue;
    if (marker.type === "canonical_chapters" && !looksLikeCanonicalChapterStart(lines, i)) continue;

    const previous = markers[markers.length - 1];
    if (marker.type === "canonical_chapters" && previous?.type === "canonical_chapters") {
      continue;
    }
    markers.push(marker);
  }

  return markers.map((marker, index) => {
    const next = markers[index + 1];
    const endLine = next ? next.lineIndex - 1 : lines.length - 1;
    return {
      type: marker.type,
      title: marker.title,
      content: lines.slice(marker.lineIndex, endLine + 1).join("\n").trim(),
      startLine: marker.lineIndex + 1,
      endLine: endLine + 1,
    };
  }).filter(section => section.content.length > 0);
}
