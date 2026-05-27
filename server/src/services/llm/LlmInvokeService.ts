import type { LLMProvider } from "@dream-writer/shared/types/llm";
import {
  getProviderDefaultBaseUrl,
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  providerRequiresApiKey,
} from "../../llm/providers";
import { prisma } from "../../db/prisma";
import { decryptApiKey } from "../../utils/crypto";
import { withRetry } from "../../utils/retry";

export interface ChapterDraftInput {
  novelTitle: string;
  inspiration?: string | null;
  outline?: string | null;
  genre?: string | null;
  chapterTitle: string;
  chapterSummary?: string | null;
  existingContent?: string | null;
}

interface ResolvedModelConfig {
  provider: LLMProvider;
  model: string;
  baseURL: string;
  apiKey?: string;
}

async function resolveModelConfig(): Promise<ResolvedModelConfig | null> {
  // 优先级: DB 默认配置 > .env 环境变量
  try {
    const dbConfig = await prisma.aIConfig.findFirst({ where: { isDefault: true } });
    if (dbConfig) {
      return {
        provider: dbConfig.provider as LLMProvider,
        model: dbConfig.model,
        baseURL: dbConfig.baseUrl || getProviderDefaultBaseUrl(dbConfig.provider as LLMProvider) || "https://api.openai.com/v1",
        apiKey: decryptApiKey(dbConfig.apiKey),
      };
    }
  } catch {
    // DB 查询失败时静默降级到 .env
  }

  const provider = (process.env.DEFAULT_LLM_PROVIDER?.trim() || "openai") as LLMProvider;
  const model = process.env.DEFAULT_LLM_MODEL?.trim()
    || getProviderEnvModel(provider)
    || "gpt-5-mini";
  const baseURL = process.env.DEFAULT_LLM_BASE_URL?.trim()
    || getProviderEnvBaseUrl(provider)
    || getProviderDefaultBaseUrl(provider)
    || "https://api.openai.com/v1";
  const apiKey = process.env.DEFAULT_LLM_API_KEY?.trim() || getProviderEnvApiKey(provider);

  if (providerRequiresApiKey(provider) && !apiKey) {
    return null;
  }
  return { provider, model, baseURL, apiKey };
}

function buildFallbackDraft(input: ChapterDraftInput): string {
  const setting = input.genre ? `这是一部${input.genre}小说。` : "这是一部正在成形的小说。";
  const seed = input.inspiration || input.outline || "主角在命运转折处迈出第一步。";
  const chapterAim = input.chapterSummary || "本章需要推进人物选择，并留下下一章的牵引。";

  return [
    `《${input.novelTitle}》`,
    "",
    `【${input.chapterTitle}】`,
    "",
    `${setting}${seed}`,
    "",
    `夜色像一页微微泛黄的纸，压在案头。主角站在旧事与新局之间，终于明白此刻不能再退。`,
    "",
    `他先确认眼前最紧要的事：${chapterAim} 于是，原本散乱的线索开始聚成一束，人物的欲望、阻力和代价也随之浮出水面。`,
    "",
    `这一章可以继续扩写为正式正文：补足场景感、人物对话、冲突升级和结尾钩子。当前为本地兜底草稿；配置 OpenAI 兼容模型密钥后，会改为真实流式生成。`,
  ].join("\n");
}

function buildPrompt(input: ChapterDraftInput): string {
  return [
    "你是 Dream Writer 的小说正文助手。请用中文写一段可直接放入章节编辑器的小说正文草稿。",
    "要求：保留文学性，避免解释性提纲，优先呈现场景、动作、心理和对话。",
    "",
    `小说名：${input.novelTitle}`,
    `类型：${input.genre || "未指定"}`,
    `灵感：${input.inspiration || "未填写"}`,
    `大纲：${input.outline || "未填写"}`,
    `章节名：${input.chapterTitle}`,
    `章节目标：${input.chapterSummary || "推进剧情并形成下一章钩子"}`,
    input.existingContent ? `已有正文，可在此基础上续写或改写：\n${input.existingContent}` : "",
  ].filter(Boolean).join("\n");
}

