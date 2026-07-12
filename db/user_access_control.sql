-- ============================================================================
-- Per-user business access control.
--
-- Problem: every RLS policy today is "any authenticated user = true" — so
-- adding more logins (e.g. a Hikari-only helper) would let them read/write
-- every business's orders, clients, and payments, not just their own.
--
-- Fix: a user_businesses table (who can see which business) + RLS rewritten
-- on every business-scoped table to check membership there, instead of just
-- "are you logged in".
--
-- SAFE: 100% additive on the schema side (new table), and the only DROPs are
-- of RLS *policies* (not data/columns) which are immediately replaced with a
-- stricter equivalent in the same transaction. public_businesses (used by the
-- public storefront + admin theming) is a view owned by `postgres`, so it
-- bypasses RLS on the underlying `businesses` table entirely — this migration
-- does not affect anonymous/public access to it.
--
-- Verified before writing this: zero rows with a null business_id across
-- products/categories/orders/clients/order_payments, so nothing goes dark.
--
-- HOW TO RUN: paste into the Supabase SQL Editor and run once.
-- ============================================================================

begin;

create table if not exists public.user_businesses (
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id bigint not null references public.businesses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, business_id)
);

alter table public.user_businesses enable row level security;

drop policy if exists "users read own business access" on public.user_businesses;
create policy "users read own business access" on public.user_businesses
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Grant every existing user access to every existing business (today: just
-- you, to all 3). Re-runnable — on conflict do nothing.
insert into public.user_businesses (user_id, business_id)
select u.id, b.id
from auth.users u
cross join public.businesses b
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- businesses: only used for admin reads (switcher, partner config) — never
-- written to by the app. Scope SELECT to the user's own businesses.
-- ----------------------------------------------------------------------------
drop policy if exists "businesses_all_authenticated" on public.businesses;
drop policy if exists "businesses_own_access" on public.businesses;
create policy "businesses_own_access" on public.businesses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = businesses.id and ub.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- products / categories: the public storefront reads Magic Arte's rows
-- anonymously — keep that, but scoped to Magic Arte only (not every
-- business). Authenticated management is scoped to the user's own businesses.
-- ----------------------------------------------------------------------------
drop policy if exists "Anyone can view products" on public.products;
drop policy if exists "Anyone can view magicarte products" on public.products;
create policy "Anyone can view magicarte products" on public.products
  for select
  to public
  -- public_businesses is a deliberately public, security-definer view. Querying
  -- businesses here would be RLS-filtered to zero rows for anonymous visitors.
  using (business_id = (select id from public.public_businesses where slug = 'magicarte'));

drop policy if exists "Only authenticated users can manage products" on public.products;
drop policy if exists "Users manage own business products" on public.products;
create policy "Users manage own business products" on public.products
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = products.business_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = products.business_id and ub.user_id = auth.uid()
    )
  );

drop policy if exists "Anyone can view categories" on public.categories;
drop policy if exists "Anyone can view magicarte categories" on public.categories;
create policy "Anyone can view magicarte categories" on public.categories
  for select
  to public
  using (business_id = (select id from public.public_businesses where slug = 'magicarte'));

drop policy if exists "Only authenticated users can manage categories" on public.categories;
drop policy if exists "Users manage own business categories" on public.categories;
create policy "Users manage own business categories" on public.categories
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = categories.business_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = categories.business_id and ub.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- orders / clients / order_payments: already authenticated-only; scope by
-- the user's own businesses.
-- ----------------------------------------------------------------------------
drop policy if exists "Only authenticated users can manage orders" on public.orders;
drop policy if exists "Only authenticated users can view orders" on public.orders;
drop policy if exists "Users access own business orders" on public.orders;
create policy "Users access own business orders" on public.orders
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = orders.business_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = orders.business_id and ub.user_id = auth.uid()
    )
  );

drop policy if exists "Allow authenticated users to read clients" on public.clients;
drop policy if exists "Allow authenticated users to insert clients" on public.clients;
drop policy if exists "Allow authenticated users to update clients" on public.clients;
drop policy if exists "Allow authenticated users to delete clients" on public.clients;
drop policy if exists "Users access own business clients" on public.clients;
create policy "Users access own business clients" on public.clients
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = clients.business_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = clients.business_id and ub.user_id = auth.uid()
    )
  );

drop policy if exists "order_payments_all_authenticated" on public.order_payments;
drop policy if exists "Users access own business payments" on public.order_payments;
create policy "Users access own business payments" on public.order_payments
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = order_payments.business_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_businesses ub
      where ub.business_id = order_payments.business_id and ub.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- order_items: no business_id of its own — scope through the parent order.
-- ----------------------------------------------------------------------------
drop policy if exists "Only authenticated users can manage order items" on public.order_items;
drop policy if exists "Only authenticated users can view order items" on public.order_items;
drop policy if exists "Users access own business order items" on public.order_items;
create policy "Users access own business order items" on public.order_items
  for all
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.user_businesses ub on ub.business_id = o.business_id
      where o.id = order_items.order_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      join public.user_businesses ub on ub.business_id = o.business_id
      where o.id = order_items.order_id and ub.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- product_3d_details / product_engraving_details: scope through the product.
-- Not used by any public route today, so authenticated-only is correct.
-- ----------------------------------------------------------------------------
drop policy if exists "product_3d_details_all_authenticated" on public.product_3d_details;
drop policy if exists "Users access own business 3d details" on public.product_3d_details;
create policy "Users access own business 3d details" on public.product_3d_details
  for all
  to authenticated
  using (
    exists (
      select 1 from public.products p
      join public.user_businesses ub on ub.business_id = p.business_id
      where p.id = product_3d_details.product_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.products p
      join public.user_businesses ub on ub.business_id = p.business_id
      where p.id = product_3d_details.product_id and ub.user_id = auth.uid()
    )
  );

drop policy if exists "product_engraving_details_all_authenticated" on public.product_engraving_details;
drop policy if exists "Users access own business engraving details" on public.product_engraving_details;
create policy "Users access own business engraving details" on public.product_engraving_details
  for all
  to authenticated
  using (
    exists (
      select 1 from public.products p
      join public.user_businesses ub on ub.business_id = p.business_id
      where p.id = product_engraving_details.product_id and ub.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.products p
      join public.user_businesses ub on ub.business_id = p.business_id
      where p.id = product_engraving_details.product_id and ub.user_id = auth.uid()
    )
  );

commit;

-- ----------------------------------------------------------------------------
-- After creating a new login in Supabase Auth (Authentication → Users →
-- Invite), grant them access to exactly the businesses they should see, e.g.
-- for a Hikari-only helper:
--
--   insert into public.user_businesses (user_id, business_id)
--   select u.id, b.id
--   from auth.users u, public.businesses b
--   where u.email = 'helper@example.com' and b.slug = 'hikari';
--
-- To revoke access: delete from public.user_businesses where user_id = ... and business_id = ...
-- ----------------------------------------------------------------------------
