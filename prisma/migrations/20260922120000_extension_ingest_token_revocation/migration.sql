-- Extension ingest tokens become stateless HMACs, so revocation is a per-user
-- cut-off: any token whose signed `issuedAt` predates
-- `user.ingestTokenMinIssuedAt` is rejected. Null means no revocation has been
-- performed, so every token minted before this migration keeps working until
-- the user first rotates their extension link.
ALTER TABLE "user"
  ADD COLUMN "ingestTokenMinIssuedAt" TIMESTAMP(3);

-- The legacy column held the bearer secret itself, so no read of the user table
-- may yield a credential. Tokens minted under the old scheme stop
-- authenticating when the matching deployment serves, and the extension
-- re-links from the next visit to a signed-in Cache page. A later migration
-- drops this column once no deployment reads it.
UPDATE "user"
  SET "extensionIngestToken" = NULL
  WHERE "extensionIngestToken" IS NOT NULL;
