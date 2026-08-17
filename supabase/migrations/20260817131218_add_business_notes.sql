-- Per-business notes board: freeform ideas, pending features, things to
-- remove, and general reminders. Scoped and secured the same way as
-- inventory_items (any user with access to the business can read/write).

begin;

create table public.business_notes (
  id          uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete cascade,
  title       text not null check (btrim(title) <> ''),
  body        text,
  category    text not null default 'idea'
                check (category in ('idea', 'todo', 'in_progress', 'remove', 'general')),
  is_pinned   boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index business_notes_business_pinned_updated_idx
  on public.business_notes (business_id, is_pinned desc, updated_at desc);

create or replace function public.set_business_notes_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger business_notes_set_updated_at
before update on public.business_notes
for each row execute function public.set_business_notes_updated_at();

alter table public.business_notes enable row level security;

grant select, insert, update, delete on public.business_notes to authenticated;

create policy "Users access own business notes" on public.business_notes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = business_notes.business_id
        and ub.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.user_businesses ub
      where ub.business_id = business_notes.business_id
        and ub.user_id = (select auth.uid())
    )
  );

revoke execute on function public.set_business_notes_updated_at() from public, anon, authenticated;

commit;

-- Verification:
-- select title, category, is_pinned, updated_at from public.business_notes
-- where business_id = (select id from public.businesses where slug = 'magicarte')
-- order by is_pinned desc, updated_at desc;
