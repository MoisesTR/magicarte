import { supabase } from '../config/supabaseClient'

const STOCK_COLUMNS = 'id,business_id,name,sku,item_type,unit,low_stock_threshold,unit_cost,supplier_name,notes,is_active,created_at,updated_at,current_stock,is_low_stock,inventory_kind,filament_color,filament_material,grams_per_spool,variant_color'

function isMissingColorColumn(error) {
  return ['42703', 'PGRST204'].includes(error?.code)
    && /\bcolor_(?:hex|transparent)\b/.test(error.message || '')
}

/** Retry only the read, once, while the additive color migration is pending. */
export async function fetchInventoryStock(businessId) {
  const read = (columns) => {
    let query = supabase
      .from('inventory_stock')
      .select(columns)
      .order('is_low_stock', { ascending: false })
      .order('name')
    if (businessId != null) query = query.eq('business_id', businessId)
    return query
  }
  const result = await read(`${STOCK_COLUMNS},color_hex,color_transparent`)
  return isMissingColorColumn(result.error) ? read(STOCK_COLUMNS) : result
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

/** Item-scoped history must filter before the limit, even for rarely used colors. */
export function fetchItemInventoryMovements(businessId, itemId, limit = 8) {
  return supabase
    .from('inventory_movements')
    .select('*')
    .eq('business_id', businessId)
    .eq('inventory_item_id', itemId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
}

export function createInventoryItem(item, businessId) {
  return supabase
    .from('inventory_items')
    .insert([{ ...item, business_id: businessId }])
    .select()
    .single()
}

export function updateInventoryItem(id, item, businessId) {
  return supabase
    .from('inventory_items')
    .update(item)
    .eq('id', id)
    .eq('business_id', businessId)
    .select()
    .single()
}

/** Permanently delete an item and its inventory movements. */
export function removeInventoryItem(id, businessId) {
  return supabase
    .rpc('remove_inventory_item', { p_item_id: id, p_business_id: businessId })
    .single()
}

export function addInventoryMovement(movement, businessId) {
  return supabase
    .from('inventory_movements')
    .insert([{ ...movement, business_id: businessId }])
    .select()
    .single()
}
