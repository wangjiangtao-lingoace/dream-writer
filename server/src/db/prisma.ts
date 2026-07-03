import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

declare global {
  var dreamWriterPrisma: PrismaClient | undefined;
}

const serverRoot = path.resolve(__dirname, "..", "..");

function resolveDatabaseUrl(databaseUrl?: string): string {
  const fallbackUrl = databaseUrl ?? "file:./dev.db";
  if (!fallbackUrl.startsWith("file:")) {
    return fallbackUrl;
  }

  const filePath = fallbackUrl.slice("file:".length) || "./dev.db";
  const resolvedFilePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(serverRoot, filePath);

  return `file:${resolvedFilePath}`;
}

const adapter = new PrismaBetterSqlite3({
  url: resolveDatabaseUrl(process.env.DATABASE_URL),
});

export const prisma =
  global.dreamWriterPrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.dreamWriterPrisma = prisma;
}
