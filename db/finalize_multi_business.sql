-- ============================================================================
-- Finalize multi-business integrity + secure financial reporting.
--
-- Run only AFTER, in this order:
--   1. multi_business.sql
--   2. engraving_item_fields.sql
--   3. hikari_item_fields.sql
--   4. user_access_control.sql
--
-- This script fails before making schema changes if any current business-owned
-- record has not been backfilled. Take a backup first.
-- ============================================================================

begin;

-- Do not silently make an unknown row inaccessible. Confirm the backfill was
-- complete before making business ownership mandatory.
do $$
begin
  if exists (select 1 from public.products where business_id is null)
     or exists (select 1 from public.categories where business_id is null)
     or exists (select 1 from public.orders where business_id is null)
     or exists (select 1 from public.clients where business_id is null)
     or exists (select 1 from public.order_payments where business_id is null) then
    raise exception 'Cannot finalize: every business-owned record must have a business_id first.';
  end if;
end $$;

alter table public.products       alter column business_id set not null;
alter table public.categories     alter column business_id set not null;
alter table public.orders         alter column business_id set not null;
alter table public.clients        alter column business_id set not null;
alter table public.order_payments alter column business_id set not null;

update public.orders set material_paid_by = 'us' where material_paid_by is null;
alter table public.orders alter column material_paid_by set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_material_cost_nonnegative') then
    alter table public.orders add constraint orders_material_cost_nonnegative check (material_cost >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_partner_split_pct_range') then
    alter table public.orders add constraint orders_partner_split_pct_range check (partner_split_pct is null or partner_split_pct between 0 and 100);
  end if;
end $$;

-- Keep linked records inside their owning business even for an operator who has
-- access to more than one business. App-side filtering is helpful UX; these
-- triggers make the database invariant non-bypassable.
create or replace function public.enforce_order_client_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_business_id bigint;
begin
  if new.client_id is null then return new; end if;
  select business_id into client_business_id from public.clients where id = new.client_id;
  if client_business_id is null or client_business_id <> new.business_id then
    raise exception 'Client and order must belong to the same business';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_order_payment_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_business_id bigint;
begin
  select business_id into order_business_id from public.orders where id = new.order_id;
  if order_business_id is null or order_business_id <> new.business_id then
    raise exception 'Payment and order must belong to the same business';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_order_item_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_business_id bigint;
  product_business_id bigint;
begin
  if new.product_id is null then return new; end if;
  select business_id into order_business_id from public.orders where id = new.order_id;
  select business_id into product_business_id from public.products where id = new.product_id;
  if order_business_id is null or product_business_id is null or order_business_id <> product_business_id then
    raise exception 'Order item product and order must belong to the same business';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enforce_client_business on public.orders;
create trigger orders_enforce_client_business
before insert or update of business_id, client_id on public.orders
for each row execute function public.enforce_order_client_business();

drop trigger if exists payments_enforce_order_business on public.order_payments;
create trigger payments_enforce_order_business
before insert or update of business_id, order_id on public.order_payments
for each row execute function public.enforce_order_payment_business();

drop trigger if exists order_items_enforce_business on public.order_items;
create trigger order_items_enforce_business
before insert or update of order_id, product_id on public.order_items
for each row execute function public.enforce_order_item_business();

-- These views are queried by the all-business dashboard. The membership clause
-- is deliberate: Postgres views otherwise run as their owner and could bypass
-- underlying-table RLS, exposing every business to any authenticated user.
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
  ), 0) as net_to_us_paid,
  coalesce((
    select sum(
      (o.total_amount - o.material_cost) * coalesce(o.partner_split_pct, 0) / 100.0
      + case when o.material_paid_by = 'partner' then o.material_cost else 0 end
    )
    from public.orders o
    where o.business_id = b.id and o.payment_status = 'paid'
  ), 0) as partner_share_paid
from public.businesses b
where exists (
  select 1 from public.user_businesses ub
  where ub.business_id = b.id and ub.user_id = auth.uid()
);

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
  and exists (
    select 1 from public.user_businesses ub
    where ub.business_id = b.id and ub.user_id = auth.uid()
  )
group by b.id, b.name, b.partner_name;

grant select on public.business_earnings to authenticated;
grant select on public.partner_settlements to authenticated;

commit;

-- Read-only verification after commit:
-- select 'products' as table_name, count(*) total, count(business_id) scoped from public.products
-- union all select 'categories', count(*), count(business_id) from public.categories
-- union all select 'orders', count(*), count(business_id) from public.orders
-- union all select 'clients', count(*), count(business_id) from public.clients
-- union all select 'order_payments', count(*), count(business_id) from public.order_payments;
-- select * from public.business_earnings order by name;
-- select * from public.partner_settlements order by name;
