-- ============================================================================
-- Multi-business migration (Phase 0)
-- Turns the single Magic Arte schema into a 3-business platform:
--   Magic Arte · Hikari Studio · Joyería Trigueros (engraving)
--
-- SAFETY — this script is designed to NEVER lose Magic Arte data:
--   * 100% ADDITIVE: only CREATE TABLE / ADD COLUMN / CREATE VIEW, plus a
--     backfill UPDATE that touches ONLY rows where business_id is still NULL.
--   * NO drop / delete / truncate / column-type changes on existing data.
--   * Wrapped in a single transaction: if ANY statement fails, EVERYTHING
--     rolls back and your database is left exactly as it was.
--   * Idempotent (`if not exists`, `on conflict do nothing`): safe to re-run.
--
-- BEFORE RUNNING — take a backup (do not skip this):
--   Supabase Dashboard → Database → Backups → "Create backup"  (or run a
--   pg_dump). On the free tier there are no automatic daily backups, which is
--   exactly why upgrading to Pro is recommended once real money flows through.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor and run once.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 0 (READ-ONLY pre-flight). Run THIS block by itself FIRST and read the
-- output. It changes nothing. It confirms the id types the FKs below assume.
-- ----------------------------------------------------------------------------
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and (table_name, column_name) in (
--     ('orders','id'), ('products','id'), ('clients','id'),
--     ('categories','id'), ('order_items','id'), ('order_items','product_id')
--   )
-- order by table_name, column_name;
--
-- CONFIRMED types in THIS database:
--   products.id   = uuid    -> product detail tables use uuid product_id (already set below)
--   categories.id = uuid
--   orders.id     = bigint  (proven by the existing order_payments.order_id FK)
-- The business_id columns are all bigint and reference businesses.id (bigint), so
-- they do NOT depend on a host table's own id type. Only the product detail tables
-- depend on products.id, and they are already uuid below. No edits needed to run.


begin;

-- ----------------------------------------------------------------------------
-- STEP 1. Businesses table (the new tenant dimension) + branding + co-ownership
-- ----------------------------------------------------------------------------
create table if not exists public.businesses (
  id                bigint generated always as identity primary key,
  slug              text not null unique,      -- 'magicarte' | 'hikari' | 'joyeria-trigueros'
  name              text not null,
  -- branding (stored as data so the admin re-themes per business at runtime):
  primary_color     text,                      -- maps to CSS --color-primary
  secondary_color   text,                      -- maps to CSS --color-secondary
  accent_color      text,                      -- maps to CSS --color-accent
  background_color  text,                      -- surface bg (light vs dark brands)
  text_color        text,                      -- base text color on that bg
  theme             text not null default 'light' check (theme in ('light','dark')),
  font_primary      text,                      -- headings, e.g. 'Montserrat'
  font_secondary    text,                      -- body, e.g. 'Poppins'
  logo_url          text,
  -- revenue split (only the engraving business uses this for now):
  partner_name      text,                                 -- who you settle with, e.g. 'Joyería Trigueros (papá)'
  partner_split_pct numeric(5,2) not null default 0,      -- partner's share of PROFIT; 0 = no split
  is_active         boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

-- Magic Arte FIRST, so the backfill below can attach existing rows to it.
-- Colors taken from the current src/index.css defaults (light theme).
insert into public.businesses
  (slug, name, primary_color, secondary_color, accent_color, background_color, text_color, theme, logo_url, sort_order)
values
  ('magicarte', 'Magic Arte', '#ffb6c1', '#51c879', '#50bfe6', '#f8f9fa', '#1f2937', 'light',
   '/assets/android-chrome-192x192.png', 0)
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- STEP 2. Add business_id to the tables that are owned by a business.
-- All nullable for now; enforced NOT NULL only AFTER backfill (see STEP 7,
-- which is left commented so this run can never fail on a stray null).
-- (order_items derive their business from the parent order; images from the
--  parent product — no column needed on those.)
-- ----------------------------------------------------------------------------
alter table public.products       add column if not exists business_id bigint references public.businesses(id);
alter table public.categories     add column if not exists business_id bigint references public.businesses(id);
alter table public.orders         add column if not exists business_id bigint references public.businesses(id);
alter table public.clients        add column if not exists business_id bigint references public.businesses(id);
alter table public.order_payments add column if not exists business_id bigint references public.businesses(id);

create index if not exists products_business_id_idx       on public.products (business_id);
create index if not exists categories_business_id_idx     on public.categories (business_id);
create index if not exists orders_business_id_idx         on public.orders (business_id);
create index if not exists clients_business_id_idx        on public.clients (business_id);
create index if not exists order_payments_business_id_idx on public.order_payments (business_id);


-- ----------------------------------------------------------------------------
-- STEP 3. Engraving revenue-split fields on orders (snapshot per order).
-- ----------------------------------------------------------------------------
alter table public.orders add column if not exists partner_split_pct numeric(5,2);                  -- snapshot; default from business; 0 = solo job
alter table public.orders add column if not exists material_cost     numeric(12,2) not null default 0;
alter table public.orders add column if not exists material_paid_by  text default 'us';

-- constraint added separately so re-runs don't error if it already exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_material_paid_by_check'
  ) then
    alter table public.orders
      add constraint orders_material_paid_by_check
      check (material_paid_by in ('us', 'partner'));
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- STEP 4. Per-business product detail tables (typed, not JSONB).
-- ----------------------------------------------------------------------------
-- Hikari 3D printing.  product_id is uuid to match products.id (which is uuid).
create table if not exists public.product_3d_details (
  product_id    uuid primary key references public.products(id) on delete cascade,
  material      text,            -- PLA, PETG, resin...
  color         text,
  print_hours   numeric(6,2),
  weight_grams  numeric(8,2),
  filament_cost numeric(10,2)
);

