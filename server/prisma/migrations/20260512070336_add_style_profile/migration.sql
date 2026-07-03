-- CreateTable
CREATE TABLE "StyleProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "narrativePov" TEXT NOT NULL DEFAULT 'third_person',
    "tense" TEXT NOT NULL DEFAULT 'past',
    "pacing" TEXT NOT NULL DEFAULT 'balanced',
    "sentenceLength" TEXT NOT NULL DEFAULT 'mixed',
    "vocabulary" TEXT NOT NULL DEFAULT 'modern',
    "dialogueRatio" TEXT NOT NULL DEFAULT 'balanced',
    "emotionIntensity" TEXT NOT NULL DEFAULT 'medium',
    "humorLevel" TEXT NOT NULL DEFAULT 'low',
    "avoidAIWords" BOOLEAN NOT NULL DEFAULT true,
    "useShortSentences" BOOLEAN NOT NULL DEFAULT true,
    "useDialogue" BOOLEAN NOT NULL DEFAULT true,
    "useSensoryDetail" BOOLEAN NOT NULL DEFAULT true,
    "customRules" TEXT NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StyleProfile_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StyleProfile_novelId_idx" ON "StyleProfile"("novelId");

-- CreateIndex
CREATE INDEX "StyleProfile_novelId_isDefault_idx" ON "StyleProfile"("novelId", "isDefault");
