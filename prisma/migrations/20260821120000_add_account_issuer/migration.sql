-- Better Auth 1.7: Account identity is now scoped by trusted issuer, keying accounts on (issuer, accountId).
-- Backfill existing rows with synthetic issuers that match the new default for each provider.
-- For providers without an issuer (generic OAuth), the synthetic namespace is `local:oauth:<encoded providerId>`.
-- Google One Tap / social Google uses `https://accounts.google.com`. Adapt this mapping if you add new providers.
-- 1. Add the new required column as nullable to allow backfill without downtime.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

-- 2. Guard: the runtime issuer for non-discovery OAuth providers is
--    `local:oauth:${encodeURIComponent(providerId)}` (@better-auth/core
--    createOAuthAccountIssuer). encodeURIComponent only escapes characters
--    outside [A-Za-z0-9-_.!~*'()], so any providerId holding other characters
--    would backfill to an issuer that no longer matches runtime lookups.
--    Fail loudly instead of silently diverging. This deployment is
--    OAuth-only (no email/password provider is configured), so every
--    providerId must be a content-integration id such as
--    google/pinterest/x/github/notion; credential accounts would need the
--    separate `local:credential` namespace and cannot exist here.
DO $$
DECLARE
    unsafe_provider_id_count integer;
BEGIN
    SELECT COUNT(*) INTO unsafe_provider_id_count
    FROM "account"
    WHERE "providerId" !~ '^[A-Za-z0-9_-]+$';
    IF unsafe_provider_id_count > 0 THEN
        RAISE EXCEPTION
            'Cannot backfill account.issuer: % row(s) have a providerId outside [A-Za-z0-9_-] and would not match the runtime issuer encoding',
            unsafe_provider_id_count;
    END IF;
END $$;

-- 3. Backfill issuer for all existing rows.
--    - google (social + One Tap): https://accounts.google.com
--      (matches @better-auth/core google provider `accountIssuer`)
--    - all other providers (generic OAuth: pinterest, x, github, notion):
--      local:oauth:<providerId> — equal to the runtime encoding because the
--      step-2 guard proved every providerId needs no percent-escaping.
UPDATE "account" SET "issuer" = CASE
    WHEN "providerId" = 'google' THEN 'https://accounts.google.com'
    ELSE 'local:oauth:' || "providerId"
END
WHERE "issuer" IS NULL;

-- 4. Ensure every row has an issuer before enforcing NOT NULL and the new unique constraint.
--    Fail fast if any row could not be backfilled (e.g., unexpected null providerId).
DO $$
DECLARE
    missing_issuer_count integer;
BEGIN
    SELECT COUNT(*) INTO missing_issuer_count FROM "account" WHERE "issuer" IS NULL OR "issuer" = '';
    IF missing_issuer_count > 0 THEN
        RAISE EXCEPTION 'Cannot add account(issuer, accountId) unique index: % row(s) still have no issuer after backfill', missing_issuer_count;
    END IF;
END $$;

-- 5. Check for duplicate (issuer, accountId) keys that would violate the new unique constraint.
DO $$
DECLARE
    duplicate_key_count integer;
BEGIN
    SELECT COUNT(*) INTO duplicate_key_count FROM (
        SELECT 1 FROM "account" GROUP BY "issuer", "accountId" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_key_count > 0 THEN
        RAISE EXCEPTION 'Cannot create account(issuer, accountId) unique index: % duplicate key(s) exist', duplicate_key_count;
    END IF;
END $$;

-- 6. Make issuer required now that every row is populated.
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

-- 7. Drop the previous providerId-scoped unique constraint (if it exists from 20260623120000).
DROP INDEX IF EXISTS "account_providerId_accountId_key";
DROP INDEX IF EXISTS "account_providerId_accountId_idx";

-- 8. Create the new issuer-scoped unique constraint.
CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");
