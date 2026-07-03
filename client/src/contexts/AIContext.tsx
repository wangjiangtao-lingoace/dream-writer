import React, { createContext, useContext, useState, useCallback } from "react";

interface AIResult {
  type: "success" | "error";
  content: string;
  timestamp: number;
}

interface AIContextType {
  loading: boolean;
  result: AIResult | null;
  execute: (action: string, params?: Record<string, unknown>) => Promise<void>;
  clearResult: () => void;
}

const AIContext = createContext<AIContextType | null>(null);

export const useAIContext = () => {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error("useAIContext must be used within AIProvider");
  return ctx;
};

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);

  const execute = useCallback(async (action: string, params?: Record<string, unknown>) => {
    setLoading(true);
    setResult(null);
    try {
      // 实际调用会在 useAI hook 中实现
      // 这里只管理状态
      console.log("AI execute:", action, params);
    } catch (error) {
      setResult({
        type: "error",
        content: error instanceof Error ? error.message : "操作失败",
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => setResult(null), []);

  return (
    <AIContext.Provider value={{ loading, result, execute, clearResult }}>
      {children}
    </AIContext.Provider>
  );
};
