# Multi-Business Platform Plan

Turn Magic Arte into a single internal platform that manages **three businesses** —
Magic Arte, **Hikari** (3D printing), and **Joyería Trigueros** (xTool engraving) — from one
codebase, one Supabase project, one deploy.

## Goals

- Manage products, orders, clients, payments and finances **per business**, separately.
- See a **combined earnings** view across all three.
- Each business looks/feels like its own branded app (own colors + logo) inside a
  **neutral operator console** (the shell is not "Magic Arte branded").
- **No second system, no sync.** One database, extended with a `business` dimension.
- Magic Arte keeps working throughout — every step ships safely.

## Why this approach (vs. a separate system + sync)

All three businesses are the same shape: *things you sell → orders → payments → earnings*.
The only differences are branding and a few product attributes. A separate system would
mean two schemas, two deploys, and a sync job that drifts and breaks. Extending the
existing engine gives the same outcome (separate management + unified earnings) for a
fraction of the work, reusing ~90% of what exists.

---

## Current state (verified)

- React 18 + Vite SPA on Vercel; Supabase (Postgres + Auth + Storage).
- Tables in use: `products`, `categories`, `images`, `orders`, `order_items`,
  `order_payments`, `clients`.
- `products`/`categories`/`images` fetched via `src/hooks/useSupabaseQuery.jsx`
  (supports a `filters` option already).
- `orders`/`clients`/`order_payments` fetched via **raw `supabase.from(...)`** inside
  `Orders.jsx` (2617 lines), `Clients.jsx` (572), `Finances.jsx` (415).
- **No shared admin layout** — each page repeats its own nav buttons.
- Theming already uses CSS variables in `src/index.css` (`--color-primary`, etc.).
- Auth: Supabase `signInWithPassword`; pages call `supabase.auth.getUser()`.

---

## Data model changes

### New table: `businesses`

```sql
create table public.businesses (
  id                bigint generated always as identity primary key,
  slug              text not null unique,      -- 'magicarte' | 'hikari' | 'joyeria-trigueros'
  name              text not null,
  primary_color     text,                      -- maps to --color-primary
  secondary_color   text,                      -- maps to --color-secondary
  accent_color      text,                      -- maps to --color-accent
  background_color  text,                      -- surface bg (light vs dark brands)
  text_color        text,                      -- base text color on that bg
  theme             text not null default 'light',  -- 'light' | 'dark'
  font_primary      text,                      -- headings, e.g. 'Montserrat'
  font_secondary    text,                      -- body, e.g. 'Poppins'
  logo_url          text,
  -- co-ownership / revenue split (only the engraving business uses this for now)
  partner_name      text,                      -- counterparty you settle with, e.g. 'Joyería Trigueros (papá)'
  partner_split_pct numeric(5,2) not null default 0,  -- partner's share of PROFIT; 0 = no split
  is_active         boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);
```

Brand kits stored as data (seeded by the migration):

| Business | Theme | Primary | Bg / Text | Fonts | Logo |
|----------|-------|---------|-----------|-------|------|
| Magic Arte | light | `#ffb6c1` | `#f8f9fa` / `#1f2937` | (site default) | existing |
| Hikari Studio 3D | **dark** | `#D4AF37` (gold) | `#111111` / `#FFFFFF` | Montserrat / Poppins | `public/assets/hikari/logo.png` |
| Joyería Trigueros | **dark** | `#B08A3C` (oro) | `#0D141E` (azul medianoche) / `#F8F7F3` (marfil) | TBD | `public/assets/joyeria-trigueros/logo.png` |

### Add `business_id` to existing tables

Tag the tables that are owned by a business:
`products`, `categories`, `orders`, `clients`, `order_payments`.
(`order_items` derive their business from their parent `order`, `images` from their
parent `product` — no column needed there.)

```sql
alter table public.products       add column business_id bigint references public.businesses(id);
alter table public.categories     add column business_id bigint references public.businesses(id);
alter table public.orders         add column business_id bigint references public.businesses(id);
alter table public.clients        add column business_id bigint references public.businesses(id);
alter table public.order_payments add column business_id bigint references public.businesses(id);
```

