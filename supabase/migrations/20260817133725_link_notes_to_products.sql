-- A note may optionally be attached to one registered product (e.g. "idea
-- for this specific product"), while still allowing general, unattached
-- notes. Enforced same-business the same way as inventory movement links.

begin;

alter table public.business_notes
  add column product_id uuid references public.products(id) on delete set null;

create index business_notes_product_id_idx
  on public.business_notes (product_id)
  where product_id is not null;

create or replace function public.enforce_business_note_product_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_business_id bigint;
begin
  if new.product_id is null then
    return new;
  end if;

  select business_id into product_business_id
  from public.products
  where id = new.product_id;

  if product_business_id is null or product_business_id <> new.business_id then
    raise exception 'Product and note must belong to the same business';
  end if;

  return new;
end;
$$;

drop trigger if exists business_notes_enforce_product_business on public.business_notes;
create trigger business_notes_enforce_product_business
before insert or update of business_id, product_id on public.business_notes
for each row execute function public.enforce_business_note_product_business();

revoke execute on function public.enforce_business_note_product_business() from public, anon, authenticated;

commit;

-- Verification:
-- Attaching a product from a different business to a note raises an exception.
