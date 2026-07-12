// Admin-only reads of business config that the public_businesses view hides
// (the revenue-split fields). RLS lets authenticated users read these.

import { supabase } from '../config/supabaseClient'

/** Partner / revenue-split config for a business (name + partner's profit %). */
export function fetchPartnerConfig(businessId) {
  return supabase
    .from('businesses')
    .select('id, name, partner_name, partner_split_pct')
    .eq('id', businessId)
    .single()
}

/** Financial roll-up for every business the signed-in user may access. */
export function fetchBusinessEarnings() {
  return supabase.from('business_earnings').select('*').order('name')
}

/** Amounts still owed to each configured business partner. */
export function fetchPartnerSettlements() {
  return supabase.from('partner_settlements').select('*').order('name')
}
