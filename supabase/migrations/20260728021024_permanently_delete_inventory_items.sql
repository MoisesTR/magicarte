-- Inventory rows created by mistake should be removable together with every
-- stock movement they generated. The confirmation UI makes this irreversible
-- behavior explicit before calling the tenant-scoped function below.

begin;

-- The child FK is already indexed by inventory_movements_item_occurred_at_idx,
-- so cascaded removal does not require a full movement-table scan.
alter table public.inventory_movements
  drop constraint inventory_movements_inventory_item_id_fkey;

alter table public.inventory_movements
  add constraint inventory_movements_inventory_item_id_fkey
  foreign key (inventory_item_id)
  references public.inventory_items(id)
  on delete cascade;

-- Only signed-in members of the item's business may delete it. Movement rows
-- are deleted only by the FK cascade; clients receive no direct DELETE access
-- to the movement ledger.
revoke delete on table public.inventory_items from public, anon;
grant delete on table public.inventory_items to authenticated;

drop policy if exists "Users delete own business inventory items"
  on public.inventory_items;

create policy "Users delete own business inventory items"
  on public.inventory_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = inventory_items.business_id
        and ub.user_id = (select auth.uid())
    )
  );

-- Preserve the existing RPC contract so already-deployed clients continue to
-- work while switching the operation from soft deletion to permanent removal.
create or replace function public.remove_inventory_item(
  p_item_id uuid,
  p_business_id bigint
)
returns table (
  action text,
  movement_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.inventory_items i
  where i.id = p_item_id
    and i.business_id = p_business_id;

  if not found then
    raise exception 'Inventory item not found in this business'
      using errcode = 'P0002';
  end if;

  -- Return zero for backwards compatibility: earlier clients interpret a
  -- positive count as history that was retained, which is no longer true.
  return query select 'deleted'::text, 0::bigint;
end;
$$;

comment on function public.remove_inventory_item(uuid, bigint) is
  'Permanently deletes a tenant-owned inventory item and its movements under caller RLS.';

revoke execute on function public.remove_inventory_item(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.remove_inventory_item(uuid, bigint)
  to authenticated;

-- Permanently remove rows deleted under the previous soft-delete behavior.
-- At migration review time this is one mistaken Ema Accesorios item.
delete from public.inventory_items
where deleted_at is not null;

-- Remove the obsolete soft-delete model entirely so future callers cannot
-- recreate hidden inventory rows through a direct UPDATE.
drop view public.inventory_stock;
drop index public.inventory_items_business_sku_key;

alter table public.inventory_items
  drop column deleted_at;

create unique index inventory_items_business_sku_key
  on public.inventory_items (business_id, lower(sku))
  where sku is not null;

create or replace function public.enforce_inventory_movement_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_business_id bigint;
  linked_order_business_id bigint;
begin
  select business_id into item_business_id
  from public.inventory_items
  where id = new.inventory_item_id;

  if item_business_id is null or item_business_id <> new.business_id then
    raise exception 'Inventory item and movement must belong to the same business';
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

revoke execute on function public.enforce_inventory_movement_business()
  from public, anon, authenticated;

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

revoke all privileges on table public.inventory_stock
  from public, anon, authenticated;
grant select on table public.inventory_stock to authenticated;

commit;

-- Verification:
-- Deleting an owned item removes both the item and all of its movements.
-- A caller without access to the business sees no row and receives P0002.
