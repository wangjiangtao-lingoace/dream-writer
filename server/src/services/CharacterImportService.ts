import { prisma } from "../db/prisma";
import { LlmInvokeService } from "./llm/LlmInvokeService";
import { parseLlmJson } from "../utils/parseJson";

interface ParsedCharacter {
  name: string;
  role?: string;
  tags?: string[];
  personality?: {
    willDo?: string[];
    wontDo?: string[];
    growthRedline?: string;
  };
  arcDetail?: string;
  speechStyle?: string;
  knowledgeScope?: Array<{
    chapterRange?: string;
    unknownFacts?: string[];
    knownFacts?: string[];
  }>;
  appearance?: string;
  background?: string;
  motivation?: string;
  powerLevel?: string;
  relationships?: Array<{
    target: string;
    type: string;
    description?: string;
    stages?: Array<{
      phase: string;
      description: string;
    }>;
  }>;
}

interface ParseResult {
  characters: ParsedCharacter[];
}

export class CharacterImportService {
  private llmService: LlmInvokeService;

  constructor() {
    this.llmService = new LlmInvokeService();
  }

  /**
   * 从文本内容导入人物卡
   */
  async importFromText(novelId: string, textContent: string): Promise<{
    success: boolean;
    characters?: any[];
    error?: string;
  }> {
    try {
      // 验证小说存在
      const novel = await prisma.novel.findUnique({
        where: { id: novelId },
      });

      if (!novel) {
        return { success: false, error: "小说不存在" };
      }

      // 使用 LLM 解析文本
      const parseResult = await this.parseCharactersFromText(textContent);
      if (!parseResult) {
        return { success: false, error: "LLM 解析失败，请检查文本格式" };
      }

      // 存储解析结果到数据库
      const savedCharacters = await this.saveCharacters(novelId, parseResult.characters);

      return {
        success: true,
        characters: savedCharacters,
      };
    } catch (error) {
      console.error("CharacterImportService.importFromText error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "导入失败",
      };
    }
  }

  /**
   * 使用 LLM 解析文本内容
   */
  private async parseCharactersFromText(textContent: string): Promise<ParseResult | null> {
    const systemPrompt = `你是专业的小说人物卡解析助手。你需要从用户提供的文本中提取人物信息，并严格按照 JSON 格式返回。

请识别以下结构的人物卡：
- 人物卡标题（如"男主-林凡设定"、"女主设定"等）
- 基础信息：姓名、年龄、职业、标签等
- 核心人设约束：会做的事、不会做的事、成长红线
- 成长线/角色弧线描述
- 言语风格/说话方式
- 知识范围（角色在不同章节知道/不知道什么）
- 外貌、背景、动机等
- 与其他角色的关系及其变化

**输出格式要求（必须严格遵守）**：
\`\`\`json
{
  "characters": [
    {
      "name": "角色名",
      "role": "角色定位（如男主、女主、配角等）",
      "tags": ["标签1", "标签2"],
      "personality": {
        "willDo": ["他会做的事1", "他会做的事2"],
        "wontDo": ["他不会做的事1", "他不会做的事2"],
        "growthRedline": "成长红线或核心约束"
      },
      "arcDetail": "详细的角色成长线描述",
      "speechStyle": "言语风格描述",
      "knowledgeScope": [
        {
          "chapterRange": "1-10章",
          "unknownFacts": ["不知道的事实1"],
          "knownFacts": ["知道的事实1"]
        }
      ],
      "appearance": "外貌描述",
      "background": "背景故事",
      "motivation": "核心动机",
      "powerLevel": "战力等级或能力描述",
      "relationships": [
        {
          "target": "另一个角色名",
          "type": "关系类型（如祖孙、师徒、恋人、盟友、敌人等）",
          "description": "关系描述",
          "stages": [
            {
              "phase": "阶段名称（如开篇、前期、中期等）",
              "description": "该阶段的关系状态"
            }
          ]
        }
      ]
    }
  ]
}
\`\`\`

**解析规则**：
1. 仔细识别每个人物卡的边界（通常以"人物卡："或角色名开头）
2. 提取所有能找到的字段，缺失的字段省略即可
3. tags 提取关键标签，用简短词汇表示
4. personality 尽量完整提取"会做/不会做"的约束
5. arcDetail 提取角色成长线的完整描述（如"第1-20章：XXX → 第21-40章：XXX"）
6. knowledgeScope 提取角色在不同章节的知识范围
7. relationships 提取与其他角色的关系，注意关系的动态变化
8. 只返回 JSON，不要添加任何解释性文字

开始解析：`;

    const userPrompt = `请解析以下人物卡文本：

${textContent}`;

    try {
      const response = await this.llmService.completeTextOrThrow({
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.2,
        maxTokens: 12000, // 文本较长，需要更多 tokens
        provider: "mimo", // 使用 mimo
      });

      console.log("[CharacterImport] LLM 返回原始内容:", response.substring(0, 500));

      const parsed = parseLlmJson<ParseResult>(response);
      if (!parsed || !parsed.characters || !Array.isArray(parsed.characters)) {
        console.error("LLM 返回格式错误，原始内容:", response);
        return null;
      }

      console.log(`[CharacterImport] 成功解析 ${parsed.characters.length} 个角色`);
      return parsed;
    } catch (error) {
      console.error("LLM 解析失败:", error);
      if (error instanceof Error) {
        console.error("错误详情:", error.message);
        console.error("错误堆栈:", error.stack);
      }
      return null;
    }
  }

