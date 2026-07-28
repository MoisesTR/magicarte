-- Every new USD inventory purchase uses the business' fixed operational
-- exchange rate. Existing USD movements retain the historical rate that was
-- recorded when they were created.

begin;

create or replace function public.calculate_inventory_purchase_unit_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fixed_usd_rate constant numeric(14, 6) := 36.624300;
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
        if tg_op = 'INSERT' then
          -- Ignore any client-provided rate for every new USD purchase.
          new.exchange_rate_to_nio := fixed_usd_rate;
        elsif coalesce(old.purchase_currency = 'USD', false)
           or coalesce(old.delivery_currency = 'USD', false) then
          -- A privileged correction must not silently revalue history.
          new.exchange_rate_to_nio := coalesce(old.exchange_rate_to_nio, fixed_usd_rate);
        else
          -- A historical NIO purchase newly converted to USD adopts the rule.
          new.exchange_rate_to_nio := fixed_usd_rate;
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

comment on column public.inventory_movements.exchange_rate_to_nio is
  'C$ value of US$1. New USD purchases use the fixed 36.6243 rate; historical rates are retained.';

revoke execute on function public.calculate_inventory_purchase_unit_cost()
  from public, anon, authenticated;
revoke execute on function public.update_inventory_item_average_cost()
  from public, anon, authenticated;

commit;

-- Verification examples:
-- A new USD purchase that sends any client rate stores 36.624300.
-- A legacy client that sends only NIO totals remains at rate 1.
-- Updating an existing USD movement preserves its historical rate.
