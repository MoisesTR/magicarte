// Extracted from Orders so daily balances and the order editor share one formula.
import { COMMISSION_RATE } from './finance.js'

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const getOrderChargeTotal = (order) => toNumber(order.total_amount) + toNumber(order.delivery_fee)

export function getPaymentSummary(payments, total) {
  const list = payments || []
  const paid = list.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const paidCard = list.filter(payment => payment.method === 'tarjeta').reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const commission = paidCard * COMMISSION_RATE
  const net = paid - commission
  const balance = Math.max(0, toNumber(total) - paid)
  let status = 'unpaid'
  if (paid > 0.009 && paid + 0.009 >= toNumber(total)) status = 'paid'
  else if (paid > 0.009) status = 'partial'
  return { payments: list, paid, paidCard, commission, net, balance, status }
}
