-- Machine goals: each business can register the machines it is still paying off
-- (laser engraver, 3D printer, jewelry equipment). A machine stores the amount
-- that must be covered every billing cycle and the day that cycle rolls over,
-- so Finanzas can show how much of the current period is already covered and
-- how much is still missing.
--
-- Scoped and secured the same way as business_notes: any user with access to
-- the business can read/write its machines.

begin;

create table public.business_machines (
  id             uuid primary key default gen_random_uuid(),
  business_id    bigint not null references public.businesses(id) on delete cascade,
  name           text not null check (btrim(name) <> ''),
  monthly_amount numeric(12, 2) not null check (monthly_amount >= 0),
  -- Day the billing cycle rolls over: 4 means "the 4th through the 3rd".
  -- Capped at 28 so every month actually has the day and no cycle silently
  -- shifts in February.
  cycle_day      smallint not null default 1 check (cycle_day between 1 and 28),
  is_active      boolean not null default true,
  notes          text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index business_machines_business_active_name_idx
  on public.business_machines (business_id, is_active desc, name);

create or replace function public.set_business_machines_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger business_machines_set_updated_at
before update on public.business_machines
for each row execute function public.set_business_machines_updated_at();

alter table public.business_machines enable row level security;

grant select, insert, update, delete on public.business_machines to authenticated;

create policy "Users access own business machines" on public.business_machines
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = business_machines.business_id
        and ub.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = business_machines.business_id
        and ub.user_id = (select auth.uid())
    )
  );

revoke execute on function public.set_business_machines_updated_at() from public, anon, authenticated;

commit;

-- Verification:
-- select name, monthly_amount, cycle_day, is_active from public.business_machines
-- where business_id = (select id from public.businesses where slug = 'magicarte')
-- order by is_active desc, name;
