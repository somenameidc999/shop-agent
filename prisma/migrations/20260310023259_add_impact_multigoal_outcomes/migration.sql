-- AlterTable
ALTER TABLE "GoalExecution" ADD COLUMN "actionSteps" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "baselineData" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "confidenceLevel" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "estimatedAovImpact" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "estimatedConversionLift" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "estimatedRevenue" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "impactReasoning" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "impactScore" REAL;
ALTER TABLE "GoalExecution" ADD COLUMN "outcomeData" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "outcomeMeasuredAt" DATETIME;
ALTER TABLE "GoalExecution" ADD COLUMN "outcomeStatus" TEXT;

-- CreateTable
CREATE TABLE "GoalExecutionGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalExecutionId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    CONSTRAINT "GoalExecutionGoal_goalExecutionId_fkey" FOREIGN KEY ("goalExecutionId") REFERENCES "GoalExecution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoalExecutionGoal_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "requiredServers" TEXT NOT NULL,
    "analysisPrompt" TEXT NOT NULL,
    "actionPrompt" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cronIntervalMins" INTEGER NOT NULL DEFAULT 240,
    "outcomeMeasureDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Goal" ("actionPrompt", "analysisPrompt", "category", "createdAt", "cronIntervalMins", "description", "enabled", "id", "priority", "requiredServers", "ruleKey", "shop", "title", "updatedAt") SELECT "actionPrompt", "analysisPrompt", "category", "createdAt", "cronIntervalMins", "description", "enabled", "id", "priority", "requiredServers", "ruleKey", "shop", "title", "updatedAt" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE UNIQUE INDEX "Goal_shop_ruleKey_key" ON "Goal"("shop", "ruleKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GoalExecutionGoal_goalId_idx" ON "GoalExecutionGoal"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalExecutionGoal_goalExecutionId_goalId_key" ON "GoalExecutionGoal"("goalExecutionId", "goalId");
