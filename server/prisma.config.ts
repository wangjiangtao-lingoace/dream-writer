import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const configDir = path.dirname(fileURLToPath(import.meta.url));

function resolveDatabaseUrl(databaseUrl?: string) {
  const fallbackUrl = databaseUrl ?? "file:./dev.db";
  if (!fallbackUrl.startsWith("file:")) {
    return fallbackUrl;
  }

  const filePath = fallbackUrl.slice("file:".length) || "./dev.db";
  const resolvedFilePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(configDir, filePath);

  return `file:${resolvedFilePath}`;
}

export default defineConfig({
  schema: path.join(configDir, "prisma", "schema.prisma"),
  datasource: {
    url: resolveDatabaseUrl(process.env.DATABASE_URL),
  },
});
