import { useCallback } from "react";
import { api } from "../lib/api";

interface UseAIOptions {
  novelId?: string;
  chapterId?: string;
  onSuccess?: (content: string) => void;
  onError?: (error: string) => void;
}

export const useAI = (options: UseAIOptions = {}) => {
  const { novelId, chapterId, onSuccess, onError } = options;

  const generateContent = useCallback(
    async (prompt: string) => {
      try {
        const response = await api.post<{ content: string }>("/api/ai/chapter-content", {
          novelId,
          chapterId,
          prompt,
        });
        onSuccess?.(response.content);
        return response.content;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "生成失败";
        onError?.(msg);
        throw error;
      }
    },
    [novelId, chapterId, onSuccess, onError]
  );

  const checkConsistency = useCallback(
    async () => {
      if (!chapterId) return;
      try {
        const response = await api.post<{ issues: unknown[] }>("/api/ai/consistency-check", {
          novelId,
          chapterId,
        });
        return response;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "检查失败";
        onError?.(msg);
        throw error;
      }
    },
    [novelId, chapterId, onError]
  );

  const streamContent = useCallback(
    async (prompt: string, onChunk: (chunk: string) => void) => {
      try {
        const response = await fetch("/api/ai/chapter-content/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ novelId, chapterId, prompt }),
        });

        if (!response.ok) throw new Error("流式请求失败");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取流");

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          onChunk(chunk);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "流式生成失败";
        onError?.(msg);
        throw error;
      }
    },
    [novelId, chapterId, onError]
  );

  return { generateContent, checkConsistency, streamContent };
};
