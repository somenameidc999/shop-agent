-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_McpServerConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "serverType" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_McpServerConfig" ("configJson", "createdAt", "enabled", "id", "serverType", "shop", "updatedAt") SELECT "configJson", "createdAt", "enabled", "id", "serverType", "shop", "updatedAt" FROM "McpServerConfig";
DROP TABLE "McpServerConfig";
ALTER TABLE "new_McpServerConfig" RENAME TO "McpServerConfig";
CREATE UNIQUE INDEX "McpServerConfig_shop_serverType_instanceName_key" ON "McpServerConfig"("shop", "serverType", "instanceName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
