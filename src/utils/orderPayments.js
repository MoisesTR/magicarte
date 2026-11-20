export const COMMISSION_RATE = 0.0675
export const NON_BILLABLE_ORDER_STATUSES = Object.freeze(['backlog', 'canceled'])

export const isBillableOrder = (order) => !NON_BILLABLE_ORDER_STATUSES.includes(order.status)

/** Apply the same status rule at the query boundary and in local summaries. */
export const filterBillableOrders = (query) =>
  query.not('status', 'in', `(${NON_BILLABLE_ORDER_STATUSES.map(status => `"${status}"`).join(',')})`)

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// Decimal shifting preserves ties such as 10.075 when rounding to integer cents.
const toCents = (value) => {
  const [coefficient, exponent = '0'] = String(toNumber(value)).split('e')
  return Math.round(Number(`${coefficient}e${Number(exponent) + 2}`))
}

/** Product total excludes delivery in storage; customer charge includes both. */
export const getOrderChargeTotal = (order) =>
  (toCents(order.total_amount) + toCents(order.delivery_fee)) / 100

export function getPaymentSummary(payments, total) {
  const list = payments || []
  const paidCents = list.reduce((sum, payment) => sum + toCents(payment.amount), 0)
  const paidCardCents = list.filter(payment => payment.method === 'tarjeta')
    .reduce((sum, payment) => sum + toCents(payment.amount), 0)
  const paid = paidCents / 100
  const paidCard = paidCardCents / 100
  const commission = paidCard * COMMISSION_RATE
  const net = paid - commission
  const balance = Math.max(0, toCents(total) - paidCents) / 100
  const status = paidCents <= 0 ? 'unpaid' : balance === 0 ? 'paid' : 'partial'
  return { payments: list, paid, paidCard, commission, net, balance, status }
}

/** Gross receivables across billable orders; credits never cancel another order's debt. */
export function summarizeReceivables(orders) {
  const totals = { totalCharged: 0, totalPaid: 0, pending: 0, count: 0 }
  for (const order of orders || []) {
    if (!isBillableOrder(order)) continue
    const charge = getOrderChargeTotal(order)
    const { paid, balance } = getPaymentSummary(order.order_payments, charge)
    totals.totalCharged += toCents(charge)
    totals.totalPaid += toCents(paid)
    totals.pending += toCents(balance)
    totals.count += 1
  }
  return { ...totals, totalCharged: totals.totalCharged / 100, totalPaid: totals.totalPaid / 100, pending: totals.pending / 100 }
}
