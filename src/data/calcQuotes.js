import { supabase } from '../config/supabaseClient'

const QUOTE_COLUMNS = 'id, name, client_name, quantity, unit_price, total_price, unit_cost, total_cost, template_id, state'

// Every lookup requires a business, even when RLS also enforces membership.
function requireBusiness(businessId) {
  if (!businessId) throw new Error('A business is required to load a quote')
}

export function fetchCalcQuote(id, businessId) {
  requireBusiness(businessId)
  return supabase.from('calc_quotes').select(QUOTE_COLUMNS)
    .eq('id', id).eq('business_id', businessId).maybeSingle()
}

export function fetchOrderForQuote(quoteId, businessId) {
  requireBusiness(businessId)
  return supabase.from('orders').select('id, order_number, status')
    .eq('business_id', businessId).eq('calculator_data->>quoteId', quoteId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
}

export function fetchProductForQuote(quoteId, businessId) {
  requireBusiness(businessId)
  return supabase.from('products').select('id, name, is_visible')
    .eq('business_id', businessId).eq('calc_quote_id', quoteId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
}

/** Cost picker reads only the active business's saved quote summaries. */
export function fetchCostQuotes(businessId) {
  requireBusiness(businessId)
  return supabase.from('calc_quotes').select('id, name, summary, updated_at')
    .eq('business_id', businessId).order('updated_at', { ascending: false })
}

/** One private, scoped join for every product used by the loaded orders. */
export function fetchProductCostQuotes(productIds, businessId) {
  requireBusiness(businessId)
  const ids = [...new Set(productIds.filter(Boolean))]
  if (!ids.length) return Promise.resolve({ data: [], error: null })
  return supabase.from('products')
    .select('id, calc_quote_id, cost_quote:calc_quotes!products_calc_quote_id_fkey(id, summary)')
    .eq('business_id', businessId).eq('cost_quote.business_id', businessId).in('id', ids)
}
