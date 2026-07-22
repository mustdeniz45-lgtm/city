-- 2026-07-16 Passport Stamps
--
-- Add a `stamps` jsonb column to progress. Keys are city_ids (e.g.
-- 'gaziantep'), values are tier strings ('bronze' / 'silver' / 'gold' /
-- 'diamond'). Defaults to empty so existing rows keep working with
-- absolutely no downtime.

alter table public.progress
  add column if not exists stamps jsonb not null default '{}'::jsonb;

-- No index needed — this column is only read/written per-device by the
-- API layer, never scanned across users.
