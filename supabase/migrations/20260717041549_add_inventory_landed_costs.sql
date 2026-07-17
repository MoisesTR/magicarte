-- Landed inventory cost: the price of a package plus the delivery/import cost
-- to Nicaragua. Purchase batches keep both source amounts for auditability;
-- their unit cost is calculated in Postgres, never trusted from the browser.

begin;

alter table public.inventory_movements
  add column if not exists purchase_cost numeric(14, 2),
  add column if not exists delivery_cost numeric(14, 2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_purchase_cost_nonnegative'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_purchase_cost_nonnegative
      check (purchase_cost is null or purchase_cost >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_delivery_cost_nonnegative'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_delivery_cost_nonnegative
      check (delivery_cost >= 0);
  end if;
end $$;

-- A purchase with a package cost always gets its landed unit cost from the
-- package total + delivery/import cost divided by the received quantity.
create or replace function public.calculate_inventory_purchase_unit_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.movement_type = 'purchase' and new.purchase_cost is not null then
    if new.quantity_delta <= 0 then
      raise exception 'A purchase quantity must be positive';
    end if;

    new.unit_cost := round(
      (new.purchase_cost + coalesce(new.delivery_cost, 0)) / new.quantity_delta,
      2
    );
  end if;
  return new;
end;
$$;

-- The item's current cost is a weighted average of the stock already on hand
-- and the newly received, landed-cost batch. Outgoing movements do not change
-- the average; they only reduce quantity.
create or replace function public.update_inventory_item_average_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_before numeric(14, 3);
  current_average numeric(14, 2);
  landed_total numeric(14, 2);
  new_average numeric(14, 2);
begin
  if new.movement_type <> 'purchase' or new.purchase_cost is null then
    return new;
  end if;

  -- Lock this item's cost row while deriving the new average so simultaneous
  -- purchases cannot overwrite each other's calculation.
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
      2
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

drop trigger if exists inventory_movements_calculate_purchase_cost on public.inventory_movements;
create trigger inventory_movements_calculate_purchase_cost
before insert or update of movement_type, quantity_delta, purchase_cost, delivery_cost
on public.inventory_movements
for each row execute function public.calculate_inventory_purchase_unit_cost();

drop trigger if exists inventory_movements_update_average_cost on public.inventory_movements;
create trigger inventory_movements_update_average_cost
after insert on public.inventory_movements
for each row execute function public.update_inventory_item_average_cost();

revoke execute on function public.calculate_inventory_purchase_unit_cost() from public, anon, authenticated;
revoke execute on function public.update_inventory_item_average_cost() from public, anon, authenticated;

commit;

-- Verification example: a package at C$ 1,500 plus C$ 300 delivery with
-- 100 units received records a batch unit cost of C$ 18.00.
