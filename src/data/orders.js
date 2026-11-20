// Data-access layer for orders + order items. Business scoping and stamping
// live here so pages don't touch supabase.from('orders') directly.

import { supabase } from '../config/supabaseClient'
import { fetchProductOptions, fetchOrderItemDesigns, insertOrderItemsWithDesigns } from './productPresentations'
import { activeOptions } from '../utils/productPresentations'
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

/** Shared editor enrichment: never drop saved presentation/design snapshots. */
async function enrichOrderRows(result, businessId) {
  if (result.error || !result.data?.length) return result
  const ids = result.data.flatMap(order => order.order_items.map(item => item.id))
  const designs = await fetchOrderItemDesigns(ids, businessId)
  if (designs.error) return { ...result, error: designs.error }
  if (designs.available === false) return result
  return { ...result, data: result.data.map(order => ({ ...order, order_items: order.order_items.map(item => ({ ...item, order_item_designs: (designs.data || []).filter(row => row.order_item_id === item.id) })) })) }
}

/** Full orders list for a business (with items, payments, client). */
export async function fetchOrdersForBusiness(businessId) {
  let query = supabase.from(TABLE.ORDERS).select(ORDER_SELECT).order('created_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return enrichOrderRows(await query, businessId)
}

/** Full editor detail for deep links beyond the capped list; scope is mandatory. */
export async function fetchOrderForBusiness(orderId, businessId) {
  if (orderId == null || orderId === '' || businessId == null || businessId === '') {
    return { data: null, error: new Error('Order and business ids are required') }
  }
  const result = await supabase.from(TABLE.ORDERS).select(ORDER_SELECT)
    .eq('id', orderId).eq('business_id', businessId).maybeSingle()
  if (result.error || !result.data) return result
  if (String(result.data.id) !== String(orderId) || String(result.data.business_id) !== String(businessId)) {
    return { ...result, data: null, error: new Error('Order scope mismatch') }
  }
  const enriched = await enrichOrderRows({ ...result, data: [result.data] }, businessId)
  return { ...enriched, data: enriched.error ? null : enriched.data[0] }
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

export function insertOrderItems(items, businessId) {
  return insertOrderItemsWithDesigns(items, businessId)
}

/** Lightweight product picker list for a business. */
export async function fetchOrderProducts(businessId) {
  let query = supabase.from(TABLE.PRODUCT).select('id, name, price').order('name')
  if (businessId != null) query = query.eq('business_id', businessId)
  const result = await query
  if (result.error) return result
  const options = await fetchProductOptions(null, businessId)
  if (options.error) return { ...result, error: options.error }
  if (!options.available) return result
  return { ...result, data: (result.data || []).map(product => ({ ...product, presentations: activeOptions(options.presentations.filter(row => row.product_id === product.id)), designs: activeOptions(options.designs.filter(row => row.product_id === product.id)) })) }
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
