// Data-access layer for order payments. Business scoping/stamping live here.

import { supabase } from '../config/supabaseClient'
import { TABLE } from '../utils/constants'

const PAYMENTS_SELECT =
  'id, order_id, amount, method, paid_at, note, created_at, ' +
  'orders(order_number, customer_name, total_amount, delivery_fee, client_id, clients(name))'

/** Payments (with order/client join) for a business — used by Finances. */
export function fetchPaymentsForBusiness(businessId) {
  let query = supabase
    .from(TABLE.ORDER_PAYMENTS)
    .select(PAYMENTS_SELECT)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

/** Add a payment to an order, stamping the owning business. Returns the row. */
export function addPayment(payment, businessId) {
  return supabase
    .from(TABLE.ORDER_PAYMENTS)
    .insert([{ ...payment, business_id: businessId }])
    .select()
}

/** Update a payment's editable fields. */
export function updatePayment(id, fields) {
  return supabase.from(TABLE.ORDER_PAYMENTS).update(fields).eq('id', id)
}

/** Delete a payment. */
export function deletePayment(id) {
  return supabase.from(TABLE.ORDER_PAYMENTS).delete().eq('id', id)
}
