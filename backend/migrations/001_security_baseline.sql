-- TMAS security baseline: additive and safe to apply before the matching backend release.
-- Verify the deployed schema and take a backup before execution.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

-- The live notifications table already stores one row per recipient and therefore needs no
-- read-state migration. Reads update is_read/read_at only when both id and user_id match.