-- Joyería Trigueros engraving — ONLY for stocked engraving products (e.g. pre-made
-- plates). Most engraving is a SERVICE on a customer-supplied item: no product, just
-- an order_items line with product_id NULL (handled in STEP 5).
create table if not exists public.product_engraving_details (
  product_id     uuid primary key references public.products(id) on delete cascade,
  metal          text,           -- silver, stainless steel, gold...
  item_type      text,           -- watch, ring, plate...
  dimensions     text,
  engraving_area text
);


-- ----------------------------------------------------------------------------
-- STEP 5. Allow engraving "bring-your-own" jobs: order line with no product.
-- Dropping NOT NULL only LOOSENS the column (no data touched). If it is already
-- nullable this is a harmless no-op.
-- ----------------------------------------------------------------------------
alter table public.order_items alter column product_id drop not null;


-- ----------------------------------------------------------------------------
-- STEP 6. BACKFILL — attach every existing row to Magic Arte.
-- Only fills rows where business_id IS NULL, so it can never overwrite anything.
-- ----------------------------------------------------------------------------
update public.products       set business_id = (select id from public.businesses where slug = 'magicarte') where business_id is null;
update public.categories     set business_id = (select id from public.businesses where slug = 'magicarte') where business_id is null;
update public.orders         set business_id = (select id from public.businesses where slug = 'magicarte') where business_id is null;
update public.clients        set business_id = (select id from public.businesses where slug = 'magicarte') where business_id is null;
update public.order_payments set business_id = (select id from public.businesses where slug = 'magicarte') where business_id is null;


-- ----------------------------------------------------------------------------
-- STEP 7 (DEFERRED — intentionally left commented). Once the app stamps
-- business_id on every insert (Phase 2) and you've confirmed no NULLs remain,
-- run these to enforce the invariant. Kept out of this run so a stray NULL can
-- never abort the migration or risk existing data.
-- ----------------------------------------------------------------------------
-- alter table public.products       alter column business_id set not null;
-- alter table public.categories     alter column business_id set not null;
-- alter table public.orders         alter column business_id set not null;
-- alter table public.clients        alter column business_id set not null;
-- alter table public.order_payments alter column business_id set not null;


-- ----------------------------------------------------------------------------
-- STEP 8. Seed the two new businesses (placeholder colors — change anytime).
-- ----------------------------------------------------------------------------
insert into public.businesses
  (slug, name, primary_color, secondary_color, accent_color, background_color, text_color, theme,
   font_primary, font_secondary, logo_url, partner_name, partner_split_pct, sort_order)
values
  -- Hikari Studio 3D — real brand kit: dark theme, gold + white on near-black, Montserrat/Poppins.
  ('hikari', 'Hikari Studio 3D',
   '#D4AF37', '#FFFFFF', '#D4AF37', '#111111', '#FFFFFF', 'dark',
   'Montserrat', 'Poppins', '/assets/hikari/logo.png',
   null, 0, 1),
  -- Joyería Trigueros — engraving, co-owned 50/50. Real brand kit: dark theme,
  -- midnight blue + gold + ivory.
  ('joyeria-trigueros', 'Joyería Trigueros',
   '#B08A3C', '#F8F7F3', '#B08A3C', '#0D141E', '#F8F7F3', 'dark',
   null, null, '/assets/joyeria-trigueros/logo.png',
   'Joyería Trigueros (papá)', 50, 2)
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- STEP 9. Row Level Security for the new tables (mirrors the existing
-- "all for authenticated" style used by order_payments).
-- ----------------------------------------------------------------------------
alter table public.businesses               enable row level security;
alter table public.product_3d_details       enable row level security;
alter table public.product_engraving_details enable row level security;

