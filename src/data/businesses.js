// Admin-only reads of business config that the public_businesses view hides
// (the revenue-split fields). RLS lets authenticated users read these.

import { getOrderChargeTotal, getPaymentSummary, isBillableOrder } from '../utils/orderPayments'
import { supabase } from '../config/supabaseClient'

/** Partner / revenue-split config for a business (name + partner's profit %). */
export function fetchPartnerConfig(businessId) {
  return supabase
    .from('businesses')
    .select('id, name, partner_name, partner_split_pct')
    .eq('id', businessId)
    .single()
}

const PAGE_SIZE = 500
const ACCOUNTING_ORDERS = 'id, business_id, status, total_amount, delivery_fee, material_cost, material_paid_by, partner_split_pct, partner_share_amount, your_share_amount'

// Independently page payments: an embedded relationship can silently hit its own cap.
async function readAccountingRows(table, columns, businessId) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from(table).select(columns).order('id', { ascending: true })
    if (businessId != null) query = query.eq('business_id', businessId)
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}

const sumMoney = (amounts) => getPaymentSummary(amounts.map(amount => ({ amount })), 0).paid
// Two-decimal money × two-decimal percentages can produce six decimal places;
// unlike cash receipts, agreed percentage shares must not round to cents per job.
const sumShares = (amounts) => amounts.reduce((sum, amount) => sum + Math.round(Number(amount) * 1_000_000), 0) / 1_000_000

// These are per-order agreed shares, not card-net cash: retain the SQL snapshot
// precedence and material reimbursement formula without its legacy paid filter.
function orderShares(order) {
  const total = Number(order.total_amount || 0)
  const material = Number(order.material_cost || 0)
  const partnerPct = Number(order.partner_split_pct || 0) / 100
  return {
    partner: order.partner_share_amount ?? ((total - material) * partnerPct + (order.material_paid_by === 'partner' ? material : 0)),
    ours: order.your_share_amount ?? ((total - material) * (1 - partnerPct) + (order.material_paid_by === 'us' ? material : 0)),
  }
}

async function fetchAccounting() {
  // The authenticated businesses table is membership/RLS-scoped, unlike its public view.
  const businesses = await readAccountingRows('businesses', 'id, name, partner_name, partner_split_pct')
  if (businesses.error) return businesses
  const data = []
  for (const business of businesses.data) {
    const [orders, payments] = await Promise.all([
      readAccountingRows('orders', ACCOUNTING_ORDERS, business.id),
      readAccountingRows('order_payments', 'id, order_id, business_id, amount', business.id),
    ])
    if (orders.error || payments.error) return { data: null, error: orders.error || payments.error }
    const paymentsByOrder = new Map()
    for (const payment of payments.data) {
      const key = String(payment.order_id)
      if (!paymentsByOrder.has(key)) paymentsByOrder.set(key, [])
      paymentsByOrder.get(key).push(payment)
    }
    const settled = orders.data.filter(order => isBillableOrder(order) &&
      getPaymentSummary(paymentsByOrder.get(String(order.id)), getOrderChargeTotal(order)).status === 'paid')
    const shares = settled.map(orderShares)
    data.push({ business, orders: orders.data, settled,
      collected: getPaymentSummary(payments.data, 0).paid,
      partner: sumShares(shares.map(share => share.partner)),
      ours: sumShares(shares.map(share => share.ours)),
    })
  }
  data.sort((a, b) => a.business.name.localeCompare(b.business.name))
  return { data, error: null }
}

/** Financial roll-up from actual receipts for every RLS-accessible business. */
export async function fetchBusinessEarnings() {
  const result = await fetchAccounting()
  if (result.error) return result
  return { data: result.data.map(({ business, orders, collected, partner, ours }) => ({
    business_id: business.id, name: business.name, orders_count: orders.length,
    collected, net_to_us_paid: ours, partner_share_paid: partner,
  })), error: null }
}

/** Fully paid, billable order shares owed to each configured business partner. */
export async function fetchPartnerSettlements() {
  const result = await fetchAccounting()
  if (result.error) return result
  return { data: result.data.filter(({ business, orders }) => Number(business.partner_split_pct) > 0 && orders.length > 0)
    .map(({ business, settled, partner, ours }) => ({
      business_id: business.id, name: business.name, partner_name: business.partner_name,
      settled_orders: settled.length,
      gross: sumMoney(settled.map(order => order.total_amount)),
      material_total: sumMoney(settled.map(order => order.material_cost)),
      partner_owed: partner, your_take: ours,
    })), error: null }
}
