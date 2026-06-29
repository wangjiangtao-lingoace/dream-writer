import { MaterialSection } from "./MaterialSectionParser";

export interface MaterialNovelPatch {
  coreSellingPoint?: string;
  corePayoffs?: string[];
  coreConflict?: string;
  readerExpectations?: string[];
  outline?: string;
  targetWordCount?: number;
  volumeCount?: number;
  chaptersPerVol?: number;
}

export interface MaterialCharacterDto {
  name: string;
  role: string;
  personality: string;
  behaviorRules: string[];
  forbiddenBehavior: string[];
  rawProfile: string;
  sourceType: "user_original";
  isCanonical: true;
  speechStyle?: string;
  signatureLines?: string[];
  signatureScenes?: string[];
  comedyMechanisms?: string;
  emotionalHooks?: string;
  abilities?: string;
  appearance?: string;
  background?: string;
  motivation?: string;
  arcDetail?: string;
}

export interface MaterialHookDto {
  code: string;
  title: string;
  description: string;
  plannedChapter: number | null;
  resolvedChapter: number | null;
  status: "planned";
}

export interface MaterialConstraintDto {
  title: string;
  content: string;
  priority: number;
  scope: string;
}

export interface MappedMaterialAssets {
  novelPatch: MaterialNovelPatch;
  characters: MaterialCharacterDto[];
  hooks: MaterialHookDto[];
  constraints: MaterialConstraintDto[];
  knowledgeAssets: Array<{ title: string; category: string; content: string; tags: string[] }>;
}

function stripHeader(content: string): string {
  return content.split(/\r?\n/).slice(1).join("\n").trim();
}

function firstMatch(content: string, pattern: RegExp): string {
  return content.match(pattern)?.[1]?.trim() || "";
}

function collectBulletsAfter(content: string, heading: string): string[] {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(line => line.includes(heading));
  if (start < 0) return [];
  const result: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^(他不会做的事|成长红线|当前属性|标志性场景|标志性桥段|喜剧机制|情绪钩子|情绪触发|能力设定|能力体系|外貌|外貌特征|背景|背景故事|动机|成长弧线|成长线|四、|五、|六、|七、|八、|九、|十、|十一、|二、|三、)/.test(line)) break;
    if (line.startsWith("-")) result.push(line.replace(/^-\s*/, ""));
  }
  return result;
}

/**
 * 提取某个标题下的多行内容，直到遇到下一个同级标题或段落结束
 */
function extractSectionAfter(content: string, heading: string, maxLength = 500): string {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(line => line.includes(heading));
  if (start < 0) return "";
  const result: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { result.push(""); continue; }
    // 遇到下一个段落标题（中文数字序号或 section marker）则停止
    if (/^(一、|二、|三、|四、|五、|六、|七、|八、|九、|十、|十一、|━━━)/.test(line)) break;
    result.push(line);
  }
  const text = result.join("\n").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function extractChapterNumber(value: string): number | null {
  const digit = value.match(/第\s*(\d+)\s*章/);
  if (digit) return Number(digit[1]);
  return null;
}

