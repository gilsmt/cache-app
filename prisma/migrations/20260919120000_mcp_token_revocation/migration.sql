-- MCP bearer tokens are stateless HMACs, so revocation is a per-user cut-off:
-- any token whose signed `issuedAt` predates `user.mcpTokenMinIssuedAt` is
-- rejected. Null means no revocation has been performed, so every token minted
-- before this migration keeps working until a user first rotates their access.
ALTER TABLE "user"
  ADD COLUMN "mcpTokenMinIssuedAt" TIMESTAMP(3);
