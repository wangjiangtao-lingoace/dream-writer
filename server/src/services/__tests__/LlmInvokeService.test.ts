import { LlmError, LlmInvokeService } from "../llm/LlmInvokeService";

describe("LlmInvokeService", () => {
  describe("LlmError", () => {
    test("创建错误包含 provider 和 model 信息", () => {
      const err = new LlmError("请求失败", "deepseek", "deepseek-chat", 401);

      expect(err.message).toBe("请求失败");
      expect(err.provider).toBe("deepseek");
      expect(err.model).toBe("deepseek-chat");
      expect(err.statusCode).toBe(401);
      expect(err.name).toBe("LlmError");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(LlmError);
    });

    test("可选 statusCode", () => {
      const err = new LlmError("未知错误", "openai", "gpt-5");
      expect(err.statusCode).toBeUndefined();
    });

    test("可传递 cause", () => {
      const cause = new Error("原始错误");
      const err = new LlmError("包装错误", "deepseek", "model", undefined, { cause });
      expect(err.cause).toBe(cause);
    });
  });

  describe("extractOpenAIStreamDelta (通过流式接口间接测试)", () => {
    // extractOpenAIStreamDelta 是私有函数，通过 streamText 间接测试
    // 这里测试 LlmError 的抛出场景

    test("未配置 API Key 时应抛出包含 provider 信息的错误", async () => {
      // 保存原始环境变量
      const origKey = process.env.DEEPSEEK_API_KEY;
      const origProvider = process.env.DEFAULT_LLM_PROVIDER;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.DEFAULT_LLM_API_KEY;
      delete process.env.DEFAULT_LLM_PROVIDER;

      const service = new LlmInvokeService();

      await expect(
        service.completeTextOrThrow({ prompt: "test", provider: "deepseek" })
      ).rejects.toThrow(/未配置 API Key/);

      // 恢复环境变量
      if (origKey) process.env.DEEPSEEK_API_KEY = origKey;
      if (origProvider) process.env.DEFAULT_LLM_PROVIDER = origProvider;
    });
  });
});