### Per-business product fields → proper detail tables (not JSONB)

These are real, long-lived businesses we'll want to **filter and report on**
("earnings on stainless steel", "avg filament cost per print"). JSONB can't do that
cleanly and has no types/constraints/FKs, so use the **shared base + 1:1 extension table**
pattern instead.

Rule: if a field will ever be filtered, reported on, or constrained → it's a real column.
JSONB only for sparse, display-only, never-queried scraps (we use none here).

Keep base `products` for shared commerce fields (name, price, images, `business_id`,
category, stock, visibility). Add one detail table per new business:

```sql
-- Hikari 3D printing  (product_id is uuid to match products.id)
create table public.product_3d_details (
  product_id    uuid primary key references public.products(id) on delete cascade,
  material      text,            -- PLA, PETG, resin...
  color         text,
  print_hours   numeric(6,2),
  weight_grams  numeric(8,2),
  filament_cost numeric(10,2)
);

-- xTool engraving (ONLY for stocked engraving products, e.g. pre-made plates).
-- Most engraving is a SERVICE on a customer-supplied item -> no product, just an
-- order_items line with product_id NULL. No base_cost here: pricing/cost lives on
-- the order line where the actual job is.
create table public.product_engraving_details (
  product_id     uuid primary key references public.products(id) on delete cascade,
  metal          text,           -- silver, stainless steel, gold...
  item_type      text,           -- watch, ring, plate...
  dimensions     text,
  engraving_area text
);
```

**Bring-your-own engraving jobs:** ensure `order_items.product_id` is nullable so a custom
job is just a line item (`product_name`, `product_description`, `unit_price`) with no
catalog product.

```sql
alter table public.order_items alter column product_id drop not null;  -- if currently NOT NULL
```

Pragmatic note: `products` already carries Magic Arte-specific columns (`width`, `length`,
`material_technique`, `care_instructions`). Leave them as-is — do NOT refactor them out
(it would mean churning the 1000-line `Admin.jsx` for no gain). Add detail tables only for
the new businesses; normalize Magic Arte later only if ever needed.

### Seed + backfill (zero data loss, no sync)

```sql
insert into public.businesses (slug, name, primary_color, secondary_color, accent_color, sort_order)
values ('magicarte','Magic Arte','#ffb6c1','#51c879','#50bfe6', 0);

-- everything that exists today belongs to Magic Arte
update public.products       set business_id = (select id from businesses where slug='magicarte') where business_id is null;
update public.categories     set business_id = (select id from businesses where slug='magicarte') where business_id is null;
update public.orders         set business_id = (select id from businesses where slug='magicarte') where business_id is null;
update public.clients        set business_id = (select id from businesses where slug='magicarte') where business_id is null;
update public.order_payments set business_id = (select id from businesses where slug='magicarte') where business_id is null;

-- later, once the app stamps business_id everywhere, enforce it:
-- alter table public.products add constraint products_business_required check (business_id is not null);

insert into public.businesses (slug, name, primary_color, secondary_color, accent_color, partner_name, partner_split_pct, sort_order)
values
  ('hikari','Hikari Studio', '#7c3aed','#22d3ee','#a78bfa', null, 0, 1),
  ('joyeria-trigueros','Joyería Trigueros', '#9ca3af','#f59e0b','#fcd34d', 'Joyería Trigueros (papá)', 50, 2);
```

### Revenue split with Joyería Trigueros (co-owned engraving business)

The engraving business **is** Joyería Trigueros — co-owned with dad, profit split 50/50
*for now*. The split is a property of the business (`businesses.partner_split_pct`), not a
per-order channel. Each order **snapshots** the split % and material facts so changing the
deal later never rewrites past accounting.

Two facts entered per engraving order; everything else is derived:

```sql
alter table public.orders add column partner_split_pct numeric(5,2);                 -- snapshot; default from business; 0 = solo job
alter table public.orders add column material_cost     numeric(12,2) not null default 0;
alter table public.orders add column material_paid_by  text check (material_paid_by in ('us','partner')) default 'us';
```

