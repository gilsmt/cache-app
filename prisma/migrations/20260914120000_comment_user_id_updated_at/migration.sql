-- Serve the comments listing, which filters by `userId` and orders by
-- `updatedAt desc` (see `listCommentsForUser` in `lib/comment/service.ts`).
CREATE INDEX IF NOT EXISTS "comment_userId_updatedAt_idx" ON "comment"("userId", "updatedAt");
