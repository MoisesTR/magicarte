-- Payments log for orders.
-- Each row is one payment the customer made toward an order.
-- Status, commission and net are DERIVED from these rows in the app, not stored.
--
-- IMPORTANT: order_id below is declared as `bigint`. It MUST match the type of
-- your orders.id column. If your orders.id is a uuid, change `bigint` to `uuid`
-- in the order_id line. To check, run:
--   select data_type from information_schema.columns
--   where table_name = 'orders' and column_name = 'id';

create table if not exists public.order_payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    bigint not null references public.orders (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  method      text not null check (method in ('efectivo', 'transferencia', 'tarjeta')),
  paid_at     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists order_payments_order_id_idx on public.order_payments (order_id);

-- Row Level Security: match the orders table policy.
-- Adjust to your existing policy style if different.
alter table public.order_payments enable row level security;

drop policy if exists "order_payments_all_authenticated" on public.order_payments;
create policy "order_payments_all_authenticated"
  on public.order_payments
  for all
  to authenticated
  using (true)
  with check (true);

-- One-time backfill: turn each existing order's payment_status / payment_method
-- into a single payment row, so nothing is lost and commission shows correctly.
-- Only orders marked paid or partial get a row. "partial" is recorded as half
-- the total (a guess) -- edit those manually afterwards if you know the real amount.
with migrated as (
  select
    o.id as order_id,
    case
      when o.payment_status = 'paid'    then o.total_amount
      when o.payment_status = 'partial' then round(o.total_amount / 2.0, 2)
    end as amount,
    case
      when o.payment_method = 'credit_card'   then 'tarjeta'
      when o.payment_method = 'cash_transfer' then 'transferencia'
      else 'transferencia'
    end as method,
    coalesce(o.order_date, current_date) as paid_at
  from public.orders o
  where o.payment_status in ('paid', 'partial')
    and o.total_amount is not null
    and not exists (
      select 1 from public.order_payments p where p.order_id = o.id
    )
)
insert into public.order_payments (order_id, amount, method, paid_at, note)
select order_id, amount, method, paid_at, 'Pago migrado del registro anterior'
from migrated
-- Skip orders whose total (or half) rounds to 0 -- a C$0 order has nothing to collect.
where amount > 0;
