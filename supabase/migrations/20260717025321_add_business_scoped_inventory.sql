-- Business-scoped inventory ledger.
--
-- Stock is derived from immutable movements rather than a mutable quantity
-- column, so every correction has an audit trail and each business remains
-- isolated. The legacy public.materials data is retained and copied into
-- Joyería Trigueros as an opening balance below.

begin;

create table public.inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  business_id         bigint not null references public.businesses(id) on delete restrict,
  legacy_material_id  uuid unique references public.materials(id) on delete set null,
  name                text not null check (btrim(name) <> ''),
  sku                 text check (sku is null or btrim(sku) <> ''),
  item_type           text not null default 'material'
                        check (item_type in ('material', 'finished_good', 'supply')),
  unit                text not null default 'unidad' check (btrim(unit) <> ''),
  low_stock_threshold numeric(14, 3) not null default 0 check (low_stock_threshold >= 0),
  unit_cost           numeric(14, 2) not null default 0 check (unit_cost >= 0),
  supplier_name       text,
  notes               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.inventory_movements (
  id                uuid primary key default gen_random_uuid(),
  business_id       bigint not null references public.businesses(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  order_id          uuid references public.orders(id) on delete set null,
  movement_type     text not null check (movement_type in (
                      'opening', 'purchase', 'sale', 'consumption', 'adjustment', 'return'
                    )),
  quantity_delta    numeric(14, 3) not null check (quantity_delta <> 0),
  unit_cost         numeric(14, 2) check (unit_cost is null or unit_cost >= 0),
  note              text,
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  constraint inventory_movements_direction_check check (
    (movement_type in ('opening', 'purchase', 'return') and quantity_delta > 0)
    or (movement_type in ('sale', 'consumption') and quantity_delta < 0)
    or movement_type = 'adjustment'
  )
);

-- A SKU is unique only inside its own business. Items without a SKU are valid.
create unique index inventory_items_business_sku_key
  on public.inventory_items (business_id, lower(sku))
  where sku is not null;

-- An opening balance represents the point at which this inventory ledger
-- begins. Later corrections are recorded as adjustments instead.
create unique index inventory_one_opening_per_item
  on public.inventory_movements (inventory_item_id)
  where movement_type = 'opening';

-- Index foreign keys and the two access/history paths used by the admin UI.
create index inventory_items_business_active_name_idx
  on public.inventory_items (business_id, is_active, name);
create index inventory_movements_business_occurred_at_idx
  on public.inventory_movements (business_id, occurred_at desc);
create index inventory_movements_item_occurred_at_idx
  on public.inventory_movements (inventory_item_id, occurred_at desc);
create index inventory_movements_order_id_idx
  on public.inventory_movements (order_id)
  where order_id is not null;

create or replace function public.set_inventory_item_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function public.set_inventory_item_updated_at();

-- A user who has access to several businesses must still never attach an item
-- or an order from one business to a movement belonging to another.
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

drop trigger if exists inventory_movements_enforce_business on public.inventory_movements;
create trigger inventory_movements_enforce_business
before insert or update of business_id, inventory_item_id, order_id on public.inventory_movements
for each row execute function public.enforce_inventory_movement_business();

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

-- Explicit grants are required on projects that use opt-in Data API exposure.
grant select, insert, update on public.inventory_items to authenticated;
grant select, insert on public.inventory_movements to authenticated;

create policy "Users access own business inventory items" on public.inventory_items
  for all
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

-- Movements are an audit ledger: users can read and add them, but corrections
-- are a new adjustment movement rather than an edit or deletion of history.
create policy "Users read own business inventory movements" on public.inventory_movements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = inventory_movements.business_id
        and ub.user_id = (select auth.uid())
    )
  );

create policy "Users add own business inventory movements" on public.inventory_movements
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = inventory_movements.business_id
        and ub.user_id = (select auth.uid())
    )
  );

-- This view deliberately evaluates the table policies of the caller. It is
-- the stock source for the UI; no client writes a stock total directly.
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
  coalesce(m.current_stock, 0::numeric) <= i.low_stock_threshold as is_low_stock
from public.inventory_items i
left join lateral (
  select sum(im.quantity_delta) as current_stock
  from public.inventory_movements im
  where im.inventory_item_id = i.id
) m on true;

grant select on public.inventory_stock to authenticated;

-- Preserve the old materials table and import each existing material as a
-- Joyería item with a single opening movement. The legacy id makes this safe
-- to re-run without duplicate inventory items.
insert into public.inventory_items (
  business_id,
  legacy_material_id,
  name,
  item_type,
  unit,
  low_stock_threshold,
  unit_cost,
  supplier_name,
  notes
)
select
  b.id,
  m.id,
  m.name,
  'material',
  m.unit,
  m.low_stock_threshold,
  coalesce(m.cost_per_unit, 0),
  m.supplier,
  m.notes
from public.materials m
join public.businesses b on b.slug = 'joyeria-trigueros'
on conflict (legacy_material_id) do nothing;

insert into public.inventory_movements (
  business_id,
  inventory_item_id,
  movement_type,
  quantity_delta,
  unit_cost,
  note
)
select
  i.business_id,
  i.id,
  'opening',
  m.current_stock,
  m.cost_per_unit,
  'Saldo inicial importado de materiales anteriores'
from public.inventory_items i
join public.materials m on m.id = i.legacy_material_id
where m.current_stock > 0
on conflict (inventory_item_id) where movement_type = 'opening' do nothing;

-- Trigger-only helpers are never callable as Data API RPC endpoints.
revoke execute on function public.set_inventory_item_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_inventory_movement_business() from public, anon, authenticated;

commit;

-- Verification:
-- select name, item_type, unit, current_stock, low_stock_threshold
-- from public.inventory_stock
-- where business_id = (select id from public.businesses where slug = 'joyeria-trigueros')
-- order by name;
