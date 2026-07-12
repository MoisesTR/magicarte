-- ============================================================================
-- Engraving job fields on order_items (Joyería Trigueros).
-- Adds what was engraved (material/piece) and how long it took (minutes).
--
-- SAFE: 100% additive (ADD COLUMN IF NOT EXISTS), transactional, idempotent.
-- No existing data is touched. Paste into the Supabase SQL Editor and run once.
-- ============================================================================

begin;

alter table public.order_items add column if not exists material          text;
alter table public.order_items add column if not exists engraving_minutes integer;

commit;
