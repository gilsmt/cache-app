-- Turn-claim lease for serializing chat follow-ups. A live claim is never
-- stolen; the expiry is the only recovery path when a process dies mid-stream.
ALTER TABLE "chat" ADD COLUMN "pendingMessageId" TEXT;
ALTER TABLE "chat" ADD COLUMN "pendingExpiresAt" TIMESTAMP(3);

-- Backfill the most recent finished runs so existing history stays reachable
-- from the sidebar without adding a run list to the automation cards.
-- The opening message mirrors getRunOpeningMessage in lib/chats/service.ts.
-- ON CONFLICT keeps this safe if the app created a chat for the same run
-- while the migration was running.
WITH finished AS (
    SELECT
        run."id" AS "runId",
        run."userId",
        automation."title",
        CASE run."status"
            WHEN 'succeeded' THEN COALESCE(
                NULLIF(run."summaryMarkdown", ''),
                'The automation finished without a text summary.'
            )
            WHEN 'failed' THEN COALESCE(
                NULLIF(run."errorMessage", ''),
                NULLIF(run."summaryMarkdown", ''),
                'The automation failed without details.'
            )
            WHEN 'skipped' THEN 'This run was skipped before producing output.'
            ELSE 'This run was canceled before producing output.'
        END AS "openingMessage",
        run."createdAt"
    FROM "automation_run" AS run
    INNER JOIN "automation" AS automation ON automation."id" = run."automationId"
    WHERE run."status" IN ('succeeded', 'failed', 'skipped', 'canceled')
), ranked AS (
    SELECT finished.*, ROW_NUMBER() OVER (
        PARTITION BY "userId"
        ORDER BY "createdAt" DESC, "runId" DESC
    ) AS "position"
    FROM finished
), inserted AS (
    INSERT INTO "chat" ("id", "userId", "title", "automationRunId", "createdAt", "updatedAt")
    SELECT
        md5(random()::text || clock_timestamp()::text || "runId"),
        "userId",
        "title",
        "runId",
        "createdAt",
        "createdAt"
    FROM ranked
    WHERE "position" <= 200
    ON CONFLICT ("automationRunId") DO NOTHING
    RETURNING "id", "automationRunId"
)
INSERT INTO "chat_message" ("id", "chatId", "role", "content", "createdAt")
SELECT
    md5(random()::text || clock_timestamp()::text || inserted."id"),
    inserted."id",
    'assistant',
    finished."openingMessage",
    finished."createdAt"
FROM inserted
INNER JOIN finished ON finished."runId" = inserted."automationRunId";
