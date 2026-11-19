-- Exact Bambu product links and official photos remain private inventory metadata.
begin;

alter table public.inventory_items
  add column if not exists product_url text,
  add column if not exists product_image_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_items'::regclass
      and conname = 'inventory_items_product_url_https'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_product_url_https
      check (product_url is null or product_url like 'https://%');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_items'::regclass
      and conname = 'inventory_items_product_image_url_https'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_product_image_url_https
      check (product_image_url is null or product_image_url like 'https://%');
  end if;
end;
$$;

-- Preserve every existing view column and append the new fields only.
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
  i.variant_color,
  i.color_hex,
  i.color_transparent,
  i.product_url,
  i.product_image_url
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
