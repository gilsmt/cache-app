ALTER TABLE "chat" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "chat_userId_archivedAt_updatedAt_idx"
ON "chat"("userId", "archivedAt", "updatedAt");

DROP INDEX "chat_userId_updatedAt_idx";
