-- Expand the first-party automation catalog. The catalog itself is code-defined;
-- these values are the stable identities stored on Automation and
-- AutomationRun rows. Values are added in a separate migration from any
-- backfill because a new enum value cannot be used in the transaction that
-- adds it.
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'monthly_recap';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'unsorted_triage';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'expiring_soon';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'decision_memo';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'research_digest';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'theme_thread';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'learning_path';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'open_questions';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'collection_health';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'duplicate_radar';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'collection_brief';
ALTER TYPE "AutomationTemplateKey" ADD VALUE IF NOT EXISTS 'story_follow_up';