function extractOpenAIStreamDelta(line: string): string {
  if (!line.startsWith("data: ")) {
    return "";
  }
  const raw = line.slice("data: ".length).trim();
  if (!raw || raw === "[DONE]") {
    return "";
  }
  try {
    const json = JSON.parse(raw) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return json.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly model: string,
    public readonly statusCode?: number,
    options?: { cause?: unknown },
  ) {
    // @ts-expect-error — Error(message, options) is ES2022, works at runtime in Node 20+
    super(message, options);
    this.name = "LlmError";
  }
}

export class LlmInvokeService {
  async completeTextOrThrow(input: { system?: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<string> {
    return withRetry(() => this.doCompleteText(input));
  }

  private async doCompleteText(input: { system?: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<string> {
    const config = await resolveModelConfig();
    const provider = config?.provider ?? "unknown";
    const model = config?.model ?? "unknown";
    if (!config) {
      throw new LlmError("未配置 LLM", provider, model);
    }

    const response = await fetch(`${config.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: input.temperature ?? 0.35,
        max_tokens: input.maxTokens ?? 1800,
        messages: [
          { role: "system", content: input.system || "你是严谨的中文长篇小说拆书分析助手。" },
          { role: "user", content: input.prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new LlmError(`LLM 请求失败: ${response.status}`, config.provider, config.model, response.status);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new LlmError("LLM 返回空内容", config.provider, config.model);
    }
    return content;
  }

  async completeText(input: { system?: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<string | null> {
    try {
      return await this.completeTextOrThrow(input);
    } catch {
      return null;
    }
  }

  async *streamText(input: { system?: string; prompt: string; temperature?: number; maxTokens?: number }): AsyncGenerator<string> {
    const config = await resolveModelConfig();
    if (!config) {
      yield* this.streamFallbackRaw(input.prompt);
      return;
    }

    const response = await fetch(`${config.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        temperature: input.temperature ?? 0.8,
        max_tokens: input.maxTokens ?? 4000,
        messages: [
          { role: "system", content: input.system || "你是严谨的中文长篇小说助手。" },
          { role: "user", content: input.prompt },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      yield* this.streamFallbackRaw(input.prompt);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const text = extractOpenAIStreamDelta(line.trim());
        if (text) {
          yield text;
        }
      }
    }
    // 处理 buffer 中剩余数据
    if (buffer.trim()) {
      const text = extractOpenAIStreamDelta(buffer.trim());
      if (text) yield text;
    }
  }

  private async *streamFallbackRaw(prompt: string): AsyncGenerator<string> {
    const draft = `生成失败：未配置 LLM API Key。请在 server/.env 中配置 DEFAULT_LLM_API_KEY。\n\n原始 prompt 前 200 字：${prompt.substring(0, 200)}`;
    for (const part of draft.match(/.{1,24}|\n/gus) ?? [draft]) {
      yield part;
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  }

  async *streamChapterDraft(input: ChapterDraftInput): AsyncGenerator<string> {
    const config = await resolveModelConfig();
    if (!config) {
      yield* this.streamFallback(input);
      return;
    }

    const response = await fetch(`${config.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        temperature: 0.8,
        messages: [
          { role: "system", content: "你是克制、细腻、重视叙事推进的中文小说写作助手。" },
          { role: "user", content: buildPrompt(input) },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      yield* this.streamFallback(input);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const text = extractOpenAIStreamDelta(line.trim());
        if (text) {
          yield text;
        }
      }
    }
    // 处理 buffer 中剩余数据
    if (buffer.trim()) {
      const text = extractOpenAIStreamDelta(buffer.trim());
      if (text) yield text;
    }
  }

  private async *streamFallback(input: ChapterDraftInput): AsyncGenerator<string> {
    const draft = buildFallbackDraft(input);
    for (const part of draft.match(/.{1,24}|\n/gus) ?? [draft]) {
      yield part;
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  }
}
