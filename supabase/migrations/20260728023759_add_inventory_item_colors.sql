-- General inventory items can be tracked as separate color variants. The
-- field is optional because many supplies have no meaningful color, while
-- Hikari keeps its filament-specific metadata in filament_color.

begin;

alter table public.inventory_items
  add column variant_color text;

alter table public.inventory_items
  add constraint inventory_items_variant_color_not_blank
  check (variant_color is null or btrim(variant_color) <> '');

comment on column public.inventory_items.variant_color is
  'Optional color or finish used to distinguish stock variants of a general inventory item.';

-- Append the field to preserve the existing view column order and grants.
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
  i.variant_color
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
-- General items may store a trimmed color name; blank strings are rejected.
-- inventory_stock exposes variant_color under caller RLS.
