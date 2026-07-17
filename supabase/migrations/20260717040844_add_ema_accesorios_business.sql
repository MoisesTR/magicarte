-- Ema Accesorios is an independent operating business. It shares the app's
-- business-scoped modules (including inventory) but never shares stock, orders
-- clients, products, or finances with the other businesses.

begin;

insert into public.businesses (
  slug,
  name,
  primary_color,
  secondary_color,
  accent_color,
  background_color,
  text_color,
  theme,
  font_primary,
  font_secondary,
  partner_name,
  partner_split_pct,
  is_active,
  sort_order
)
values (
  'ema-accesorios',
  'Ema Accesorios',
  '#C86B85',
  '#FCE7F3',
  '#7C3AED',
  '#FFF8FB',
  '#3B1F2B',
  'light',
  'Poppins',
  'Montserrat',
  null,
  0,
  true,
  3
)
on conflict (slug) do nothing;

-- The current access model gives every existing operator access to every
-- active business. New, restricted staff can be granted only this business
-- later through user_businesses.
insert into public.user_businesses (user_id, business_id)
select u.id, b.id
from auth.users u
join public.businesses b on b.slug = 'ema-accesorios'
on conflict do nothing;

commit;

-- Verification:
-- select b.slug, b.name, count(ub.user_id) as operator_count
-- from public.businesses b
-- left join public.user_businesses ub on ub.business_id = b.id
-- where b.slug = 'ema-accesorios'
-- group by b.slug, b.name;
