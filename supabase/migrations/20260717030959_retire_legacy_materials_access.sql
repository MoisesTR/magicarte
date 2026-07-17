-- inventory_items now owns all in-app inventory data. Keep the former
-- materials table only as a preserved source record, not as a second and
-- unscoped write path.

begin;

drop policy if exists "authenticated users can delete materials" on public.materials;
drop policy if exists "authenticated users can insert materials" on public.materials;
drop policy if exists "authenticated users can read materials" on public.materials;
drop policy if exists "authenticated users can update materials" on public.materials;

revoke all on table public.materials from anon, authenticated;

commit;
