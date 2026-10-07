-- PostgreSQL does not create indexes on referencing foreign-key columns.
CREATE INDEX CONCURRENTLY "automation_collectionId_idx" ON "automation"("collectionId");
CREATE INDEX CONCURRENTLY "automation_run_userId_idx" ON "automation_run"("userId");
