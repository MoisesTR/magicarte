// Data-access layer for orders + order items. Business scoping and stamping
// live here so pages don't touch supabase.from('orders') directly.

import { supabase } from '../config/supabaseClient'
import { TABLE } from '../utils/constants'

const ORDER_SELECT = `
  *,
  order_items (
    *,
    products (name, image_url, width, length)
  ),
  order_payments (id, order_id, amount, method, paid_at, note, created_at),
  clients (id, name)
`

/** Full orders list for a business (with items, payments, client). */
export function fetchOrdersForBusiness(businessId) {
  let query = supabase.from(TABLE.ORDERS).select(ORDER_SELECT).order('created_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

/** Create an order, stamping the owning business. Returns inserted row(s). */
export function createOrder(orderData, businessId) {
  return supabase.from(TABLE.ORDERS).insert([{ ...orderData, business_id: businessId }]).select()
}

/** Update an order's fields (business_id is left unchanged). */
export function updateOrder(id, fields) {
  return supabase.from(TABLE.ORDERS).update(fields).eq('id', id)
}

/** Delete an order (cascades to its items/payments via FK). */
export function deleteOrder(id) {
  return supabase.from(TABLE.ORDERS).delete().eq('id', id)
}

/** Replace an order's line items: delete existing then insert the new set. */
export function deleteOrderItems(orderId) {
  return supabase.from(TABLE.ORDER_ITEMS).delete().eq('order_id', orderId)
}

export function insertOrderItems(items) {
  return supabase.from(TABLE.ORDER_ITEMS).insert(items)
}

/** Lightweight product picker list for a business. */
export function fetchOrderProducts(businessId) {
  let query = supabase.from(TABLE.PRODUCT).select('id, name, price').order('name')
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

/** Orders summary for Finances (excludes canceled), scoped to a business. */
export function fetchFinanceOrders(businessId) {
  let query = supabase
    .from(TABLE.ORDERS)
    .select(
      'id, order_number, customer_name, total_amount, delivery_fee, order_date, status, is_gift, client_id, order_payments(amount, method, paid_at)',
    )
    .not('status', 'in', '("canceled")')
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}
