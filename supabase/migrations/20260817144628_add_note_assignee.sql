-- Notes can be assigned to a person (e.g. Moisés or Ivonne). Kept as a plain
-- nullable text column, not a fixed enum, so new people can be assigned
-- without a schema change; the admin UI offers a short picklist for now.

begin;

alter table public.business_notes
  add column assigned_to text check (assigned_to is null or btrim(assigned_to) <> '');

commit;