drop policy if exists "businesses_all_authenticated" on public.businesses;
create policy "businesses_all_authenticated" on public.businesses
  for all to authenticated using (true) with check (true);

drop policy if exists "product_3d_details_all_authenticated" on public.product_3d_details;
create policy "product_3d_details_all_authenticated" on public.product_3d_details
  for all to authenticated using (true) with check (true);

drop policy if exists "product_engraving_details_all_authenticated" on public.product_engraving_details;
create policy "product_engraving_details_all_authenticated" on public.product_engraving_details
  for all to authenticated using (true) with check (true);


-- ----------------------------------------------------------------------------
-- STEP 10. Public-safe view of businesses (NO financial/partner columns), so
-- the anon public site can read brand colors + ids without exposing the split.
-- ----------------------------------------------------------------------------
create or replace view public.public_businesses as
  select id, slug, name,
         primary_color, secondary_color, accent_color, background_color, text_color, theme,
         font_primary, font_secondary, logo_url, is_active, sort_order
  from public.businesses
  where is_active;

grant select on public.public_businesses to anon, authenticated;


-- ----------------------------------------------------------------------------
-- STEP 11. Money views (source of truth). Financial — restrict to authenticated.
-- ----------------------------------------------------------------------------
-- Each metric is computed from its OWN source via subqueries, so joining orders
-- and payments together can't fan out and double-count multi-payment orders.
create or replace view public.business_earnings as
select
  b.id as business_id,
  b.name,
  (select count(*) from public.orders o where o.business_id = b.id) as orders_count,
  coalesce((
    select sum(p.amount) from public.order_payments p where p.business_id = b.id
  ), 0) as collected,
  coalesce((
    select sum(
             (o.total_amount - o.material_cost) * (1 - coalesce(o.partner_split_pct, 0) / 100.0)
             + case when o.material_paid_by = 'us' then o.material_cost else 0 end
           )
    from public.orders o
    where o.business_id = b.id and o.payment_status = 'paid'
  ), 0) as net_to_us_paid
from public.businesses b;

create or replace view public.partner_settlements as
select b.id as business_id, b.name, b.partner_name,
       count(*) filter (where o.payment_status = 'paid')                          as settled_orders,
       coalesce(sum(o.total_amount)  filter (where o.payment_status = 'paid'), 0) as gross,
       coalesce(sum(o.material_cost) filter (where o.payment_status = 'paid'), 0) as material_total,
       coalesce(sum(
         (o.total_amount - o.material_cost) * coalesce(o.partner_split_pct, 0) / 100.0
         + case when o.material_paid_by = 'partner' then o.material_cost else 0 end
       ) filter (where o.payment_status = 'paid'), 0) as partner_owed,
       coalesce(sum(
         (o.total_amount - o.material_cost) * (1 - coalesce(o.partner_split_pct, 0) / 100.0)
         + case when o.material_paid_by = 'us' then o.material_cost else 0 end
       ) filter (where o.payment_status = 'paid'), 0) as your_take
from public.businesses b
join public.orders o on o.business_id = b.id
where b.partner_split_pct > 0
group by b.id, b.name, b.partner_name;

revoke all on public.business_earnings   from anon;
revoke all on public.partner_settlements from anon;
grant select on public.business_earnings   to authenticated;
grant select on public.partner_settlements to authenticated;


commit;


-- ============================================================================
-- POST-MIGRATION VERIFICATION (READ-ONLY). Run after COMMIT to confirm every
-- existing row now belongs to Magic Arte and nothing is orphaned.
-- ============================================================================
-- select 'products'       as tbl, count(*) total, count(business_id) with_business from public.products
-- union all select 'categories',     count(*), count(business_id) from public.categories
-- union all select 'orders',         count(*), count(business_id) from public.orders
-- union all select 'clients',        count(*), count(business_id) from public.clients
-- union all select 'order_payments', count(*), count(business_id) from public.order_payments;
-- -- For each row, total MUST equal with_business (every existing row tagged to Magic Arte).
--
-- select * from public.businesses order by sort_order;
