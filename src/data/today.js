import { supabase } from '../config/supabaseClient'

const ORDER_COLUMNS = 'id,order_number,customer_name,customer_phone,total_amount,delivery_fee,status,priority,estimated_delivery_date,order_date,created_at,completed_at,payment_status,follow_up_reason,follow_up_date,business_id,is_gift,delivery_method,order_payments(amount,method,paid_at)'
const STOCK_COLUMNS = 'id,business_id,name,is_low_stock,current_stock,unit,inventory_kind,filament_material,filament_color,color_hex,color_transparent,is_active'
const PAGE_SIZE = 500

// Explicit business filters supplement the authenticated client's existing RLS.
// Stable pagination avoids silently reporting totals from only the first API page.
async function readAll(table, columns, businessId) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns)
      .eq('business_id', businessId).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/** Read-only snapshot. Fail closed on missing scope or any partial read failure. */
export async function fetchTodayPanel(businessId) {
  if (businessId == null || businessId === '') throw new Error('A business id is required')
  const [orders, payments, inventory] = await Promise.all([
    readAll('orders', ORDER_COLUMNS, businessId),
    readAll('order_payments', 'id,order_id,amount,method,paid_at,business_id', businessId),
    readAll('inventory_stock', STOCK_COLUMNS, businessId),
  ])
  return { orders, payments, inventory }
}
