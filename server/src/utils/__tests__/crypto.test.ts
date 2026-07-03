import { encryptApiKey, decryptApiKey } from "../crypto";

// 设置测试用的加密密钥
process.env.AI_CONFIG_ENCRYPTION_KEY = "test-encryption-key-32-chars-long!";

describe("crypto utils", () => {
  describe("encryptApiKey / decryptApiKey", () => {
    test("加密后解密应还原原始文本", () => {
      const original = "sk-test-api-key-12345";
      const encrypted = encryptApiKey(original);

      expect(encrypted).not.toBe(original);
      expect(encrypted.split(":")).toHaveLength(3); // salt:iv:ciphertext

      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(original);
    });

    test("不同的加密结果应不同（随机 salt/iv）", () => {
      const key = "sk-same-key";
      const enc1 = encryptApiKey(key);
      const enc2 = encryptApiKey(key);

      expect(enc1).not.toBe(enc2);
      expect(decryptApiKey(enc1)).toBe(key);
      expect(decryptApiKey(enc2)).toBe(key);
    });

    test("处理空字符串", () => {
      const encrypted = encryptApiKey("");
      expect(decryptApiKey(encrypted)).toBe("");
    });

    test("处理包含特殊字符的 Key", () => {
      const special = "sk-key/with+special=chars&more!@#$%";
      const encrypted = encryptApiKey(special);
      expect(decryptApiKey(encrypted)).toBe(special);
    });

    test("无效格式应抛出错误", () => {
      expect(() => decryptApiKey("invalid-format")).toThrow("Invalid encrypted API key format");
      expect(() => decryptApiKey("a:b")).toThrow("Invalid encrypted API key format");
    });

    test("篡改密文应抛出错误", () => {
      const encrypted = encryptApiKey("test-key");
      const parts = encrypted.split(":");
      parts[2] = "0000000000000000"; // 篡改密文
      const tampered = parts.join(":");

      expect(() => decryptApiKey(tampered)).toThrow();
    });
  });
});