  /**
   * 保存解析后的人物到数据库
   */
  private async saveCharacters(novelId: string, characters: ParsedCharacter[]): Promise<any[]> {
    const savedCharacters: any[] = [];

    for (const char of characters) {
      // 准备基础数据
      const characterData = {
        name: char.name,
        role: char.role || null,
        tags: char.tags ? JSON.stringify(char.tags) : null,
        appearance: char.appearance || null,
        background: char.background || null,
        motivation: char.motivation || null,
        arcDetail: char.arcDetail || null,
        speechStyle: char.speechStyle || null,
        powerLevel: char.powerLevel || null,
        knowledgeScope: char.knowledgeScope ? JSON.stringify(char.knowledgeScope) : null,
        notes: char.personality ? JSON.stringify(char.personality) : null, // 将 personality 存储在 notes 中
      };

      // 创建或更新角色
      const savedChar = await prisma.character.upsert({
        where: {
          novelId_name: {
            novelId,
            name: char.name,
          },
        },
        create: {
          ...characterData,
          novelId,
        },
        update: characterData,
      });

      savedCharacters.push(savedChar);

      // 处理人物关系
      if (char.relationships && char.relationships.length > 0) {
        for (const rel of char.relationships) {
          // 构建关系描述（包含阶段信息）
          let description = rel.description || "";
          if (rel.stages && rel.stages.length > 0) {
            const stagesText = rel.stages
              .map((s) => `【${s.phase}】${s.description}`)
              .join("；");
            description = description ? `${description}\n${stagesText}` : stagesText;
          }

          // 查找角色 ID
          const charARecord = await prisma.character.findUnique({
            where: { novelId_name: { novelId, name: char.name } },
            select: { id: true },
          });
          const charBRecord = await prisma.character.findUnique({
            where: { novelId_name: { novelId, name: rel.target } },
            select: { id: true },
          });
          if (!charARecord || !charBRecord) continue;

          // 创建或更新关系（确保关系是双向的）
          const existing = await prisma.characterRelation.findFirst({
            where: {
              novelId,
              OR: [
                { charAId: charARecord.id, charBId: charBRecord.id },
                { charAId: charBRecord.id, charBId: charARecord.id },
              ],
            },
          });
          if (existing) {
            await prisma.characterRelation.update({
              where: { id: existing.id },
              data: { relType: rel.type, description },
            });
          } else {
            await prisma.characterRelation.create({
              data: {
                novelId,
                charAId: charARecord.id,
                charBId: charBRecord.id,
                relType: rel.type,
                description,
              },
            });
          }
        }
      }
    }

    return savedCharacters;
  }
}
