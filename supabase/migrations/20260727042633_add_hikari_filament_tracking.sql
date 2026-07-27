-- Filament is counted in grams in the ledger, while Hikari's UI can accept
-- and display spools as a convenience. This prevents mixed units from making
-- stock inaccurate when a print consumes only part of a spool.

begin;

alter table public.inventory_items
  add column inventory_kind text not null default 'general'
    check (inventory_kind in ('general', 'filament')),
  add column filament_color text,
  add column filament_material text,
  add column grams_per_spool numeric(14, 3);

alter table public.inventory_items
  add constraint inventory_items_filament_details_check
  check (
    inventory_kind <> 'filament'
    or (
      filament_color is not null and btrim(filament_color) <> ''
      and filament_material is not null and btrim(filament_material) <> ''
      and grams_per_spool is not null and grams_per_spool > 0
      and unit = 'g'
    )
  );

create index inventory_items_business_filament_color_idx
  on public.inventory_items (business_id, lower(filament_color))
  where inventory_kind = 'filament';

-- Preserve the existing column order of the view, then append the filament
-- details so callers that already use inventory_stock remain compatible.
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
  i.grams_per_spool
from public.inventory_items i
left join lateral (
  select sum(im.quantity_delta) as current_stock
  from public.inventory_movements im
  where im.inventory_item_id = i.id
) m on true;

grant select on public.inventory_stock to authenticated;

commit;

-- Verification:
-- select name, filament_material, filament_color, current_stock, grams_per_spool
-- from public.inventory_stock
-- where business_id = (select id from public.businesses where slug = 'hikari')
--   and inventory_kind = 'filament';
