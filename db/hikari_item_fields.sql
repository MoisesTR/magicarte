-- ============================================================================
-- 3D print job fields on order_items (Hikari Studio).
-- `material` and `hours_needed` already exist (generic / from the engraving
-- migration); this adds what's still missing: color and printed weight.
--
-- SAFE: 100% additive (ADD COLUMN IF NOT EXISTS), transactional, idempotent.
-- No existing data is touched. Paste into the Supabase SQL Editor and run once.
-- ============================================================================

begin;

alter table public.order_items add column if not exists color        text;
alter table public.order_items add column if not exists weight_grams numeric(8,2);

commit;
