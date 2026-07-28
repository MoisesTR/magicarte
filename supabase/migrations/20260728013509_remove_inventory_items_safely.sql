-- Remove inventory items without erasing the append-only stock ledger.
-- Items without movements can be deleted. Items with history are soft-deleted
-- so their names, units, costs, and movement audit trail remain available.

begin;

alter table public.inventory_items
  add column deleted_at timestamptz;

comment on column public.inventory_items.deleted_at is
  'When set, the item is hidden from inventory while its movement history is retained.';

-- A removed item no longer reserves its former SKU, so the business can reuse
-- that SKU for a replacement item.
drop index public.inventory_items_business_sku_key;

create unique index inventory_items_business_sku_key
  on public.inventory_items (business_id, lower(sku))
  where sku is not null and deleted_at is null;

-- Keep the existing view contract and append the removal marker. The UI reads
-- removed rows only to resolve names and units in the immutable history.
create or replace view public.inventory_stock
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
  i.grams_per_spool,
  i.deleted_at
from public.inventory_items i
left join lateral (
  select sum(im.quantity_delta) as current_stock
  from public.inventory_movements im
  where im.inventory_item_id = i.id
) m on true;

grant select on public.inventory_stock to authenticated;

-- Supabase projects can inherit broad default table privileges. Keep inventory
-- access least-privileged and let RLS govern only the operations the app uses.
revoke all privileges on table public.inventory_items, public.inventory_movements, public.inventory_stock
  from public, anon, authenticated;
grant select, insert, update on table public.inventory_items to authenticated;
grant select, insert on table public.inventory_movements to authenticated;
grant select on table public.inventory_stock to authenticated;

-- Replace the original FOR ALL policy so authenticated clients cannot issue a
-- hard delete even if a future grant is broadened accidentally.
drop policy if exists "Users access own business inventory items"
  on public.inventory_items;

create policy "Users read own business inventory items"
  on public.inventory_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = inventory_items.business_id
        and ub.user_id = (select auth.uid())
    )
  );

create policy "Users add own business inventory items"
  on public.inventory_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = inventory_items.business_id
        and ub.user_id = (select auth.uid())
    )
  );

create policy "Users update own business inventory items"
  on public.inventory_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = inventory_items.business_id
        and ub.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = inventory_items.business_id
        and ub.user_id = (select auth.uid())
    )
  );

create or replace function public.prevent_inventory_item_business_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'An inventory item cannot be moved to another business';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_items_prevent_business_change
  on public.inventory_items;
create trigger inventory_items_prevent_business_change
before update of business_id on public.inventory_items
for each row execute function public.prevent_inventory_item_business_change();

-- Reject stale clients or direct API calls that try to add stock activity to
-- an item after it has been removed.
create or replace function public.enforce_inventory_movement_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_business_id bigint;
  item_deleted_at timestamptz;
  linked_order_business_id bigint;
begin
  select business_id, deleted_at
    into item_business_id, item_deleted_at
  from public.inventory_items
  where id = new.inventory_item_id;

  if item_business_id is null or item_business_id <> new.business_id then
    raise exception 'Inventory item and movement must belong to the same business';
  end if;

  if item_deleted_at is not null then
    raise exception 'Removed inventory items cannot receive new movements';
  end if;

  if new.order_id is not null then
    select business_id into linked_order_business_id
    from public.orders
    where id = new.order_id;

    if linked_order_business_id is null or linked_order_business_id <> new.business_id then
      raise exception 'Order and inventory movement must belong to the same business';
    end if;
  end if;

  return new;
end;
$$;

-- This is deliberately the only deletion entry point exposed to the client.
-- The function validates tenant membership, locks the item, and then chooses
-- hard deletion or history-preserving removal atomically.
create or replace function public.remove_inventory_item(
  p_item_id uuid,
  p_business_id bigint
)
returns table (
  action text,
  movement_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  item_business_id bigint;
  item_movement_count bigint;
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.user_businesses ub
    where ub.business_id = p_business_id
      and ub.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to remove inventory from this business'
      using errcode = '42501';
  end if;

  select i.business_id
    into item_business_id
  from public.inventory_items i
  where i.id = p_item_id
  for update;

  if not found or item_business_id <> p_business_id then
    raise exception 'Inventory item not found in this business'
      using errcode = 'P0002';
  end if;

  select count(*)
    into item_movement_count
  from public.inventory_movements im
  where im.inventory_item_id = p_item_id;

  if item_movement_count = 0 then
    delete from public.inventory_items i
    where i.id = p_item_id
      and i.business_id = p_business_id;

    return query select 'deleted'::text, 0::bigint;
  else
    update public.inventory_items i
    set
      is_active = false,
      deleted_at = coalesce(i.deleted_at, now())
    where i.id = p_item_id
      and i.business_id = p_business_id;

    return query select 'archived'::text, item_movement_count;
  end if;
end;
$$;

comment on function public.remove_inventory_item(uuid, bigint) is
  'Removes a tenant-owned inventory item while preserving any movement history.';

-- Trigger helpers stay unavailable as Data API RPCs. The removal function is
-- callable only by signed-in users and performs its own tenant authorization.
revoke execute on function public.enforce_inventory_movement_business()
  from public, anon, authenticated;
revoke execute on function public.prevent_inventory_item_business_change()
  from public, anon, authenticated;
revoke execute on function public.remove_inventory_item(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.remove_inventory_item(uuid, bigint)
  to authenticated;

commit;

-- Verification:
-- 1. An item without movements returns action = deleted and no row remains.
-- 2. An item with movements returns action = archived, remains available to
--    inventory history, and rejects any later movement.
