import { Request, Response } from "express";
import { AppError, errorHandler } from "../errorHandler";
import { LlmError } from "../../services/llm/LlmInvokeService";

function mockRes() {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

describe("errorHandler", () => {
  test("AppError 返回对应状态码和消息", () => {
    const err = new AppError(404, "资源不存在", "NOT_FOUND");
    const res = mockRes();

    errorHandler(err, {} as Request, res, () => {});

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe("资源不存在");
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("LlmError 返回 503 和友好提示", () => {
    const err = new LlmError("API Key 无效", "deepseek", "deepseek-chat", 401);
    const res = mockRes();

    errorHandler(err, {} as Request, res, () => {});

    expect(res.statusCode).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("AI 服务调用失败");
    expect(res.body.error.message).toContain("deepseek");
    expect(res.body.error.code).toBe("LLM_ERROR");
  });

  test("未知错误返回 500", () => {
    const err = new Error("something broke");
    const res = mockRes();

    errorHandler(err, {} as Request, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe("服务器内部错误");
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });

  test("headersSent 时不处理", () => {
    const err = new Error("test");
    const res = mockRes();
    (res as any).headersSent = true;

    const next = jest.fn();
    errorHandler(err, {} as Request, res, next);

    // 不应调用 status/json
    expect(res.statusCode).toBe(0);
  });
});

describe("AppError", () => {
  test("继承 Error", () => {
    const err = new AppError(400, "bad request", "BAD_REQUEST", { field: "name" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("AppError");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("bad request");
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.details).toEqual({ field: "name" });
  });
});
