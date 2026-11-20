// Shared finance primitives so the dashboard and the machine goals always agree
// on what "net" means and on which calendar day a payment belongs to.

import { getPaymentSummary } from './orderPayments.js'
export { COMMISSION_RATE } from './orderPayments.js'
export const TZ = 'America/Managua'

/** Today in Nicaragua as 'YYYY-MM-DD'. */
export function nicaraguaToday(now = new Date()) {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Date-only arithmetic, independent of the browser's timezone. */
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10)
}

/** Managua calendar week, inclusive Monday through Sunday. */
export function nicaraguaWeek(now = new Date()) {
  const today = nicaraguaToday(now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const weekStart = addDays(today, -((weekday + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  return { today, weekStart, weekEnd: days[6], days }
}

/**
 * The Nicaragua calendar day ('YYYY-MM-DD') a payment belongs to.
 * `paid_at` is stored as a plain date, so it is returned untouched — parsing it
 * as a Date would land on UTC midnight and shift it a day back in Managua.
 */
export function nicaraguaDay(value) {
  const raw = String(value || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return nicaraguaToday(raw)
}

// Cash flow uses date-filtered receipts (including non-billable orders), not order debt.
export function summarisePayments(payments) {
  const { paid, paidCard, commission, net } = getPaymentSummary(payments, 0)
  return { paid, paidCard, commission, net }
}

/** Whole days from one 'YYYY-MM-DD' to another (b - a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

export const moneyNIO = (value) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
