import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { LlmError } from "../services/llm/LlmInvokeService";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  // AppError：业务逻辑错误
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code, details: err.details },
    });
    return;
  }

  // ZodError：参数校验错误
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { message: err.issues[0]?.message ?? "请求参数无效", code: "VALIDATION_ERROR" },
    });
    return;
  }

  // LlmError：AI 服务错误
  if (err instanceof LlmError) {
    const status = err.statusCode === 401 ? 503 : (err.statusCode || 503);
    res.status(status).json({
      success: false,
      error: {
        message: `AI 服务调用失败（${err.provider}），请检查 API Key 配置或稍后重试`,
        code: "LLM_ERROR",
        details: process.env.NODE_ENV === "development" ? { provider: err.provider, model: err.model, raw: err.message } : undefined,
      },
    });
    return;
  }

  // 未知错误
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: { message: "服务器内部错误", code: "INTERNAL_ERROR" },
  });
}
