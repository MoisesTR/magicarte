-- Optional packs and design choices. Historical order text survives catalog removal.
begin;

create table public.product_presentations (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  units integer not null check (units > 0),
  price numeric(12,2) not null check (price >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product_designs (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  image_url text check (image_url is null or image_url ~* '^https://[^[:space:]]+$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_designs_product_name_key on public.product_designs (product_id, lower(name));
create index product_presentations_product_id_idx on public.product_presentations (product_id);
create index product_designs_product_id_idx on public.product_designs (product_id);
create index product_presentations_business_idx on public.product_presentations (business_id);
create index product_designs_business_idx on public.product_designs (business_id);

alter table public.order_items
  add column presentation_id uuid references public.product_presentations(id) on delete set null,
  add column presentation_label text,
  add column units_per_presentation integer check (units_per_presentation is null or units_per_presentation > 0);
create index order_items_presentation_id_idx on public.order_items (presentation_id) where presentation_id is not null;

create table public.order_item_designs (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  design_id uuid references public.product_designs(id) on delete set null,
  design_name text not null check (btrim(design_name) <> ''),
  quantity integer not null check (quantity > 0),
  note text,
  created_at timestamptz not null default now()
);
create index order_item_designs_order_item_id_idx on public.order_item_designs (order_item_id);
create index order_item_designs_business_idx on public.order_item_designs (business_id);
create index order_item_designs_design_id_idx on public.order_item_designs (design_id) where design_id is not null;

create function public.enforce_product_option_business()
returns trigger language plpgsql security definer set search_path = public as $$
declare product_business_id bigint;
begin
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'Product option business cannot be changed';
  end if;
  select business_id into product_business_id from public.products where id = new.product_id for share;
  if product_business_id is null or product_business_id <> new.business_id then
    raise exception 'Product option and product must belong to the same business';
  end if;
  -- Do not move options already referenced by order snapshots to another product.
  if tg_op = 'UPDATE' and new.product_id is distinct from old.product_id then
    raise exception 'Product option product cannot be changed';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger product_presentations_enforce_business before insert or update on public.product_presentations
for each row execute function public.enforce_product_option_business();
create trigger product_designs_enforce_business before insert or update on public.product_designs
for each row execute function public.enforce_product_option_business();

create function public.enforce_order_item_design_business()
returns trigger language plpgsql security definer set search_path = public as $$
declare item_business_id bigint; item_product_id uuid; d record;
begin
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'Order design business cannot be changed';
  end if;
  select o.business_id, oi.product_id into item_business_id, item_product_id
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = new.order_item_id for share of oi, o;
  if item_business_id is null or item_business_id <> new.business_id then
    raise exception 'Order design and order must belong to the same business';
  end if;
  if new.design_id is not null then
    select business_id, product_id into d from public.product_designs where id = new.design_id for share;
    if not found or d.business_id <> new.business_id or d.product_id is distinct from item_product_id then
      raise exception 'Design must belong to the order item product and business';
    end if;
  end if;
  return new;
end;
$$;
create trigger order_item_designs_enforce_business before insert or update on public.order_item_designs
for each row execute function public.enforce_order_item_design_business();

create function public.enforce_order_item_presentation_business()
returns trigger language plpgsql security definer set search_path = public as $$
declare order_business_id bigint; p record;
begin
  select business_id into order_business_id from public.orders where id = new.order_id for share;
  -- A product's FK SET NULL may run before its option cascades. Keep text snapshots.
  if tg_op = 'UPDATE' and new.product_id is null and old.product_id is not null
    and not exists (select 1 from public.products where id = old.product_id) then
    new.presentation_id = null;
  end if;
  if new.presentation_id is not null then
    select business_id, product_id into p from public.product_presentations where id = new.presentation_id for share;
    if not found or p.business_id is distinct from order_business_id or p.product_id is distinct from new.product_id then
      raise exception 'Presentation must belong to the order item product and business';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.order_id is distinct from old.order_id or (new.product_id is not null and new.product_id is distinct from old.product_id))
    and exists (select 1 from public.order_item_designs where order_item_id = old.id) then
    raise exception 'Order item with design snapshots cannot change product or order';
  end if;
  return new;
end;
$$;
create trigger order_items_enforce_presentation before insert or update of presentation_id, product_id, order_id on public.order_items
for each row execute function public.enforce_order_item_presentation_business();

-- Parent tenant changes must not strand children in another tenant.
create function public.prevent_presentation_parent_business_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.business_id is distinct from old.business_id then
    if tg_table_name = 'products' then
      if exists (select 1 from public.product_presentations where product_id = old.id)
        or exists (select 1 from public.product_designs where product_id = old.id) then
        raise exception 'Product with options cannot change business';
      end if;
    else
      if exists (select 1 from public.order_items oi where oi.order_id = old.id and
        (oi.presentation_id is not null or exists (select 1 from public.order_item_designs d where d.order_item_id = oi.id))) then
        raise exception 'Order with option snapshots cannot change business';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger products_prevent_option_business_change before update of business_id on public.products
for each row execute function public.prevent_presentation_parent_business_change();
create trigger orders_prevent_option_business_change before update of business_id on public.orders
for each row execute function public.prevent_presentation_parent_business_change();

alter table public.product_presentations enable row level security;
alter table public.product_designs enable row level security;
alter table public.order_item_designs enable row level security;
grant select, insert, update, delete on public.product_presentations to authenticated;
grant select, insert, update, delete on public.product_designs to authenticated;
grant select, insert, update, delete on public.order_item_designs to authenticated;
grant select on public.product_presentations, public.product_designs to anon;

create policy "Business members manage presentations" on public.product_presentations for all to authenticated
using (exists (select 1 from public.user_businesses ub where ub.business_id = product_presentations.business_id and ub.user_id = (select auth.uid())))
with check (exists (select 1 from public.user_businesses ub where ub.business_id = product_presentations.business_id and ub.user_id = (select auth.uid())));
create policy "Business members manage designs" on public.product_designs for all to authenticated
using (exists (select 1 from public.user_businesses ub where ub.business_id = product_designs.business_id and ub.user_id = (select auth.uid())))
with check (exists (select 1 from public.user_businesses ub where ub.business_id = product_designs.business_id and ub.user_id = (select auth.uid())));
create policy "Business members manage order design snapshots" on public.order_item_designs for all to authenticated
using (exists (select 1 from public.user_businesses ub where ub.business_id = order_item_designs.business_id and ub.user_id = (select auth.uid())))
with check (exists (select 1 from public.user_businesses ub where ub.business_id = order_item_designs.business_id and ub.user_id = (select auth.uid())));
create policy "Public visible active presentations" on public.product_presentations for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_id and p.business_id = product_presentations.business_id and p.is_visible) and is_active);
create policy "Public visible active designs" on public.product_designs for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_id and p.business_id = product_designs.business_id and p.is_visible) and is_active);

revoke execute on function public.enforce_product_option_business() from public, anon, authenticated;
revoke execute on function public.enforce_order_item_design_business() from public, anon, authenticated;
revoke execute on function public.enforce_order_item_presentation_business() from public, anon, authenticated;
revoke execute on function public.prevent_presentation_parent_business_change() from public, anon, authenticated;
commit;
