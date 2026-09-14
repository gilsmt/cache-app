-- Drop 19 indexes with no serving query (verified against all prisma.* reads in lib/).
--
-- Each removal reason (see PR description for the per-index evidence):
-- - Leftmost-prefix duplicates of a kept composite/unique:
--   collection_userId_idx, library_item_userId_idx,
--   library_item_userId_source_browserProfileId_idx (prefix of the 4-col unique),
--   library_activity_event_userId_occurredAt_idx (prefix of the 3-col index),
--   subscription_referenceId_idx (prefix of [referenceId, periodEnd]).
-- - No reader in the codebase (filter/sort done in JS or never queried):
--   collection_userId_updatedAt_createdAt_idx,
--   library_item_userId_scrapedAt_updatedAt_reviewedAt_idx (reviewedAt unread),
--   library_item_userId_reviewedAt_idx, library_item_userId_favoritedAt_idx,
--   library_item_userId_linkReachability_idx,
--   library_item_user_source_profile_parent_idx (no parentExternalId filter),
--   automation_status_nextRunAtUtc_idx, automation_userId_status_idx,
--   automation_userId_collectionId_idx, automation_run_userId_createdAt_idx,
--   feedback_pagePath_idx, user_stripeCustomerId_idx.
-- - Prefix-covered single-column user scopes:
--   rss_feed_userId_idx, markdown_import_userId_idx (covered by their uniques).
--
-- Deliberately NOT included from the raw diff output:
-- - DROP TYPE status/step_status/wait_status: owned by the Workflow runtime
--   (see 20260701000000_acknowledge_workflow_enums); Prisma must not manage them.
-- - DROP+CREATE of subscription_referenceId_active_idx: introspection formats the
--   raw() partial predicate differently than the schema; the constraint already
--   exists with the intended definition, so recreating it is a no-op with lock cost.
--   Pre-existing quirk, out of scope for this migration.

DROP INDEX IF EXISTS "automation_status_nextRunAtUtc_idx";
DROP INDEX IF EXISTS "automation_userId_collectionId_idx";
DROP INDEX IF EXISTS "automation_userId_status_idx";
DROP INDEX IF EXISTS "automation_run_userId_createdAt_idx";
DROP INDEX IF EXISTS "collection_userId_idx";
DROP INDEX IF EXISTS "collection_userId_updatedAt_createdAt_idx";
DROP INDEX IF EXISTS "feedback_pagePath_idx";
DROP INDEX IF EXISTS "library_activity_event_userId_occurredAt_idx";
DROP INDEX IF EXISTS "library_item_userId_favoritedAt_idx";
DROP INDEX IF EXISTS "library_item_userId_idx";
DROP INDEX IF EXISTS "library_item_userId_linkReachability_idx";
DROP INDEX IF EXISTS "library_item_userId_reviewedAt_idx";
DROP INDEX IF EXISTS "library_item_userId_scrapedAt_updatedAt_reviewedAt_idx";
DROP INDEX IF EXISTS "library_item_userId_source_browserProfileId_idx";
DROP INDEX IF EXISTS "library_item_user_source_profile_parent_idx";
DROP INDEX IF EXISTS "markdown_import_userId_idx";
DROP INDEX IF EXISTS "rss_feed_userId_idx";
DROP INDEX IF EXISTS "subscription_referenceId_idx";
DROP INDEX IF EXISTS "user_stripeCustomerId_idx";
