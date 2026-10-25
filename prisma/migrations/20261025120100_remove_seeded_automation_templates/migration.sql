-- Suggestions now come from the code-defined catalog instead of per-user rows.
-- Delete only the untouched rows that seeding created. A row the user edited,
-- scheduled, activated, or ran is preserved as a real automation.
DELETE FROM "automation" AS a
WHERE a."templateKey" IN ('daily_digest', 'worth_revisiting', 'next_actions')
  AND a."status" = 'paused'
  AND a."cadence" IS NULL
  AND a."timezone" IS NULL
  AND a."timeOfDayMinutes" IS NULL
  AND a."weekDay" IS NULL
  AND a."monthDay" IS NULL
  AND a."nextRunAtUtc" IS NULL
  AND a."activatedAtUtc" IS NULL
  AND a."lastRunAtUtc" IS NULL
  AND a."lastSucceededAtUtc" IS NULL
  AND a."lastFailureCode" IS NULL
  AND a."collectionId" IS NULL
  AND a."collectionNameSnapshot" IS NULL
  AND a."payloadScope" = 'all_library_items'
  AND NOT EXISTS (
    SELECT 1
    FROM "automation_run" AS r
    WHERE r."automationId" = a.id
  )
  AND (
    (
      a."templateKey" = 'daily_digest'
      AND a."title" = 'Daily Digest'
      AND a."prompt" = 'Create a concise daily digest of the most useful items saved recently. Group related ideas, call out what deserves attention today, and include practical next steps.'
    )
    OR (
      a."templateKey" = 'worth_revisiting'
      AND a."title" = 'Worth Revisiting'
      AND a."prompt" = 'Find older saved items that still deserve attention. Prefer unfinished, high-value, or easy-to-act-on saves. Explain why each is worth revisiting and suggest one concrete next step.'
    )
    OR (
      a."templateKey" = 'next_actions'
      AND a."title" = 'Next Actions'
      AND a."prompt" = 'Scan recent saves and notes for open loops. Extract concrete next actions, group them by theme, and rank by impact or urgency. Skip fluff.'
    )
  );