**Split math** (reimburse material to whoever paid, split the rest of the profit):

```
profit     = total_amount − material_cost
your take  = profit × (1 − split%)  +  (material_cost if material_paid_by = 'us')
dad's take = profit ×      split%   +  (material_cost if material_paid_by = 'partner')
```

Settlement is computed on **fully-paid orders** (`payment_status = 'paid'`) so partial
payments don't create half-settled numbers. Cash-flow ("collected") still uses payments.

### Combined earnings view (source of truth)

```sql
create or replace view public.business_earnings as
select b.id as business_id, b.name,
       count(distinct o.id)        as orders_count,
       coalesce(sum(p.amount), 0)  as collected,
       -- your net, accounting for the engraving split on fully-paid orders:
       coalesce(sum(
         case when o.payment_status = 'paid' then
           (o.total_amount - o.material_cost) * (1 - coalesce(o.partner_split_pct,0)/100.0)
           + case when o.material_paid_by = 'us' then o.material_cost else 0 end
         else 0 end
       ), 0) as net_to_us_paid
from businesses b
left join orders o         on o.business_id = b.id
left join order_payments p on p.order_id    = o.id
group by b.id, b.name;
```

### Partner settlement view (what you and dad each get from Joyería Trigueros)

```sql
create or replace view public.partner_settlements as
select b.id as business_id, b.name, b.partner_name,
       count(*) filter (where o.payment_status = 'paid')                          as settled_orders,
       coalesce(sum(o.total_amount) filter (where o.payment_status = 'paid'), 0)  as gross,
       coalesce(sum(o.material_cost) filter (where o.payment_status = 'paid'), 0) as material_total,
       coalesce(sum(
         (o.total_amount - o.material_cost) * coalesce(o.partner_split_pct,0)/100.0
         + case when o.material_paid_by = 'partner' then o.material_cost else 0 end
       ) filter (where o.payment_status = 'paid'), 0) as partner_owed,
       coalesce(sum(
         (o.total_amount - o.material_cost) * (1 - coalesce(o.partner_split_pct,0)/100.0)
         + case when o.material_paid_by = 'us' then o.material_cost else 0 end
       ) filter (where o.payment_status = 'paid'), 0) as your_take
from businesses b
join orders o on o.business_id = b.id
where b.partner_split_pct > 0
group by b.id, b.name, b.partner_name;
```

### RLS

