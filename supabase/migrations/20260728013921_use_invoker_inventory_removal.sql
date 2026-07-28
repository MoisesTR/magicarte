-- The removal RPC should obey the caller's table privileges and RLS policies.
-- All items are now soft-deleted; this removes the need for elevated DELETE
-- privileges while keeping the same visible behavior in the inventory UI.

begin;

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
declare
  item_business_id bigint;
  item_movement_count bigint;
begin
  -- RLS makes unauthorized rows invisible. The explicit business predicate is
  -- additional protection against a stale business switch in the client.
  select i.business_id
    into item_business_id
  from public.inventory_items i
  where i.id = p_item_id
    and i.business_id = p_business_id
  for update;

  if not found then
    raise exception 'Inventory item not found in this business'
      using errcode = 'P0002';
  end if;

  select count(*)
    into item_movement_count
  from public.inventory_movements im
  where im.inventory_item_id = p_item_id
    and im.business_id = p_business_id;

  update public.inventory_items i
  set
    is_active = false,
    deleted_at = coalesce(i.deleted_at, now())
  where i.id = p_item_id
    and i.business_id = p_business_id;

  return query select 'removed'::text, item_movement_count;
end;
$$;

comment on function public.remove_inventory_item(uuid, bigint) is
  'Soft-deletes a tenant-owned inventory item under the caller RLS policies.';

revoke execute on function public.remove_inventory_item(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.remove_inventory_item(uuid, bigint)
  to authenticated;

commit;

-- Verification: the function is SECURITY INVOKER, retains every item row and
-- movement, and marks the item inactive with deleted_at set.
