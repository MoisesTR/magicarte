-- A percentage is the normal way to split engraving profit, but a particular
-- job can be agreed in exact córdobas. Store both parties' final amounts as a
-- pair so finance roll-ups can never infer a different split later.

begin;

alter table public.orders
  add column partner_share_amount numeric(14, 2),
  add column your_share_amount numeric(14, 2);

alter table public.orders
  add constraint orders_exact_share_amounts_check
  check (
    (partner_share_amount is null and your_share_amount is null)
    or (
      partner_share_amount is not null
      and your_share_amount is not null
      and partner_share_amount >= 0
      and your_share_amount >= 0
      and round(partner_share_amount + your_share_amount, 2) = round(total_amount, 2)
    )
  );

-- Preserve the business-scoped RLS behaviour of these views. Exact amounts,
-- when present, take precedence; historic and regular orders keep using the
-- existing material reimbursement + percentage calculation.
create or replace view public.business_earnings
with (security_invoker = true) as
select
  b.id as business_id,
  b.name,
  (
    select count(*)
    from public.orders o
    where o.business_id = b.id
  ) as orders_count,
  coalesce((
    select sum(p.amount)
    from public.order_payments p
    where p.business_id = b.id
  ), 0::numeric) as collected,
  coalesce((
    select sum(coalesce(
      o.your_share_amount,
      (o.total_amount - o.material_cost) * (1 - coalesce(o.partner_split_pct, 0) / 100.0)
        + case when o.material_paid_by = 'us' then o.material_cost else 0 end
    ))
    from public.orders o
    where o.business_id = b.id
      and o.payment_status = 'paid'
  ), 0::numeric) as net_to_us_paid,
  coalesce((
    select sum(coalesce(
      o.partner_share_amount,
      (o.total_amount - o.material_cost) * coalesce(o.partner_split_pct, 0) / 100.0
        + case when o.material_paid_by = 'partner' then o.material_cost else 0 end
    ))
    from public.orders o
    where o.business_id = b.id
      and o.payment_status = 'paid'
  ), 0::numeric) as partner_share_paid
from public.businesses b
where exists (
  select 1
  from public.user_businesses ub
  where ub.business_id = b.id
    and ub.user_id = (select auth.uid())
);

create or replace view public.partner_settlements
with (security_invoker = true) as
select
  b.id as business_id,
  b.name,
  b.partner_name,
  count(*) filter (where o.payment_status = 'paid') as settled_orders,
  coalesce(sum(o.total_amount) filter (where o.payment_status = 'paid'), 0::numeric) as gross,
  coalesce(sum(o.material_cost) filter (where o.payment_status = 'paid'), 0::numeric) as material_total,
  coalesce(sum(coalesce(
    o.partner_share_amount,
    (o.total_amount - o.material_cost) * coalesce(o.partner_split_pct, 0) / 100.0
      + case when o.material_paid_by = 'partner' then o.material_cost else 0 end
  )) filter (where o.payment_status = 'paid'), 0::numeric) as partner_owed,
  coalesce(sum(coalesce(
    o.your_share_amount,
    (o.total_amount - o.material_cost) * (1 - coalesce(o.partner_split_pct, 0) / 100.0)
      + case when o.material_paid_by = 'us' then o.material_cost else 0 end
  )) filter (where o.payment_status = 'paid'), 0::numeric) as your_take
from public.businesses b
join public.orders o on o.business_id = b.id
where b.partner_split_pct > 0
  and exists (
    select 1
    from public.user_businesses ub
    where ub.business_id = b.id
      and ub.user_id = (select auth.uid())
  )
group by b.id, b.name, b.partner_name;

grant select on public.business_earnings, public.partner_settlements to authenticated;

commit;

-- Verification:
-- select partner_share_amount, your_share_amount, total_amount
-- from public.orders
-- where business_id = (select id from public.businesses where slug = 'joyeria-trigueros');