Keep the current "all authenticated = true" policies (you're the only operator). Add the
same policy to `businesses` and to the new columns' tables as needed. Per-business RLS
(staff who only see one brand) is a future option, not needed now.

---

## App changes

### 1. `src/context/BusinessContext.jsx` (new)
- Loads `businesses` on mount; exposes `businesses`, `currentBusiness`,
  `setCurrentBusiness(slug)`, and an `"all"` pseudo-selection for Finances.
- Persists the selected business in `localStorage`.
- Wrap the admin tree in `App.jsx` with `<BusinessProvider>`.

### 2. Runtime theming (handles dark brands + fonts)
- In the provider, a `useEffect` writes the current business's branding onto
  `document.documentElement.style`: `--color-primary/secondary/accent`,
  plus `--color-background` and a `--color-text`, and sets `data-theme="light|dark"` on
  the root. Because `index.css` already drives the UI off these vars, the whole admin
  re-skins on switch.
- **Dark brands (Hikari):** admin surfaces must read from `--color-background` /
  `--color-text` (not hard-coded `bg-gray-50` / `text-gray-900`) so a dark business
  renders black-bg/white-text. The admin shell should use theme-aware utility classes
  driven by `data-theme`. (Public Magic Arte site keeps its light defaults.)
- **Fonts:** load Montserrat + Poppins (Hikari) and apply `font_primary` / `font_secondary`
  via CSS vars too, so each brand uses its own type.

### 3. `src/components/AdminLayout.jsx` (new) — the neutral operator console
- Neutral top bar (own name, e.g. "Studio HQ" — NOT Magic Arte branded).
- **Business switcher** dropdown (logo + name + color dot per business).
- The admin nav tabs (Orders / Products / Clients / Finances / Catalog), extracted from
  the duplicated inline buttons in each page.
- Logout.
- Refactor `Orders`, `Admin`, `Clients`, `Finances`, `Catalog` to render inside it and
  drop their repeated nav buttons.

### 4. Scope every admin query/insert by business
- `useSupabaseQuery` (products/categories): pass a
  `filters: [{ column: 'business_id', value: currentBusiness.id }]`.
- `Orders.jsx`, `Clients.jsx`, `Finances.jsx` (raw supabase): add
  `.eq('business_id', currentBusiness.id)` to every select, and set `business_id` on
  every insert. (Largest task — `Orders.jsx` is 2617 lines.)

### 5. Hikari + xTool product forms
- Reuse the base product form; render extra fields driven by the active business and write
  them to the matching detail table (`product_3d_details` for Hikari,
  `product_engraving_details` for xTool) in the same save flow as the base product row.

### 6. Engraving order form: material + split
- For Joyería Trigueros orders, add two inputs: **material cost** and **who paid it**
  (us / dad). Default `partner_split_pct` from the business (50), editable per order
  (set 0 for a solo job); save all three as a snapshot on the order.
- Show a live preview of the split (your take / dad's take) as the price is entered.
- Allow engraving line items with no catalog product (`product_id` null) for
  bring-your-own jobs.

### 7. Finances combined view + partner accounting
- Add an **"All businesses"** option to the switcher (Finances only). Read from the
  `business_earnings` view to show per-business **collected / partner share / net to us**
  plus a grand total.
- Add a **partner settlement** panel from `partner_settlements` (what you owe Joyería
  Trigueros this period).

### 8. Public site (unchanged now)
- Public routes (`Home`, `Products`, `ProductDetail`, public `Catalog`) hard-filter to
  the `magicarte` business so only Magic Arte products show publicly. Per-brand public
  storefronts are a later phase.

---

## Phased rollout (each phase ships independently)

- **Phase 0 — Schema.** Create `businesses`, add `business_id` + `attributes`, seed
  Magic Arte, backfill. App untouched and still works (it just ignores the new columns).
- **Phase 1 — Shell + theming.** `BusinessContext`, runtime theming, neutral
  `AdminLayout` with the switcher. Defaults to Magic Arte; behavior identical.
- **Phase 2 — Scope by business.** Add `business_id` filtering/stamping to Products,
  Orders, Clients, Finances, Catalog.
- **Phase 3 — New businesses.** Seed Hikari + Joyería Trigueros; detail-table product
  forms; engraving material + split inputs.
- **Phase 4 — Combined finances.** `business_earnings` view + "All businesses" mode.
- **Phase 5 (later).** Per-brand public storefronts (own domain/theme), same backend.

## Infrastructure note

Supabase + Vercel is the right stack.

**Storage decision: offload files to S3 (or Cloudflare R2), keep only data + URLs in
Supabase.** The 500 MB free DB holds 300k+ orders — structured data is never the limit.
The limits that *would* bite (1 GB file storage, 5 GB egress) are both about binary files,
so moving images + STL files to S3 removes them at once (images served from S3/CDN don't
count against Supabase egress). This lets the **free Supabase plan last indefinitely**.
- R2 is preferred over S3 if cost matters (S3-compatible API, **zero egress fees**).
- Code change (isolated, separate from the schema work): `api/compress-image` uploads to
  S3/R2 and returns the object URL; `src/utils/getImageUrl.js` returns that URL; drop the
  direct-to-Supabase-storage fallback.

**Backups:** the one real gap left on free. Either upgrade to **Pro ($25/mo)** for managed
daily backups + point-in-time recovery (also removes project pausing), OR self-host a
scheduled `pg_dump` (tiny once blobs live in S3) into the same S3 bucket. Until then, take a
manual `pg_dump` before any migration.
