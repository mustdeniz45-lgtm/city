-- ============================================================================
-- CityQuest Verified Score (CVS) — reviews table + policies
-- ============================================================================
-- Stores verified user reviews for POIs with multi-dimensional ratings.
-- Dimensions are stored in a JSONB `dimensions` column keyed by category:
--
--   Restaurants/cafes:  {food, service, value, authenticity}
--   Museums/landmarks:  {exhibition, information, authenticity, accessibility}
--
-- Aggregation into the CVS happens on-the-fly in the backend endpoint
-- `/api/pois/{id}/cvs` — no denormalisation for now.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.reviews (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id         text        NOT NULL REFERENCES public.pois(id) ON DELETE CASCADE,
  device_id      text        NOT NULL,             -- becomes user_id in auth refactor
  overall        smallint    NOT NULL CHECK (overall BETWEEN 1 AND 5),
  dimensions     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  comment        text,
  verified       boolean     NOT NULL DEFAULT false,
  helpful_count  integer     NOT NULL DEFAULT 0,
  hidden         boolean     NOT NULL DEFAULT false, -- reserved for AI moderation
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poi_id, device_id)                        -- one review per user per place
);

CREATE INDEX IF NOT EXISTS reviews_poi_id_idx     ON public.reviews (poi_id);
CREATE INDEX IF NOT EXISTS reviews_device_id_idx  ON public.reviews (device_id);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON public.reviews (created_at DESC);

-- Update-at trigger (matches the pattern on other tables)
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_updated_at ON public.reviews;
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The backend uses the service role, so RLS is currently permissive.
-- When you migrate to auth.uid() identity, tighten with:
--   ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY reviews_read  ON public.reviews FOR SELECT TO anon, authenticated USING (NOT hidden);
--   CREATE POLICY reviews_own_w ON public.reviews FOR INSERT,UPDATE,DELETE TO authenticated
--     USING (device_id = auth.uid()::text) WITH CHECK (device_id = auth.uid()::text);
GRANT SELECT, INSERT, UPDATE ON public.reviews TO anon, authenticated;

COMMIT;
