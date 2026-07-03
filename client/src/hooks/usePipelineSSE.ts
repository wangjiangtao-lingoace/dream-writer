import { useEffect, useRef, useState, useCallback } from "react";

interface UsePipelineSSEOptions {
  jobId?: string | null;
  status?: string | null;
  onUpdate: () => void;
  onFallback: () => void;
}

interface UsePipelineSSEReturn {
  isConnected: boolean;
  reconnect: () => void;
  disconnect: () => void;
}

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

export const usePipelineSSE = (options: UsePipelineSSEOptions): UsePipelineSSEReturn => {
  const { jobId, status, onUpdate, onFallback } = options;
  const [isConnected, setIsConnected] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const onFallbackRef = useRef(onFallback);

  onUpdateRef.current = onUpdate;
  onFallbackRef.current = onFallback;

  const cleanup = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (!jobId) return;

    cleanup();

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch(`/api/pipeline/${jobId}/stream`, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      setIsConnected(true);
      retryCountRef.current = 0;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const dataLine = frame.trim();
          if (!dataLine || !dataLine.startsWith("data: ")) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6));

            switch (payload.type) {
              case "ping":
                break;
              case "chunk":
                onUpdateRef.current();
                break;
              case "done":
                onUpdateRef.current();
                cleanup();
                return;
              case "error":
                onUpdateRef.current();
                cleanup();
                return;
            }
          } catch {
            // Ignore malformed frames
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;

      setIsConnected(false);

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retryCountRef.current);
        retryCountRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        onFallbackRef.current();
      }
    }
  }, [jobId, cleanup]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (!jobId || status === "completed" || status === "failed" || status === "paused") {
      cleanup();
      return;
    }

    connect();

    return cleanup;
  }, [jobId, status, connect, cleanup]);

  return { isConnected, reconnect, disconnect };
};
