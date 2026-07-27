-- Preserve the currency shown by Amazon, Temu, or a courier while keeping the
-- inventory valuation in córdobas. purchase_cost and delivery_cost remain the
-- canonical NIO amounts consumed by the existing landed-cost triggers.

begin;

alter table public.inventory_movements
  add column if not exists purchase_currency text,
  add column if not exists delivery_currency text,
  add column if not exists exchange_rate_to_nio numeric(14, 6),
  add column if not exists original_purchase_cost numeric(14, 2),
  add column if not exists original_delivery_cost numeric(14, 2);

-- Existing purchases were entered in córdobas, so their original and
-- canonical values are identical.
update public.inventory_movements
set purchase_currency = 'NIO',
    delivery_currency = 'NIO',
    exchange_rate_to_nio = 1,
    original_purchase_cost = purchase_cost,
    original_delivery_cost = coalesce(delivery_cost, 0)
where purchase_cost is not null
  and original_purchase_cost is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_purchase_currency_check'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_purchase_currency_check
      check (purchase_currency is null or purchase_currency in ('NIO', 'USD'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_delivery_currency_check'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_delivery_currency_check
      check (delivery_currency is null or delivery_currency in ('NIO', 'USD'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_exchange_rate_positive'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_exchange_rate_positive
      check (exchange_rate_to_nio is null or exchange_rate_to_nio > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_original_costs_nonnegative'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_original_costs_nonnegative
      check (
        (original_purchase_cost is null or original_purchase_cost >= 0)
        and (original_delivery_cost is null or original_delivery_cost >= 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_purchase_currency_metadata_complete'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_purchase_currency_metadata_complete
      check (
        purchase_cost is null
        or (
          purchase_currency is not null
          and delivery_currency is not null
          and exchange_rate_to_nio is not null
          and original_purchase_cost is not null
          and original_delivery_cost is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_nio_exchange_rate_check'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_nio_exchange_rate_check
      check (
        purchase_cost is null
        or purchase_currency = 'USD'
        or delivery_currency = 'USD'
        or exchange_rate_to_nio = 1
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_converted_costs_check'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_converted_costs_check
      check (
        purchase_cost is null
        or (
          purchase_cost = round(
            original_purchase_cost
            * case when purchase_currency = 'USD' then exchange_rate_to_nio else 1 end,
            2
          )
          and delivery_cost = round(
            original_delivery_cost
            * case when delivery_currency = 'USD' then exchange_rate_to_nio else 1 end,
            2
          )
        )
      );
  end if;
end $$;

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
      2
    );
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_movements_calculate_purchase_cost on public.inventory_movements;
create trigger inventory_movements_calculate_purchase_cost
before insert or update of
  movement_type,
  quantity_delta,
  purchase_cost,
  delivery_cost,
  purchase_currency,
  delivery_currency,
  exchange_rate_to_nio,
  original_purchase_cost,
  original_delivery_cost
on public.inventory_movements
for each row execute function public.calculate_inventory_purchase_unit_cost();

comment on column public.inventory_movements.purchase_currency is
  'ISO currency of original_purchase_cost (NIO or USD).';
comment on column public.inventory_movements.delivery_currency is
  'ISO currency of original_delivery_cost (NIO or USD).';
comment on column public.inventory_movements.exchange_rate_to_nio is
  'Historical C$ value of US$1 used to normalize this purchase.';
comment on column public.inventory_movements.original_purchase_cost is
  'Package amount in purchase_currency before conversion to NIO.';
comment on column public.inventory_movements.original_delivery_cost is
  'Delivery/import amount in delivery_currency before conversion to NIO.';

revoke execute on function public.calculate_inventory_purchase_unit_cost()
  from public, anon, authenticated;

commit;

-- Verification example:
-- US$25 of merchandise at C$36.80 plus C$180 delivery, 10 units received,
-- becomes C$1,100 landed total and C$110 unit cost.
