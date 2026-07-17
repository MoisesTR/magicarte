import { supabase } from '../config/supabaseClient'

/** Stock balances are read from the ledger-backed, RLS-safe inventory view. */
export function fetchInventoryStock(businessId) {
  let query = supabase
    .from('inventory_stock')
    .select('*')
    .order('is_low_stock', { ascending: false })
    .order('name')
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

/** Most recent ledger entries for one business. Movements are append-only. */
export function fetchInventoryMovements(businessId, limit = 12) {
  let query = supabase
    .from('inventory_movements')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

export function createInventoryItem(item, businessId) {
  return supabase
    .from('inventory_items')
    .insert([{ ...item, business_id: businessId }])
    .select()
    .single()
}

export function updateInventoryItem(id, item) {
  return supabase.from('inventory_items').update(item).eq('id', id).select().single()
}

export function addInventoryMovement(movement, businessId) {
  return supabase
    .from('inventory_movements')
    .insert([{ ...movement, business_id: businessId }])
    .select()
    .single()
}
