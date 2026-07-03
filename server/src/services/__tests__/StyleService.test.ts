import { buildStylePrompt, removeAISmell } from "../StyleService";

describe("StyleService", () => {
  describe("buildStylePrompt", () => {
    const defaultProfile = {
      narrativePov: "third_person",
      tense: "past",
      pacing: "balanced",
      sentenceLength: "mixed",
      vocabulary: "modern",
      dialogueRatio: "balanced",
      emotionIntensity: "medium",
      humorLevel: "low",
      avoidAIWords: true,
      useShortSentences: true,
      useDialogue: true,
      useSensoryDetail: true,
      customRules: [],
    };

    test("默认风格包含所有基础规则", () => {
      const prompt = buildStylePrompt(defaultProfile);
      expect(prompt).toContain("第三人称有限视角");
      expect(prompt).toContain("过去时态");
      expect(prompt).toContain("张弛有度");
      expect(prompt).toContain("长短句结合");
      expect(prompt).toContain("现代白话文");
      expect(prompt).toContain("对话和叙述平衡");
      expect(prompt).toContain("情感表达适度");
      expect(prompt).toContain("偶尔可以有轻松的时刻");
    });

    test("第一人称配置", () => {
      const prompt = buildStylePrompt({ ...defaultProfile, narrativePov: "first_person" });
      expect(prompt).toContain("第一人称视角");
    });

    test("快节奏配置", () => {
      const prompt = buildStylePrompt({ ...defaultProfile, pacing: "fast" });
      expect(prompt).toContain("节奏要快");
    });

    test("古典词汇配置", () => {
      const prompt = buildStylePrompt({ ...defaultProfile, vocabulary: "classical" });
      expect(prompt).toContain("古典词汇");
    });

    test("高幽默配置", () => {
      const prompt = buildStylePrompt({ ...defaultProfile, humorLevel: "high" });
      expect(prompt).toContain("多用幽默和调侃");
    });

    test("自定义规则被追加", () => {
      const prompt = buildStylePrompt({
        ...defaultProfile,
        customRules: ["禁止出现现代词汇", "每章至少一个反转"],
      });
      expect(prompt).toContain("禁止出现现代词汇");
      expect(prompt).toContain("每章至少一个反转");
    });

    test("禁用 AI 味避免时不应包含相关规则", () => {
      const prompt = buildStylePrompt({ ...defaultProfile, avoidAIWords: false });
      expect(prompt).not.toContain("避免使用 AI 味");
    });

    test("返回值使用分号分隔", () => {
      const prompt = buildStylePrompt(defaultProfile);
      const rules = prompt.split("；");
      expect(rules.length).toBeGreaterThan(5);
    });
  });

  describe("removeAISmell", () => {
    test("移除常见 AI 味词汇", () => {
      const input = "在这个充满挑战的世界里，他不得不面对现实。值得注意的是，他最终成功了。";
      const result = removeAISmell(input);
      expect(result).not.toContain("值得注意的是");
    });

    test("清理多余空行", () => {
      const input = "第一段\n\n\n\n\n第二段";
      const result = removeAISmell(input);
      expect(result).not.toMatch(/\n{3,}/);
    });

    test("去除首尾空白", () => {
      const input = "  \n  正文内容  \n  ";
      const result = removeAISmell(input);
      expect(result).toBe("正文内容");
    });

    test("空字符串不报错", () => {
      expect(removeAISmell("")).toBe("");
    });

    test("无 AI 味词汇的文本保持不变", () => {
      const input = "他走进了那间破旧的酒馆，点了一壶浊酒。";
      const result = removeAISmell(input);
      expect(result).toBe(input);
    });
  });
});
