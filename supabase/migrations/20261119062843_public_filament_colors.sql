-- Deliberately public, cost-free projection; the private stock view stays private.
begin;

create or replace function public.public_filament_colors(p_slug text)
returns table (
  business_name text,
  primary_color text,
  filament_material text,
  filament_color text,
  color_hex text,
  color_transparent boolean,
  availability text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.name::text,
    b.primary_color::text,
    s.filament_material::text,
    s.filament_color::text,
    s.color_hex::text,
    s.color_transparent,
    case
      when s.current_stock <= s.low_stock_threshold or s.current_stock < 250
        then 'poco'::text
      else 'disponible'::text
    end
  from public.inventory_stock s
  join public.businesses b on b.id = s.business_id
  where b.slug = p_slug
    and s.is_active
    and s.inventory_kind = 'filament'
    and s.current_stock > 0;
$$;

revoke all on function public.public_filament_colors(text) from public;
grant execute on function public.public_filament_colors(text) to anon, authenticated;
comment on function public.public_filament_colors(text) is
  'Public, cost-free projection of active available filament colors. Never exposes costs, grams, identifiers or notes.';

commit;
