-- ============================================================================
-- Reconcile multi-business access control after applying the base migration to
-- a database that already had the scoped policies from user_access_control.sql.
--
-- Safe to run after user_access_control.sql. It seeds missing memberships and
-- removes the broad policies created by multi_business.sql; scoped policies
-- remain defined by user_access_control.sql.
-- ============================================================================

begin;

insert into public.user_businesses (user_id, business_id)
select u.id, b.id
from auth.users u
cross join public.businesses b
on conflict do nothing;

drop policy if exists "businesses_all_authenticated" on public.businesses;
drop policy if exists "product_3d_details_all_authenticated" on public.product_3d_details;
drop policy if exists "product_engraving_details_all_authenticated" on public.product_engraving_details;

commit;
