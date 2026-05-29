import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): string {
  const key = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("AI_CONFIG_ENCRYPTION_KEY 未配置。请在 server/.env 中设置该环境变量（至少 32 字符）。");
  }
  return key;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

export function encryptApiKey(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(getEncryptionKey(), salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  // 格式: salt:iv:ciphertext (全部 hex)
  return `${salt.toString("hex")}:${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptApiKey(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted API key format");
  }
  const [saltHex, ivHex, ciphertextHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const key = deriveKey(getEncryptionKey(), salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
