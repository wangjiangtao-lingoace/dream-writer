/*
  Warnings:

  - Added the required column `chapterOrder` to the `PleasurePoint` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "StoryState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "currentVolume" INTEGER NOT NULL DEFAULT 1,
    "currentChapter" INTEGER NOT NULL DEFAULT 1,
    "currentPhase" TEXT NOT NULL DEFAULT 'setup',
    "mainPlotProgress" TEXT NOT NULL DEFAULT '',
    "mainConflict" TEXT NOT NULL DEFAULT '',
    "protagonistLevel" TEXT NOT NULL DEFAULT '',
    "protagonistGoal" TEXT NOT NULL DEFAULT '',
    "protagonistStatus" TEXT NOT NULL DEFAULT '',
    "currentEmotion" TEXT NOT NULL DEFAULT 'neutral',
    "emotionIntensity" INTEGER NOT NULL DEFAULT 5,
    "tensionAccumulation" INTEGER NOT NULL DEFAULT 0,
    "lastPleasureChapter" INTEGER NOT NULL DEFAULT 0,
    "pleasureType" TEXT NOT NULL DEFAULT '',
    "pleasureCooldown" INTEGER NOT NULL DEFAULT 0,
    "activeForeshadows" TEXT NOT NULL DEFAULT '[]',
    "pendingPayoffs" TEXT NOT NULL DEFAULT '[]',
    "forbiddenActions" TEXT NOT NULL DEFAULT '[]',
    "allowedActions" TEXT NOT NULL DEFAULT '[]',
    "readerExpectation" TEXT NOT NULL DEFAULT '',
    "readerFatigue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoryState_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmotionCurve" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "emotionType" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL,
    "tensionLevel" INTEGER NOT NULL DEFAULT 0,
    "releaseLevel" INTEGER NOT NULL DEFAULT 0,
    "isClimax" BOOLEAN NOT NULL DEFAULT false,
    "isTurningPoint" BOOLEAN NOT NULL DEFAULT false,
    "isBreathing" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmotionCurve_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PleasurePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterOrder" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "subType" TEXT NOT NULL DEFAULT '',
    "intensity" INTEGER NOT NULL DEFAULT 5,
    "description" TEXT NOT NULL DEFAULT '',
    "characters" TEXT NOT NULL DEFAULT '[]',
    "conflict" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PleasurePoint_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PleasurePoint" ("chapterId", "createdAt", "description", "id", "intensity", "novelId", "type") SELECT "chapterId", "createdAt", "description", "id", "intensity", "novelId", "type" FROM "PleasurePoint";
DROP TABLE "PleasurePoint";
ALTER TABLE "new_PleasurePoint" RENAME TO "PleasurePoint";
CREATE INDEX "PleasurePoint_novelId_chapterOrder_idx" ON "PleasurePoint"("novelId", "chapterOrder");
CREATE INDEX "PleasurePoint_novelId_type_idx" ON "PleasurePoint"("novelId", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "StoryState_novelId_key" ON "StoryState"("novelId");

-- CreateIndex
CREATE INDEX "StoryState_novelId_idx" ON "StoryState"("novelId");

-- CreateIndex
CREATE INDEX "EmotionCurve_novelId_chapterOrder_idx" ON "EmotionCurve"("novelId", "chapterOrder");
