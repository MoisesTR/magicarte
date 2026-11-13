alter table public.products
  add column if not exists calc_quote_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_calc_quote_id_fkey'
  ) then
    alter table public.products
      add constraint products_calc_quote_id_fkey
      foreign key (calc_quote_id) references public.calc_quotes(id)
      on delete set null;
  end if;
end $$;

create index if not exists products_calc_quote_id_idx
  on public.products (calc_quote_id);
