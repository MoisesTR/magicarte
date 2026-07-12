-- ============================================================================
-- Harden the multi-business reporting views and trigger-only helper functions.
-- Run after finalize_multi_business.sql.
-- ============================================================================

begin;

-- Financial views must evaluate underlying RLS as the calling user.
alter view public.business_earnings set (security_invoker = true);
alter view public.partner_settlements set (security_invoker = true);

-- These SECURITY DEFINER functions are invoked only by triggers. They must not
-- be exposed as RPC endpoints to anonymous or authenticated API callers.
revoke execute on function public.enforce_order_client_business() from public, anon, authenticated;
revoke execute on function public.enforce_order_payment_business() from public, anon, authenticated;
revoke execute on function public.enforce_order_item_business() from public, anon, authenticated;

commit;
