import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { ZodError } from "zod";
import novelRouter from "./routes/novels";
import workspaceRouter from "./routes/workspace";
import bookAnalysisRouter from "./routes/bookAnalysis";
import characterRouter from "./routes/characters";
import worldviewRouter from "./routes/worldviews";
import knowledgeAssetRouter from "./routes/knowledgeAssets";
import volumeRouter from "./routes/volumes";
import memoryRouter from "./routes/memories";
import aiRouter from "./routes/ai";
import styleRouter from "./routes/styles";
import storyStateRouter from "./routes/storyState";
import memoryCompressionRouter from "./routes/memoryCompression";
import directorRouter from "./routes/director";
import automationRouter from "./routes/automation";
import templateRouter from "./routes/templates";
import batchGenerateRouter from "./routes/batchGenerate";
import mainlineRouter from "./routes/mainlines";
import hookRouter from "./routes/hooks";
import generalKnowledgeRouter from "./routes/generalKnowledge";
import uploadRouter from "./routes/upload";
import pipelineRouter from "./routes/pipeline";
import analysisToNovelRouter from "./routes/analysisToNovel";
import searchRouter from "./routes/search";
import volumeOutlinesRouter from "./routes/volumeOutlines";
import aiEnhancedRouter from "./routes/aiEnhanced";
import imitationPlansRouter from "./routes/imitationPlans";
import consistencyResultsRouter from "./routes/consistencyResults";
import aiConfigRouter from "./routes/aiConfig";
import ragRouter from "./routes/rag";
import continuationRouter from "./routes/continuation";
import exportRouter from "./routes/export";
import { prisma } from "./db/prisma";
import { getRagRetrieveService } from "./services/RagRetrieveService";
import { getVectorStore } from "./db/vectorStore";

dotenv.config();

const app = express();
const REQUIRED_TABLES = [
  "Novel",
  "Chapter",
  "BookAnalysis",
  "BookAnalysisSection",
  "BookAnalysisBinding",
  "ImitationPlan",
  "PipelineJob",
  "PhaseResult",
  "KnowledgeAsset",
  "Memory",
  "AssetUsageRecord",
  "ConsistencyCheckResult",
];
let databaseHealth = {
  checked: false,
  ok: false,
  missingTables: [] as string[],
  error: null as string | null,
};

async function checkDatabaseSchema() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const existing = new Set(rows.map((row) => row.name));
    const missingTables = REQUIRED_TABLES.filter((table) => !existing.has(table));
    databaseHealth = {
      checked: true,
      ok: missingTables.length === 0,
      missingTables,
      error: null,
    };
  } catch (error) {
    databaseHealth = {
      checked: true,
      ok: false,
      missingTables: REQUIRED_TABLES,
      error: error instanceof Error ? error.message : "数据库健康检查失败。",
    };
  }
}

void checkDatabaseSchema();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));

app.get("/api/health", async (_req: Request, res: Response) => {
  await checkDatabaseSchema();
  res.json({
    success: true,
    data: {
      service: "dream-writer-server",
      status: databaseHealth.ok ? "ok" : "database_uninitialized",
      database: databaseHealth,
      timestamp: new Date().toISOString(),
    },
  });
});

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  if (!databaseHealth.ok) {
    await checkDatabaseSchema();
  }
  if (req.path === "/health" || !databaseHealth.checked || databaseHealth.ok) {
    next();
    return;
  }
  res.status(503).json({
    success: false,
    error: "数据库未初始化或 Prisma schema 未同步，请先执行数据库迁移。",
    data: { database: databaseHealth },
  });
});

app.use("/api/novels", novelRouter);
app.use("/api/novels", workspaceRouter);
app.use("/api/book-analysis", bookAnalysisRouter);
app.use("/api/characters", characterRouter);
app.use("/api/worldviews", worldviewRouter);
app.use("/api/knowledge-assets", knowledgeAssetRouter);
app.use("/api/volumes", volumeRouter);
app.use("/api/memories", memoryRouter);
app.use("/api/ai", aiRouter);
app.use("/api/styles", styleRouter);
app.use("/api/story-state", storyStateRouter);
app.use("/api/memory-compression", memoryCompressionRouter);
app.use("/api/director", directorRouter);
app.use("/api/automation", automationRouter);
app.use("/api/templates", templateRouter);
app.use("/api/batch", batchGenerateRouter);
app.use("/api/novels/:novelId/mainlines", mainlineRouter);
app.use("/api/novels/:novelId/hooks", hookRouter);
app.use("/api/general-knowledge", generalKnowledgeRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/pipeline", pipelineRouter);
app.use("/api/analysis-to-novel", analysisToNovelRouter);
app.use("/api/search", searchRouter);
app.use("/api/novels", volumeOutlinesRouter);
app.use("/api/ai", aiEnhancedRouter);
app.use("/api/imitation-plans", imitationPlansRouter);
app.use("/api/consistency-results", consistencyResultsRouter);
app.use("/api/ai-config", aiConfigRouter);
app.use("/api/rag", ragRouter);
app.use("/api", continuationRouter);
app.use("/api/export", exportRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: `Not Found: ${req.method} ${req.path}` });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ success: false, error: err.issues[0]?.message ?? "请求参数无效。" });
    return;
  }
  console.error("Server error:", err);
  res.status(500).json({ success: false, error: err.message });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🪶 Dream Writer server listening on http://${HOST}:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});

function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  getRagRetrieveService()?.close();
  getVectorStore()?.close();
  void prisma.$disconnect().finally(() => process.exit(0));
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