function mapCharacter(section: MaterialSection): MaterialCharacterDto {
  const header = section.title.replace(/^男主-/, "人物卡：").replace(/^人物卡[:：]/, "").replace(/^男\d+-/, "人物卡：");
  const name = firstMatch(section.content, /姓名[:：]\s*([^\n]+)/) || header.replace(/[（(].*$/, "").replace(/设定$/, "").trim();
  const role = section.title.match(/[（(]([^）)]+)[）)]/)?.[1]
    || (section.title.includes("男主") ? "男主" : section.title.includes("男2") ? "男二" : "")
    || firstMatch(section.content, /阴间身份[:：]\s*([^\n]+)/)?.split("→")[0]?.trim()
    || "";
  const personality = firstMatch(section.content, /核心定位[:：]\s*([^\n]+)/)
    || firstMatch(section.content, /本质是[:：]?\s*([^\n]+)/)
    || firstMatch(section.content, /[。]+的本质是[:：]?\s*([^\n]+)/);
  const background = firstMatch(section.content, /家庭背景[:：]\s*([^\n]+)/)
    || firstMatch(section.content, /阳间身份[:：]\s*([^\n]+)/)
    || firstMatch(section.content, /阳间职业[^：]*[:：]\s*([^\n]+)/);
  const motivation = firstMatch(section.content, /核心定位[:：]\s*([^\n]+)/)
    || firstMatch(section.content, /标签[:：]\s*([^\n]+)/);
  const arcDetail = extractSectionAfter(section.content, "成长红线");
  const abilities = extractSectionAfter(section.content, "能力体系") || extractSectionAfter(section.content, "当前属性");
  const comedyMechanisms = extractSectionAfter(section.content, "喜剧性格")
    || extractSectionAfter(section.content, "特殊设定")
    || firstMatch(section.content, /喜剧核心[^，。]*[:：]?\s*([^\n]+)/);
  const speechStyle = firstMatch(section.content, /说话风格[:：]\s*([^\n]+)/)
    || firstMatch(section.content, /言语风格[:：]\s*([^\n]+)/)
    || firstMatch(section.content, /说话[^。]*[:：]?\s*([^\n]*慢条斯理[^\n]*)/)
    || firstMatch(section.content, /说话[^。]*[:：]?\s*([^\n]*口语化[^\n]*)/);

  return {
    name,
    role,
    personality,
    behaviorRules: collectBulletsAfter(section.content, "他会做的事"),
    forbiddenBehavior: collectBulletsAfter(section.content, "他不会做的事"),
    rawProfile: section.content,
    sourceType: "user_original",
    isCanonical: true,
    speechStyle,
    signatureLines: collectBulletsAfter(section.content, "标志性台词"),
    signatureScenes: collectBulletsAfter(section.content, "标志性场景") || collectBulletsAfter(section.content, "标志性桥段"),
    comedyMechanisms,
    emotionalHooks: firstMatch(section.content, /情绪钩子[:：]\s*([^\n]+)/) || firstMatch(section.content, /情绪触发[:：]\s*([^\n]+)/),
    abilities,
    appearance: firstMatch(section.content, /外貌[:：]\s*([^\n]+)/) || firstMatch(section.content, /外貌特征[:：]\s*([^\n]+)/),
    background,
    motivation,
    arcDetail,
  };
}

function mapHooks(section: MaterialSection): MaterialHookDto[] {
  return section.content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^\|\s*[A-Z]?\d+-\d+\s*\|/.test(line))
    .map(line => line.split("|").map(cell => cell.trim()).filter(Boolean))
    .filter(cells => cells.length >= 5)
    .map(cells => ({
      code: cells[0],
      title: cells[1],
      plannedChapter: extractChapterNumber(cells[2]),
      resolvedChapter: extractChapterNumber(cells[3]),
      description: cells.slice(4).join(" | "),
      status: "planned" as const,
    }));
}

function mapPlanNumbers(content: string, patch: MaterialNovelPatch): void {
  const wordRange = content.match(/总字数规划[:：]\s*(\d+)\s*-\s*(\d+)万字/);
  if (wordRange) patch.targetWordCount = Number(wordRange[2]) * 10000;
  const volumeCount = content.match(/总卷数规划[:：]\s*(\d+)卷/);
  if (volumeCount) patch.volumeCount = Number(volumeCount[1]);
  const chapterRange = content.match(/总章数规划[:：]\s*(\d+)\s*-\s*(\d+)章/);
  if (chapterRange) patch.chaptersPerVol = Math.ceil(Number(chapterRange[2]) / (patch.volumeCount || 6));
}

export function mapMaterialSections(sections: MaterialSection[]): MappedMaterialAssets {
  const assets: MappedMaterialAssets = {
    novelPatch: {},
    characters: [],
    hooks: [],
    constraints: [],
    knowledgeAssets: [],
  };

  for (const section of sections) {
    if (section.type === "core_selling_point") {
      const value = stripHeader(section.content).split(/\r?\n/).map(s => s.trim()).find(Boolean) || "";
      assets.novelPatch.coreSellingPoint = value;
      assets.novelPatch.corePayoffs = value.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
      assets.novelPatch.readerExpectations = assets.novelPatch.corePayoffs;
    }
    if (section.type === "character_card") {
      assets.characters.push(mapCharacter(section));
    }
    if (section.type === "hook_table") {
      assets.hooks.push(...mapHooks(section));
      assets.knowledgeAssets.push({ title: "钩子预埋与回收全表", category: "hook_plan", content: section.content, tags: ["material", "hook", "foreshadow"] });
    }
    if (section.type === "writing_constraints") {
      assets.constraints.push({ title: section.title, content: section.content, priority: 10, scope: "global" });
      assets.knowledgeAssets.push({ title: "强制约束规则", category: "writing_constraints", content: section.content, tags: ["material", "constraint", "p0"] });
    }
    if (["worldview", "overall_plan", "creative_document"].includes(section.type)) {
      if (section.type === "overall_plan" || section.type === "creative_document") {
        mapPlanNumbers(section.content, assets.novelPatch);
      }
      assets.knowledgeAssets.push({ title: section.title, category: section.type, content: section.content, tags: ["material", section.type] });
    }
  }

  return assets;
}
