-- CreateTable
CREATE TABLE "PipelineJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentPhase" TEXT NOT NULL DEFAULT 'planning',
    "currentStep" TEXT NOT NULL DEFAULT '',
    "config" TEXT NOT NULL DEFAULT '{}',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 20,
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PipelineJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhaseResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "input" TEXT NOT NULL DEFAULT '{}',
    "output" TEXT NOT NULL DEFAULT '{}',
    "selfScore" INTEGER,
    "selfComment" TEXT,
    "issues" TEXT NOT NULL DEFAULT '[]',
    "fixes" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmedByUser" BOOLEAN NOT NULL DEFAULT false,
    "userFeedback" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PhaseResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PipelineJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineJob_novelId_key" ON "PipelineJob"("novelId");

-- CreateIndex
CREATE INDEX "PipelineJob_novelId_idx" ON "PipelineJob"("novelId");

-- CreateIndex
CREATE INDEX "PipelineJob_status_idx" ON "PipelineJob"("status");

-- CreateIndex
CREATE INDEX "PhaseResult_jobId_phase_idx" ON "PhaseResult"("jobId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseResult_jobId_phase_step_key" ON "PhaseResult"("jobId", "phase", "step");
