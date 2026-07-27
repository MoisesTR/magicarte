-- Store four decimal places for landed unit costs. This matters for
-- filament valued per gram and for large packages whose per-unit cost can be
-- less than one centavo.

begin;

-- PostgreSQL does not allow changing a column type while a view depends on
-- it, so recreate the stock view in the same transaction.
drop view public.inventory_stock;

alter table public.inventory_items
  alter column unit_cost type numeric(18, 4)
  using round(unit_cost, 4);

alter table public.inventory_movements
  alter column unit_cost type numeric(18, 4)
  using round(unit_cost, 4);

create or replace function public.calculate_inventory_purchase_unit_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.movement_type = 'purchase'
     and (new.purchase_cost is not null or new.original_purchase_cost is not null) then
    if new.quantity_delta <= 0 then
      raise exception 'A purchase quantity must be positive';
    end if;

    -- Backwards compatibility for clients that still send only NIO totals.
    if new.original_purchase_cost is null then
      new.original_purchase_cost := new.purchase_cost;
      new.original_delivery_cost := coalesce(new.delivery_cost, 0);
      new.purchase_currency := 'NIO';
      new.delivery_currency := 'NIO';
      new.exchange_rate_to_nio := 1;
    else
      new.purchase_currency := upper(coalesce(nullif(btrim(new.purchase_currency), ''), 'NIO'));
      new.delivery_currency := upper(coalesce(nullif(btrim(new.delivery_currency), ''), 'NIO'));
      new.original_delivery_cost := coalesce(new.original_delivery_cost, 0);

      if new.purchase_currency not in ('NIO', 'USD')
         or new.delivery_currency not in ('NIO', 'USD') then
        raise exception 'Purchase currencies must be NIO or USD';
      end if;

      if new.purchase_currency = 'USD' or new.delivery_currency = 'USD' then
        if new.exchange_rate_to_nio is null or new.exchange_rate_to_nio <= 0 then
          raise exception 'A positive C$ per US$ exchange rate is required';
        end if;
      else
        new.exchange_rate_to_nio := 1;
      end if;
    end if;

    if new.original_purchase_cost < 0 or new.original_delivery_cost < 0 then
      raise exception 'Purchase and delivery costs cannot be negative';
    end if;

    new.purchase_cost := round(
      new.original_purchase_cost
      * case when new.purchase_currency = 'USD' then new.exchange_rate_to_nio else 1 end,
      2
    );
    new.delivery_cost := round(
      new.original_delivery_cost
      * case when new.delivery_currency = 'USD' then new.exchange_rate_to_nio else 1 end,
      2
    );
    new.unit_cost := round(
      (new.purchase_cost + new.delivery_cost) / new.quantity_delta,
      4
    );
  end if;

  return new;
end;
$$;

create or replace function public.update_inventory_item_average_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_before numeric(18, 3);
  current_average numeric(18, 4);
  landed_total numeric(18, 2);
  new_average numeric(18, 4);
begin
  if new.movement_type <> 'purchase' or new.purchase_cost is null then
    return new;
  end if;

  select unit_cost into current_average
  from public.inventory_items
  where id = new.inventory_item_id
  for update;

  select coalesce(sum(quantity_delta), 0) - new.quantity_delta into stock_before
  from public.inventory_movements
  where inventory_item_id = new.inventory_item_id;

  landed_total := new.purchase_cost + coalesce(new.delivery_cost, 0);
  if stock_before > 0 then
    new_average := round(
      ((stock_before * coalesce(current_average, 0)) + landed_total)
      / (stock_before + new.quantity_delta),
      4
    );
  else
    new_average := new.unit_cost;
  end if;

  update public.inventory_items
  set unit_cost = new_average
  where id = new.inventory_item_id;

  return new;
end;
$$;

create view public.inventory_stock
with (security_invoker = true) as
select
  i.id,
  i.business_id,
  i.name,
  i.sku,
  i.item_type,
  i.unit,
  i.low_stock_threshold,
  i.unit_cost,
  i.supplier_name,
  i.notes,
  i.is_active,
  i.created_at,
  i.updated_at,
  coalesce(m.current_stock, 0::numeric) as current_stock,
  coalesce(m.current_stock, 0::numeric) <= i.low_stock_threshold as is_low_stock,
  i.inventory_kind,
  i.filament_color,
  i.filament_material,
  i.grams_per_spool
from public.inventory_items i
left join lateral (
  select sum(im.quantity_delta) as current_stock
  from public.inventory_movements im
  where im.inventory_item_id = i.id
) m on true;

grant select on public.inventory_stock to authenticated;

revoke execute on function public.calculate_inventory_purchase_unit_cost()
  from public, anon, authenticated;
revoke execute on function public.update_inventory_item_average_cost()
  from public, anon, authenticated;

commit;

-- Verification example: US$20 at C$36.80 plus C$100 delivery for a 1,000 g
-- spool becomes C$836 landed total and C$0.8360 per gram.
