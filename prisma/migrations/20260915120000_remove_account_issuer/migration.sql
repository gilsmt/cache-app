-- Better Auth 1.7.3 removes the required `issuer` column added in 1.7.0-1.7.2.
-- Accounts are keyed by (providerId, accountId) again, as in 1.6. New rows no
-- longer write `issuer`, so a NOT NULL column rejects every sign-up and
-- account link (see https://www.better-auth.com/docs/guides/1-7-upgrade-guide
-- "Account identity keeps the provider key"). Drop the column and restore the
-- pre-1.7 unique key. Data needs no backfill: the 1.7.0-1.7.2 backfill mapped
-- each providerId to exactly one issuer, so (providerId, accountId) has the
-- same granularity as (issuer, accountId).

-- Drop the issuer-scoped unique (both the name this repo used and the name
-- better-auth generates) before dropping the column. Order matters on MySQL,
-- which would otherwise rebuild the index on the remaining column.
DROP INDEX IF EXISTS "account_issuer_accountId_key";
DROP INDEX IF EXISTS "account_issuer_accountId_uidx";

ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer";

-- Guard: fail with a precise duplicate count so production data can be
-- reconciled intentionally before uniqueness becomes enforced.
DO $$
DECLARE
    duplicate_key_count integer;
BEGIN
    SELECT COUNT(*)
    INTO duplicate_key_count
    FROM (
        SELECT 1
        FROM "account"
        GROUP BY "providerId", "accountId"
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_key_count > 0 THEN
        RAISE EXCEPTION
            'Cannot create account(providerId, accountId) unique index: % duplicate key(s) exist',
            duplicate_key_count;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key" ON "account"("providerId", "accountId");
