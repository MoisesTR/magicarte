-- Some machines (e.g. a laser engraver) are physically shared by more than
-- one business (Joyería Trigueros and Ema Accesorios, today). This lets a
-- machine be linked to several businesses so the monthly goal is one combined
-- target: the payment obligation is single, and net receipts from every
-- linked business count toward covering it — instead of forcing the machine
-- to live under one business only, or duplicating it per business with
-- separate (and wrong) sub-goals.
--
-- 100% additive: new join table + a backfill that gives every existing
-- machine its original single link, so nothing already saved changes
-- behavior. The only DROP is the old business_machines policy, replaced in
-- the same transaction.

begin;

create table public.business_machine_links (
  machine_id  uuid not null references public.business_machines(id) on delete cascade,
  business_id bigint not null references public.businesses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (machine_id, business_id)
);

create index business_machine_links_business_idx
  on public.business_machine_links (business_id);

alter table public.business_machine_links enable row level security;

grant select, insert, update, delete on public.business_machine_links to authenticated;

create policy "Users manage links for their businesses" on public.business_machine_links
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = business_machine_links.business_id
        and ub.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = business_machine_links.business_id
        and ub.user_id = (select auth.uid())
    )
  );

-- Every machine keeps the single link it already had.
insert into public.business_machine_links (machine_id, business_id)
select id, business_id from public.business_machines;

-- Visibility now flows through the links table (so a machine reaches every
-- business it's shared with), not just the creating business_id. business_id
-- itself is kept as the original/primary business for informational purposes
-- and to gate creation below.
drop policy "Users access own business machines" on public.business_machines;

create policy "Users access shared business machines" on public.business_machines
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.business_machine_links bml
      join public.user_businesses ub on ub.business_id = bml.business_id
      where bml.machine_id = business_machines.id
        and ub.user_id = (select auth.uid())
    )
  )
  with check (
    -- On insert, no link row exists yet: fall back to checking access to the
    -- machine's own business_id. On update, either path is fine.
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = business_machines.business_id
        and ub.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.business_machine_links bml
      join public.user_businesses ub on ub.business_id = bml.business_id
      where bml.machine_id = business_machines.id
        and ub.user_id = (select auth.uid())
    )
  );

commit;

-- Verification:
-- select bm.name, b.name as shared_with
-- from public.business_machines bm
-- join public.business_machine_links bml on bml.machine_id = bm.id
-- join public.businesses b on b.id = bml.business_id
-- order by bm.name, b.name;
