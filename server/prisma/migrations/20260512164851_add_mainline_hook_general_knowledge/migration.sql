-- AlterTable
ALTER TABLE "Novel" ADD COLUMN "coverImage" TEXT;

-- CreateTable
CREATE TABLE "Mainline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mainline_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Hook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'suspense',
    "intensity" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'planted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Hook_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneralKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Mainline_novelId_sortOrder_idx" ON "Mainline"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "Hook_novelId_type_idx" ON "Hook"("novelId", "type");

-- CreateIndex
CREATE INDEX "Hook_novelId_status_idx" ON "Hook"("novelId", "status");

-- CreateIndex
CREATE INDEX "GeneralKnowledge_category_updatedAt_idx" ON "GeneralKnowledge"("category", "updatedAt");
