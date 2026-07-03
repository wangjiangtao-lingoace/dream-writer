-- CreateTable
CREATE TABLE "BookAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "sourceText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "lastError" TEXT,
    "publishedAssetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookAnalysis_publishedAssetId_fkey" FOREIGN KEY ("publishedAssetId") REFERENCES "KnowledgeAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookAnalysisSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "aiContent" TEXT,
    "editedContent" TEXT,
    "notes" TEXT,
    "structuredData" TEXT,
    "evidence" TEXT,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookAnalysisSection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BookAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Volume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "conflict" TEXT NOT NULL DEFAULT '',
    "emotion" TEXT NOT NULL DEFAULT '',
    "newChars" TEXT NOT NULL DEFAULT '[]',
    "mapName" TEXT NOT NULL DEFAULT '',
    "endHook" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Volume_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChapterOutline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volumeId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "conflict" TEXT NOT NULL DEFAULT '',
    "emotion" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "foreshadowing" TEXT NOT NULL DEFAULT '[]',
    "payoff" TEXT NOT NULL DEFAULT '[]',
    "pleasurePoint" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChapterOutline_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChapterOutline_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Foreshadow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "plantChapter" INTEGER,
    "payoffChapter" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Foreshadow_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PleasurePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "intensity" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PleasurePoint_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsistencyIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '',
    "suggestion" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsistencyIssue_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BookAnalysis_status_updatedAt_idx" ON "BookAnalysis"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "BookAnalysis_publishedAssetId_idx" ON "BookAnalysis"("publishedAssetId");

-- CreateIndex
CREATE INDEX "BookAnalysisSection_analysisId_sortOrder_idx" ON "BookAnalysisSection"("analysisId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisSection_analysisId_sectionKey_key" ON "BookAnalysisSection"("analysisId", "sectionKey");

-- CreateIndex
CREATE INDEX "Volume_novelId_sortOrder_idx" ON "Volume"("novelId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Volume_novelId_sortOrder_key" ON "Volume"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "ChapterOutline_novelId_sortOrder_idx" ON "ChapterOutline"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "ChapterOutline_volumeId_sortOrder_idx" ON "ChapterOutline"("volumeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterOutline_novelId_sortOrder_key" ON "ChapterOutline"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "Foreshadow_novelId_status_idx" ON "Foreshadow"("novelId", "status");

-- CreateIndex
CREATE INDEX "PleasurePoint_novelId_type_idx" ON "PleasurePoint"("novelId", "type");

-- CreateIndex
CREATE INDEX "ConsistencyIssue_novelId_status_idx" ON "ConsistencyIssue"("novelId", "status");
