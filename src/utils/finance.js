// Shared finance primitives so the dashboard and the machine goals always agree
// on what "net" means and on which calendar day a payment belongs to.

export const COMMISSION_RATE = 0.0675
export const TZ = 'America/Managua'

/** Today in Nicaragua as 'YYYY-MM-DD'. */
export function nicaraguaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/**
 * The Nicaragua calendar day ('YYYY-MM-DD') a payment belongs to.
 * `paid_at` is stored as a plain date, so it is returned untouched — parsing it
 * as a Date would land on UTC midnight and shift it a day back in Managua.
 */
export function nicaraguaDay(value) {
  const raw = String(value || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return new Date(raw).toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Gross, card total, commission and net for a list of payments. */
export function summarisePayments(payments) {
  const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const paidCard = payments
    .filter((p) => p.method === 'tarjeta')
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const commission = paidCard * COMMISSION_RATE
  return { paid, paidCard, commission, net: paid - commission }
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
