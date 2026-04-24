-- AlterTable
ALTER TABLE "GoalExecution" ADD COLUMN "compositeScore" REAL;
ALTER TABLE "GoalExecution" ADD COLUMN "customParameters" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "dismissedAt" DATETIME;
ALTER TABLE "GoalExecution" ADD COLUMN "dismissedBy" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "dryRunResult" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "escalatedAt" DATETIME;
ALTER TABLE "GoalExecution" ADD COLUMN "feedbackNote" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "feedbackRating" INTEGER;
ALTER TABLE "GoalExecution" ADD COLUMN "triggerSource" TEXT;
ALTER TABLE "GoalExecution" ADD COLUMN "webhookEventType" TEXT;

-- CreateTable
CREATE TABLE "MerchantFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "executionId" TEXT,
    "feedbackType" TEXT NOT NULL,
    "rating" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantFeedback_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MerchantFeedback_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "GoalExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "eventDriven" BOOLEAN NOT NULL DEFAULT false,
    "eventTriggers" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Goal" ("actionPrompt", "analysisPrompt", "category", "createdAt", "cronIntervalMins", "description", "enabled", "id", "outcomeMeasureDays", "priority", "requiredServers", "ruleKey", "shop", "title", "updatedAt") SELECT "actionPrompt", "analysisPrompt", "category", "createdAt", "cronIntervalMins", "description", "enabled", "id", "outcomeMeasureDays", "priority", "requiredServers", "ruleKey", "shop", "title", "updatedAt" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE UNIQUE INDEX "Goal_shop_ruleKey_key" ON "Goal"("shop", "ruleKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MerchantFeedback_shop_goalId_idx" ON "MerchantFeedback"("shop", "goalId");

-- CreateIndex
CREATE INDEX "MerchantFeedback_shop_feedbackType_idx" ON "MerchantFeedback"("shop", "feedbackType");

