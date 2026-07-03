import { withRetry } from "../retry";

describe("withRetry", () => {
  const alwaysRetry = () => true;

  test("成功时直接返回结果", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("失败后重试直到成功", async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error("fail");
      return "success";
    });

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, shouldRetry: alwaysRetry });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("超过最大重试次数后抛出错误", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("always fail"));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, shouldRetry: alwaysRetry })
    ).rejects.toThrow("always fail");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test("shouldRetry 返回 false 时不重试", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("no retry"));

    await expect(
      withRetry(fn, { maxRetries: 5, baseDelayMs: 1, shouldRetry: () => false })
    ).rejects.toThrow("no retry");
    expect(fn).toHaveBeenCalledTimes(1); // 只调用 1 次，不重试
  });
});
