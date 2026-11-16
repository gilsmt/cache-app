CREATE INDEX CONCURRENTLY "automation_status_nextRunAtUtc_idx" ON "automation"("status", "nextRunAtUtc");
CREATE INDEX CONCURRENTLY "automation_run_status_leaseExpiresAt_idx" ON "automation_run"("status", "leaseExpiresAt");
CREATE INDEX CONCURRENTLY "automation_run_status_startedAt_idx" ON "automation_run"("status", "startedAt");
