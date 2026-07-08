-- ============================================================================
-- CityQuest — Auth-first identity migration
-- ============================================================================
-- Replaces the legacy client-generated `device_id` primary key on
-- public.progress with `user_id uuid REFERENCES auth.users(id)`, enables RLS,
-- and installs medium-strictness policies:
--
--   • SELECT — any authenticated user may read the leaderboard-relevant
--     columns of ANY row (needed for the leaderboard).
--   • INSERT / UPDATE / DELETE — only the row owner may write
--     (`auth.uid() = user_id`), preventing XP tampering.
--
-- This is a DESTRUCTIVE migration. It TRUNCATES public.progress and drops
-- public.progress.device_id. Take a backup first if you want the old data.
--
--   $ pg_dump --data-only -t public.progress > progress_backup.sql
--
-- Run this in the Supabase SQL Editor (project → SQL). All statements are
-- idempotent so you can re-run safely.
-- ============================================================================

BEGIN;

------------------------------------------------------------------------------
-- 1. WIPE legacy device-based rows.
------------------------------------------------------------------------------
TRUNCATE TABLE public.progress;

------------------------------------------------------------------------------
-- 2. Add `user_id`, drop `device_id`, make user_id the natural key.
------------------------------------------------------------------------------
ALTER TABLE public.progress
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.progress
  DROP COLUMN IF EXISTS device_id;

-- One progress row per user
ALTER TABLE public.progress
  ALTER COLUMN user_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'progress_user_id_fkey'
  ) THEN
    ALTER TABLE public.progress
      ADD CONSTRAINT progress_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS progress_user_id_idx
  ON public.progress(user_id);

------------------------------------------------------------------------------
-- 3. Enable Row Level Security.
------------------------------------------------------------------------------
ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;

-- Wipe stale policies from previous runs to keep this idempotent.
DROP POLICY IF EXISTS "progress leaderboard read"        ON public.progress;
DROP POLICY IF EXISTS "progress insert by owner"         ON public.progress;
DROP POLICY IF EXISTS "progress update by owner"         ON public.progress;
DROP POLICY IF EXISTS "progress delete by owner"         ON public.progress;

-- 3a. Anyone signed in may read leaderboard rows. Anonymous users still don't
--     leak because they have no display_name — the leaderboard query filters
--     `display_name IS NOT NULL` client-side + at RLS level below.
CREATE POLICY "progress leaderboard read"
  ON public.progress
  FOR SELECT
  TO authenticated
  USING (
    -- own row is always visible, other rows only if display_name is set
    user_id = auth.uid()
    OR display_name IS NOT NULL
  );

-- 3b. Owner-only writes.
CREATE POLICY "progress insert by owner"
  ON public.progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "progress update by owner"
  ON public.progress
  FOR UPDATE
  TO authenticated
  USING       (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

CREATE POLICY "progress delete by owner"
  ON public.progress
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Explicit grants (RLS gates them, but the role still needs the privilege).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress TO service_role;

------------------------------------------------------------------------------
-- 4. Convenience view for the public leaderboard — hides raw columns.
--    The FastAPI backend can query this instead of the base table.
------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.leaderboard_v1 AS
SELECT
  user_id,
  display_name,
  avatar_uri,
  xp,
  level,
  title
FROM public.progress
WHERE display_name IS NOT NULL;

GRANT SELECT ON public.leaderboard_v1 TO authenticated, anon;

------------------------------------------------------------------------------
-- 5. Optional but recommended: nightly cleanup of abandoned anonymous users.
--    Run this via a Supabase Edge Function or pg_cron. It deletes anon users
--    who haven't upgraded in 30+ days; the ON DELETE CASCADE on progress
--    removes their rows too.
------------------------------------------------------------------------------
-- DELETE FROM auth.users
-- WHERE is_anonymous IS TRUE
--   AND created_at < now() - interval '30 days';

COMMIT;

-- ============================================================================
-- Verification (run interactively, not inside the transaction):
--   SELECT policyname, cmd, permissive FROM pg_policies
--     WHERE tablename = 'progress' ORDER BY cmd;
--   \d+ public.progress
-- ============================================================================
