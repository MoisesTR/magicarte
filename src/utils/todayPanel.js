import { TZ } from './finance.js'
import { getOrderChargeTotal, getPaymentSummary } from './orderPayments.js'

export const OPEN_STATUSES = ['backlog', 'pending', 'confirmed', 'in_progress', 'ready']
export const STATUS_LABELS = {
  backlog: 'Backlog', pending: 'Pendiente', confirmed: 'Confirmado',
  in_progress: 'En Proceso', ready: 'Listo para Entregar', completed: 'Completado', canceled: 'Cancelado',
}
export const FOLLOW_UP_LABELS = {
  deposit_request: 'Pedir anticipo 50%', confirm_delivery_details: 'Confirmar datos de entrega',
  notify_ready: 'Avisar que está listo', waiting_customer_response: 'Cliente quedó en responder',
  delivery_received_check: 'Confirmar si llegó bien',
}
export const PAYMENT_METHOD_LABELS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', not_specified: 'Sin especificar' }

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** SQL dates stay calendar dates; timestamps are interpreted in Managua, never host time. */
export function dateKey(value) {
  if (!value) return null
  const raw = String(value)
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const instant = new Date(dateOnly ? `${raw}T12:00:00Z` : value)
  if (!Number.isFinite(instant.getTime())) return null
  if (dateOnly) return instant.toISOString().slice(0, 10) === raw ? raw : null
  const parts = Object.fromEntries(dayFormatter.formatToParts(instant).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function addDays(day, count) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

/** Calendar context and greeting for one injectable instant. */
export function getManaguaContext(now = new Date()) {
  const today = dateKey(now)
  const instant = new Date(now)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(instant))
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  return {
    today, hour, tomorrow: addDays(today, 1), weekEnd: addDays(today, (7 - weekday) % 7),
    greeting: hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches',
    dateLabel: new Intl.DateTimeFormat('es-NI', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(instant),
  }
}

/** Visual/DOM order, with exactly one emphasized section and no duplicates. */
export function getSectionOrder(now = new Date()) {
  const { hour } = getManaguaContext(now)
  const sections = ['deliveries', 'receivables', 'followUps', 'production', 'lowStock', 'dayClose']
  const first = hour < 12 ? 'deliveries' : hour < 18 ? 'followUps' : 'dayClose'
  return [first, ...sections.filter(section => section !== first)]
}

const isOpen = order => !['completed', 'canceled'].includes(order.status)
const compareDate = field => (a, b) => (dateKey(a[field]) || '9999').localeCompare(dateKey(b[field]) || '9999') || String(a.id).localeCompare(String(b.id))

/** Exclusive delivery buckets for open orders; null dates and next-week dates stay out. */
export function selectDeliveries(orders, now = new Date()) {
  const { today, tomorrow, weekEnd } = getManaguaContext(now)
  const groups = { overdue: [], today: [], tomorrow: [], week: [] }
  for (const order of [...orders].filter(isOpen).sort(compareDate('estimated_delivery_date'))) {
    const day = dateKey(order.estimated_delivery_date)
    if (!day) continue
    if (day < today) groups.overdue.push(order)
    else if (day === today) groups.today.push(order)
    else if (day === tomorrow) groups.tomorrow.push(order)
    else if (day <= weekEnd) groups.week.push(order)
  }
  return groups
}

/** New row objects with shared gross payment math; undated orders sort last. */
export function selectReceivables(orders) {
  return orders.filter(isOpen).map(order => {
    const chargeTotal = getOrderChargeTotal(order)
    const { paid, balance } = getPaymentSummary(order.order_payments, chargeTotal)
    return { ...order, chargeTotal, paid, balance, withoutDeposit: paid === 0 && !['pending', 'backlog'].includes(order.status) }
  }).filter(order => order.balance > 0).sort(compareDate('estimated_delivery_date'))
}

/** Includes completed post-delivery reminders; follows the explicitly scheduled follow-up date. */
export function selectFollowUps(orders, now = new Date()) {
  const { today } = getManaguaContext(now)
  return {
    orders: orders.filter(order => dateKey(order.follow_up_date) && dateKey(order.follow_up_date) <= today).sort(compareDate('follow_up_date')),
    backlogCount: orders.filter(order => order.status === 'backlog').length,
  }
}

export function selectProduction(orders) {
  return Object.fromEntries(OPEN_STATUSES.map(status => [status, orders.filter(order => order.status === status).length]))
}

export function selectLowStock(items) {
  return items.filter(item => item.is_active === true && item.is_low_stock === true)
}

/** Gross cash received (not net of card commission), created charges, completed count. */
export function selectDayClose(orders, payments, now = new Date()) {
  const { today } = getManaguaContext(now)
  const received = payments.filter(payment => dateKey(payment.paid_at) === today)
  const paymentsByMethod = {}
  for (const payment of received) {
    const method = payment.method || 'not_specified'
    paymentsByMethod[method] = (paymentsByMethod[method] || 0) + getPaymentSummary([payment], 0).paid
  }
  const created = orders.filter(order => dateKey(order.created_at) === today)
  return {
    paymentsTotal: getPaymentSummary(received, 0).paid,
    paymentsByMethod, createdCount: created.length,
    createdTotal: created.reduce((sum, order) => sum + getOrderChargeTotal(order), 0),
    completedCount: orders.filter(order => order.status === 'completed' && dateKey(order.completed_at) === today).length,
  }
}

export function selectKPIs(orders, now = new Date()) {
  const groups = selectDeliveries(orders, now)
  const { today } = getManaguaContext(now)
  return {
    deliveriesToday: groups.today.length, overdue: groups.overdue.length,
    receivableTotal: selectReceivables(orders).reduce((sum, order) => sum + order.balance, 0),
    followUpsToday: orders.filter(order => dateKey(order.follow_up_date) === today).length,
  }
}
