export { aiTagChip } from './whatsappTags.js'
import { newOrderForm } from './quoteForms.js'
import { addDays, nicaraguaToday } from './finance.js'
export { addDays } from './finance.js'

export const STATUS_LABELS = {
  to_quote: 'Por cotizar',
  sent: 'Cotización enviada',
  follow_up: 'Dar seguimiento',
  won: 'Ganada',
  lost: 'Perdida',
  done: 'Cerrado',
}
export const KIND_LABELS = {
  quote: 'Cotización',
  follow_up: 'Seguimiento',
  payment: 'Pago pendiente',
  order: 'Pedido',
  other: 'Otro',
}
export const OPEN_STATUSES = ['to_quote', 'sent', 'follow_up']

export function isNotCustomer(thread) {
  return (
    thread.status === 'done' &&
    typeof thread.lost_reason === 'string' &&
    thread.lost_reason.startsWith('No es cliente')
  )
}

const DAY = 86400000
const normalize = (value) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('es-NI')
const plain = (value) =>
  normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Canonical phone digits; only Nicaragua's exact 505 + eight-digit form is local. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null
  return digits.length === 11 && digits.startsWith('505')
    ? digits.slice(3)
    : digits
}

/** Explicit links take precedence; inferred matches require a phone, tenant and date window. */
export function matchThreadsToOrders(threads, orders) {
  const matches = new Map()
  const sameBusiness = (thread, order) =>
    thread.business_id != null &&
    thread.business_id !== '' &&
    order.business_id != null &&
    String(thread.business_id) === String(order.business_id)
  for (const thread of threads) {
    if (String(thread.chat_key || '').startsWith('name:')) continue
    if (thread.order_id) {
      const linked = orders.find(
        (order) =>
          String(order.id) === String(thread.order_id) &&
          sameBusiness(thread, order)
      )
      if (linked) matches.set(thread.id, linked)
      continue
    }
    const phone = normalizePhone(thread.chat_key)
    const requestedAt = timestampAt(thread.requested_at || thread.created_at)
    if (!phone || requestedAt === null) continue
    let latest = null,
      latestAt = -Infinity
    for (const order of orders) {
      const createdAt = timestampAt(order.created_at)
      if (
        sameBusiness(thread, order) &&
        order.status !== 'canceled' &&
        normalizePhone(order.customer_phone) === phone &&
        createdAt !== null &&
        createdAt >= requestedAt - 2 * DAY &&
        createdAt > latestAt
      ) {
        latest = order
        latestAt = createdAt
      }
    }
    if (latest) matches.set(thread.id, latest)
  }
  return matches
}

/** Calendar arithmetic is date-only; timestamps are always interpreted in Managua. */
export function managuaDay(now = new Date()) {
  return nicaraguaToday(now)
}
const dayDifference = (a, b) =>
  Math.round(
    (Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY
  )
export function hoursAgo(at, now = new Date()) {
  const elapsed = new Date(now) - new Date(at)
  return at && Number.isFinite(elapsed)
    ? Math.max(0, Math.floor(elapsed / 3600000))
    : null
}

function timestampAt(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null
  if (typeof value === 'string') {
    const date = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/)
    if (date && !validDate(Number(date[1]), Number(date[2]), Number(date[3])))
      return null
  }
  const at = new Date(value).getTime()
  return Number.isFinite(at) ? at : null
}

/** Latest valid activity as epoch milliseconds, or null when no timestamp exists. */
export function threadActivityAt(thread) {
  const timestamps = [
    thread.last_customer_message_at,
    thread.last_our_message_at,
    thread.requested_at,
    thread.last_reviewed_at,
    thread.updated_at,
    thread.created_at,
  ]
    .map(timestampAt)
    .filter((at) => at !== null)
  return timestamps.length ? Math.max(...timestamps) : null
}

function dueCalendarDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return validDate(year, month, day)
  }
  const at = timestampAt(value)
  return at === null ? null : managuaDay(at)
}

/**
 * Managua calendar ranges; due-today/overdue rows always pass. All preserves identity.
 * Confirmed chats without a registered order always pass: the safety net must
 * stay visible until the owner registers the order, whatever its delivery date.
 */
export function filterThreadsByDate(threads, range, now = new Date()) {
  if (range !== 'today' && range !== 'week') return threads
  const today = managuaDay(now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const monday = addDays(today, -((weekday + 6) % 7))
  return threads.filter((thread) => {
    if (isConfirmedThread(thread)) return true
    if (
      [thread.promised_date, thread.follow_up_date].some((value) => {
        const day = dueCalendarDay(value)
        return day !== null && day <= today
      })
    )
      return true
    const at = threadActivityAt(thread)
    if (at === null) return false
    const day = managuaDay(at)
    return range === 'today'
      ? day === today
      : day >= monday && at <= new Date(now).getTime()
  })
}

const DATE_RANGES = ['today', 'week', 'all']

export function loadFeedDateRange(businessId, storage) {
  if (businessId) {
    try {
      const range = (storage || globalThis.localStorage).getItem(
        `whatsapp.feedDateRange.${businessId}`
      )
      if (DATE_RANGES.includes(range)) return range
    } catch {
      /* Private browsing may deny storage; show all conversations by default. */
    }
  }
  return 'all'
}

export function saveFeedDateRange(businessId, range, storage) {
  if (!businessId || !DATE_RANGES.includes(range)) return
  try {
    ;(storage || globalThis.localStorage).setItem(
      `whatsapp.feedDateRange.${businessId}`,
      range
    )
  } catch {
    /* The selected range still works for this session. */
  }
}

const promiseDue = (thread) =>
  thread.ai_tag == null || thread.ai_tag === 'promised'
    ? dueCalendarDay(thread.promised_date)
    : null
const isDue = (date, today) => Boolean(date && date <= today)
/** Confirmed chat agreements belong only to the delivery safety net, never response tasks. */
export function isConfirmedThread(thread) {
  return (
    OPEN_STATUSES.includes(thread.status) &&
    (Number(thread.paid_amount) > 0 || Boolean(thread.delivery_date))
  )
}

/** Seven exclusive Monday-start delivery buckets; original rows are never mutated. */
export function groupDeliveries(threads, now = new Date()) {
  const today = managuaDay(now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const endOfWeek = addDays(today, 6 - ((weekday + 6) % 7))
  const groups = [
    ['overdue', 'Atrasadas'],
    ['today', 'Hoy'],
    ['tomorrow', 'Mañana'],
    ['week', 'Esta semana'],
    ['nextWeek', 'Próxima semana'],
    ['later', 'Más adelante'],
    ['undated', 'Sin fecha'],
  ].map(([key, title]) => ({ key, title, threads: [] }))
  for (const thread of threads.filter(isConfirmedThread)) {
    const date = dueCalendarDay(thread.delivery_date)
    const index = !date
      ? 6
      : date < today
        ? 0
        : date === today
          ? 1
          : date === addDays(today, 1)
            ? 2
            : date <= endOfWeek
              ? 3
              : date <= addDays(endOfWeek, 7)
                ? 4
                : 5
    groups[index].threads.push(thread)
  }
  for (const group of groups)
    group.threads.sort((a, b) =>
      (a.delivery_date || '').localeCompare(b.delivery_date || '')
    )
  return groups
}

export function deliveryDateLabel(date, now = new Date()) {
  if (!date) return 'Sin fecha'
  const today = managuaDay(now)
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  const weekday = new Intl.DateTimeFormat('es-NI', {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(/\.$/, '')
  return `${weekday} ${date.slice(8, 10)}/${date.slice(5, 7)}`
}

const money = (amount) =>
  Number(amount).toLocaleString('es-NI', {
    minimumFractionDigits: Number.isInteger(Number(amount)) ? 0 : 2,
    maximumFractionDigits: 2,
  })

/** Payment chips use cents; the half-deposit tolerance is inclusive of C$1. */
export function paymentChip(thread) {
  const paid = Math.round(Number(thread.paid_amount || 0) * 100)
  const quoted =
    thread.quoted_amount == null
      ? null
      : Math.round(Number(thread.quoted_amount) * 100)
  if (!paid) return { text: 'Sin pago registrado', tone: 'neutral' }
  if (quoted !== null && paid >= quoted)
    return { text: 'Pagado', tone: 'success' }
  if (quoted === null)
    return { text: `Pagó C$${money(paid / 100)}`, tone: 'warning' }
  const balance = money((quoted - paid) / 100)
  return {
    text:
      Math.abs(paid - quoted / 2) <= 100
        ? `Pagó la mitad · falta C$${balance}`
        : `Anticipo C$${money(paid / 100)} · falta C$${balance}`,
    tone: 'warning',
  }
}

/** Validate a positive addition and keep the persisted numeric(12,2) in range. */
export function addThreadPayment(existing, amount) {
  const value = Number(amount),
    current = Number(existing ?? 0)
  const cents = Math.round(value * 100),
    previous = Math.round(current * 100)
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.abs(value * 100 - cents) > 0.00001 ||
    !Number.isFinite(current) ||
    current < 0 ||
    previous + cents > 999999999999
  )
    throw new Error(
      'Indique un monto de pago positivo con hasta dos decimales.'
    )
  return (previous + cents) / 100
}

export function feedKPIs(threads, now = new Date()) {
  const groups = groupThreads(threads, now)
  return Object.fromEntries(
    ['confirmed', 'today', 'unanswered', 'toQuote', 'payments'].map((key) => {
      const group = groups.find((item) => item.key === key)
      return [key, group.count ?? group.threads.length]
    })
  )
}

// Tags meaning the next move is the customer's, whatever the stored status says.
const WAITING_TAGS = ['new_lead', 'customer_deciding', 'follow_up']

/** Exclusive priority grouping: confirmed agreements and payment tasks precede replies. */
export function groupThreads(threads, now = new Date()) {
  const today = managuaDay(now)
  const deliveries = groupDeliveries(threads, now)
  const confirmed = {
    key: 'confirmed',
    title: 'Confirmados',
    deliveryGroups: deliveries,
    threads: deliveries.flatMap((group) => group.threads),
    count: deliveries.reduce((count, group) => count + group.threads.length, 0),
    urgentCount: deliveries
      .slice(0, 2)
      .reduce((count, group) => count + group.threads.length, 0),
  }
  const groups = [
    ['today', 'Responder hoy'],
    ['unanswered', 'Esperando tu respuesta'],
    ['toQuote', 'Por cotizar'],
    ['payments', 'Pagos pendientes'],
    ['waiting', 'Esperando al cliente'],
    ['inOrders', 'En Pedidos (30 días)'],
    ['closed', 'Descartados (30 días)'],
  ].map(([key, title]) => ({ key, title, threads: [] }))
  for (const thread of threads) {
    if (isConfirmedThread(thread)) continue
    let index,
      timeHint = ''
    if (!OPEN_STATUSES.includes(thread.status)) {
      if (
        !thread.status_changed_at ||
        new Date(thread.status_changed_at) < new Date(now) - 30 * DAY
      )
        continue
      // Won chats already live in Pedidos; lost and non-customer chats are discarded.
      index = thread.status === 'won' || thread.order_id ? 5 : 6
    } else if (thread.kind === 'payment' || thread.ai_tag === 'awaiting_payment') {
      index = 3
      if (thread.follow_up_date <= today) timeHint = rowChip(thread, now).text
    } else if (thread.awaiting_reply) {
      index = 1
      const hours = hoursAgo(thread.last_customer_message_at, now)
      timeHint =
        hours == null ? 'Sin respuesta pendiente' : `Escribió hace ${hours} h`
    } else if (
      isDue(promiseDue(thread), today) ||
      ['promised', 'customer_waiting'].includes(thread.ai_tag)
    ) {
      index = 0
      timeHint = rowChip(thread, now).text
    } else if (thread.ai_tag === 'needs_quote') {
      // The AI tag wins over an internal follow-up reminder.
      index = 2
    } else if (isDue(dueCalendarDay(thread.follow_up_date), today)) {
      index = 4
      timeHint = rowChip(thread, now).text
    } else if (
      thread.status === 'to_quote' &&
      !WAITING_TAGS.includes(thread.ai_tag)
    )
      index = 2
    else {
      index = 4
      if (thread.last_our_message_at)
        timeHint = `Sin respuesta hace ${Math.max(0, dayDifference(today, managuaDay(thread.last_our_message_at)))} días`
    }
    groups[index].threads.push({ ...thread, timeHint })
  }
  groups[0].threads.sort((a, b) =>
    (promiseDue(a) || '9999').localeCompare(promiseDue(b) || '9999')
  )
  groups[1].threads.sort((a, b) =>
    (a.last_customer_message_at || '9999').localeCompare(
      b.last_customer_message_at || '9999'
    )
  )
  groups[3].threads.sort((a, b) => {
    const dueA = a.follow_up_date <= today,
      dueB = b.follow_up_date <= today
    return (
      Number(dueB) - Number(dueA) ||
      (a.follow_up_date || '9999').localeCompare(b.follow_up_date || '9999')
    )
  })
  groups[4].threads.sort((a, b) => {
    const dueA = isDue(dueCalendarDay(a.follow_up_date), today)
    const dueB = isDue(dueCalendarDay(b.follow_up_date), today)
    return (
      Number(dueB) - Number(dueA) ||
      (dueA && dueB ? a.follow_up_date.localeCompare(b.follow_up_date) : 0) ||
      (a.last_our_message_at || '9999').localeCompare(
        b.last_our_message_at || '9999'
      )
    )
  })
  for (const group of groups.slice(5))
    group.threads.sort((a, b) =>
      b.status_changed_at.localeCompare(a.status_changed_at)
    )
  return [confirmed, ...groups]
}

const FEED_TAB_PRIORITY = [
  'today',
  'unanswered',
  'toQuote',
  'payments',
  'waiting',
]

/** Urgent deliveries win; future-only confirmed rows do not hide response tasks. */
export function defaultFeedTab(groups) {
  if (
    groups.some((group) => group.key === 'confirmed' && group.urgentCount > 0)
  )
    return 'confirmed'
  return (
    FEED_TAB_PRIORITY.find((key) =>
      groups.some((group) => group.key === key && group.threads.length > 0)
    ) || 'today'
  )
}

/** Restore only a populated tab, without overwriting preferences during loading. */
export function loadFeedTab(businessId, groups, storage) {
  if (businessId) {
    try {
      const key = (storage || globalThis.localStorage).getItem(
        `whatsapp.feedTab.${businessId}`
      )
      if (groups.some((group) => group.key === key && group.threads.length > 0))
        return key
    } catch {
      /* Private browsing may deny storage; the feed remains usable. */
    }
  }
  return defaultFeedTab(groups)
}

export function saveFeedTab(businessId, key, storage) {
  if (!businessId) return
  try {
    ;(storage || globalThis.localStorage).setItem(
      `whatsapp.feedTab.${businessId}`,
      key
    )
  } catch {
    /* The current tab still works for this session. */
  }
}

/** Automatic horizontal tab activation; null leaves ordinary keys untouched. */
export function feedTabKey(groups, selected, key) {
  if (!groups.length) return null
  const index = groups.findIndex((group) => group.key === selected)
  if (key === 'Home') return groups[0].key
  if (key === 'End') return groups.at(-1).key
  if (key === 'ArrowLeft')
    return groups[(index - 1 + groups.length) % groups.length].key
  if (key === 'ArrowRight') return groups[(index + 1) % groups.length].key
  return null
}

export function visibleFeedThreads(group, showAllWaiting) {
  return group.key === 'waiting' && !showAllWaiting
    ? group.threads.slice(0, 8)
    : group.threads
}

/** Compact text and urgency, using the same exclusive priorities and Managua day as the feed. */
export function rowChip(thread, now = new Date()) {
  if (isNotCustomer(thread))
    return { text: thread.lost_reason, tone: 'neutral' }
  const open = OPEN_STATUSES.includes(thread.status)
  if (open) {
    if (isConfirmedThread(thread)) return paymentChip(thread)
    const today = managuaDay(now)
    const payment = thread.kind === 'payment'
    const due = payment
      ? dueCalendarDay(thread.follow_up_date)
      : promiseDue(thread)
    if (isDue(due, today)) {
      const days = dayDifference(today, due)
      return days > 0
        ? { text: `Vencido ${days} d`, tone: 'danger' }
        : { text: payment ? 'Revisar hoy' : 'Prometido hoy', tone: 'warning' }
    }
    const followUp = dueCalendarDay(thread.follow_up_date)
    if (!payment && isDue(followUp, today)) {
      const days = dayDifference(today, followUp)
      return {
        text: days > 0 ? `Seguimiento vencido ${days} d` : 'Seguimiento hoy',
        tone: days > 0 ? 'danger' : 'warning',
      }
    }
    if (thread.kind !== 'payment' && thread.awaiting_reply) {
      const hours = hoursAgo(thread.last_customer_message_at, now)
      return {
        text:
          hours == null
            ? 'Sin responder'
            : `Escribió hace ${hours >= 24 ? `${Math.floor(hours / 24)} d` : `${hours} h`}`,
        tone: 'warning',
      }
    }
    if (
      thread.status !== 'to_quote' &&
      thread.kind !== 'payment' &&
      thread.last_our_message_at &&
      Number.isFinite(Date.parse(thread.last_our_message_at))
    ) {
      const days = Math.max(
        0,
        dayDifference(today, managuaDay(thread.last_our_message_at))
      )
      return { text: `Sin respuesta ${days} d`, tone: 'neutral' }
    }
  }
  return {
    text:
      thread.quoted_amount != null
        ? `C$ ${Number(thread.quoted_amount).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : STATUS_LABELS[thread.status] || 'Sin actividad',
    tone: 'neutral',
  }
}

const SENDERS_KEY = 'whatsapp.ourSenders'
const cleanSenders = (names) => [
  ...new Set(
    names
      .filter((n) => typeof n === 'string')
      .map((n) => n.trim())
      .filter(Boolean)
  ),
]
export function loadOurSenders(storage) {
  try {
    const names = JSON.parse(
      (storage || globalThis.localStorage).getItem(SENDERS_KEY)
    )
    if (Array.isArray(names) && names.every((n) => typeof n === 'string'))
      return cleanSenders(names)
  } catch {
    /* Private browsing may deny storage. */
  }
  return ['Ivonne Silva']
}
export function saveOurSenders(names, storage) {
  try {
    ;(storage || globalThis.localStorage).setItem(
      SENDERS_KEY,
      JSON.stringify(cleanSenders(names))
    )
  } catch {
    /* Session-only configuration still works. */
  }
}
const oursIncludes = (sender, names) =>
  names.some((name) => normalize(name) === normalize(sender))
function validDate(year, month, day) {
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${result}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === result
    ? result
    : null
}
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]
function promiseDate(text, date) {
  if (/\bpasado manana\b/.test(text)) return addDays(date, 2)
  if (/\bmanana\b/.test(text)) return addDays(date, 1)
  if (/\bhoy\b/.test(text)) return date
  const weekday = WEEKDAYS.findIndex((day) =>
    new RegExp(`\\b${day}\\b`).test(text)
  )
  if (weekday >= 0) {
    const current = new Date(`${date}T12:00:00Z`).getUTCDay()
    return addDays(date, (weekday - current + 7) % 7 || 7)
  }
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/)
  const named = text.match(
    new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join('|')})(?: de (\\d{4}))?\\b`)
  )
  if (!numeric && !named) return null
  const match = numeric || named
  const year = Number(match[3] || date.slice(0, 4)),
    month = numeric ? Number(match[2]) : MONTHS.indexOf(match[2]) + 1
  let result = validDate(year, month, Number(match[1]))
  if (result && !match[3] && result < date)
    result = validDate(year + 1, month, Number(match[1]))
  return result
}

/** Conservative extraction: only our promise verbs plus an explicit calendar cue. */
export function detectPromise(messages, ourSenders = ['Ivonne Silva']) {
  let promise = null
  for (const message of messages) {
    if (!oursIncludes(message.sender, ourSenders)) continue
    // Keep the exact original line as evidence, not a generated paraphrase.
    for (const line of message.text.split('\n')) {
      const text = plain(line)
      if (
        !/\ble\s+(?:(?:paso|envio|mando|comparto)\s+(?:la cotizacion|el precio|los disenos)|confirmo\b|aviso\b|escribo\b)/.test(
          text
        )
      )
        continue
      if (/\bno\s+(?:le|se)|\b(?:podria|tal vez|quizas)\b/.test(text)) continue
      const promisedDate = promiseDate(text, managuaDay(message.at))
      if (promisedDate)
        promise = { promisedDate, promiseSource: line, confidence: 'high' }
    }
  }
  return promise
}

/** WhatsApp Web copied transcript; no AI, network, or host-timezone assumptions. */
export function parseWhatsAppChat(input, ourSenders = ['Ivonne Silva']) {
  const messages = []
  const header =
    /^\[(\d{1,2}):(\d{2})\s*(?:(a|p)\.?\s*m\.?)?,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]\s*([^:]+):\s?(.*)$/i
  let current = null
  for (const line of String(input || '')
    .replaceAll('\u200e', '')
    .replaceAll('\u202f', ' ')
    .split(/\r?\n/)) {
    const match = line.match(header)
    if (!match) {
      if (current && !line.startsWith('[')) current.text += `\n${line}`
      continue
    }
    const [, hour, minute, meridiem, day, month, year, sender, text] = match
    const date = validDate(Number(year), Number(month), Number(day))
    let h = Number(hour)
    current = null
    if (!date || Number(minute) > 59 || (meridiem ? h < 1 || h > 12 : h > 23))
      continue
    if (meridiem) h = (h % 12) + (meridiem.toLowerCase() === 'p' ? 12 : 0)
    current = {
      at: new Date(
        `${date}T${String(h).padStart(2, '0')}:${minute}:00-06:00`
      ).toISOString(),
      sender: sender.trim(),
      text,
    }
    messages.push(current)
  }
  const customerMessages = messages.filter(
    (m) => !oursIncludes(m.sender, ourSenders)
  )
  const ourMessages = messages.filter((m) => oursIncludes(m.sender, ourSenders))
  const sender = customerMessages[0]?.sender || ''
  const digits = sender.replace(/\D/g, '')
  const phone =
    /^[+\d\s()-]+$/.test(sender) && digits.length >= 8
      ? digits.length === 8
        ? `505${digits}`
        : digits
      : ''
  const promise = detectPromise(messages, ourSenders)
  const lastCustomer = customerMessages.at(-1)?.at || null,
    lastOurs = ourMessages.at(-1)?.at || null
  return {
    messages,
    senders: [...new Set(messages.map((m) => m.sender))],
    chat_key: phone || (sender ? `name:${normalize(sender)}` : ''),
    customer_name: phone ? '' : sender,
    customer_phone: phone || null,
    summary: customerMessages.map((m) => m.text).join('\n\n'),
    requested_at: customerMessages[0]?.at || null,
    last_customer_message_at: lastCustomer,
    last_our_message_at: lastOurs,
    awaiting_reply: Boolean(
      customerMessages.length &&
        !oursIncludes(messages.at(-1).sender, ourSenders)
    ),
    promised_date: promise?.promisedDate || null,
    promise_source: promise?.promiseSource || null,
    promise_confidence: promise?.confidence || null,
  }
}

/** Short line label: first clause (commas inside numbers kept), without leading quantity or price text. */
export function threadItemLabel(summary) {
  const clause = (summary || '').split(/[;\n]|,(?!\d)|\.(?:\s|$)/)[0]
  const label = clause
    .replace(/\s+(?:a|por|=)\s+C\$.*$/i, '')
    .replace(/^\s*\d+\s+/, '')
    .trim()
    .slice(0, 60)
    .trim()
  return label ? label[0].toUpperCase() + label.slice(1) : 'Pedido de WhatsApp'
}

const parseMoney = (value) => Number(String(value).replaceAll(',', ''))

/** Quantity × unit price from "N … a C$X c/u", or an evenly divisible "N … por C$TOTAL". */
function threadItemPricing(summary, perPiece, quotedAmount) {
  if (perPiece)
    return { quantity: Number(perPiece[1]) || 1, unit_price: parseMoney(perPiece[2]) }
  const total = summary.match(/^\s*(\d+)\s+[^;\n]*?\s+(?:por|=)\s+C\$\s*([\d,]+(?:\.\d+)?)/i)
  if (total) {
    const quantity = Number(total[1])
    const unit = parseMoney(total[2]) / quantity
    if (quantity > 1 && Number.isInteger(unit)) return { quantity, unit_price: unit }
  }
  return {
    quantity: 1,
    unit_price: quotedAmount == null ? '' : Number(quotedAmount),
  }
}

/** Adapter shared by all three business order forms; never invent a payment. */
export function threadOrderPrefill(thread, orderDate = managuaDay()) {
  const phone = chatPhone({ ...thread, customer_phone: (thread.customer_phone || '').trim() })
  const summary = (thread.summary || '').trim()
  const perPiece = summary.match(/(?:^|\s)(\d+)\s+[^;\n]*?\s+a\s+C\$\s*([\d,]+(?:\.\d+)?)\s*c\s*\/\s*u\b/i)
  const pricing = threadItemPricing(summary, perPiece, thread.quoted_amount)
  const method = (thread.delivery_method || '').trim()
  const delivery = /delivery|motorizado|cargotrans|env[ií]o|encomienda/i.test(method)
  const pickup = /retiro|recoge/i.test(method)
  const notes = [thread.summary, thread.notes].filter(Boolean)
  const paid = Number(thread.paid_amount)
  if (Number.isFinite(paid) && paid > 0) notes.push(`Anticipo recibido por WhatsApp: C$${paid} (verificar comprobante)`)
  return {
    ...newOrderForm(orderDate),
    customer_name: (thread.customer_name || '').trim(),
    customer_phone: phone.startsWith('505') && phone.length === 11 ? phone.slice(3) : phone,
    client_id: thread.client_id || null,
    notes: notes.join('\n\n'),
    estimated_delivery_date: thread.delivery_date || '',
    delivery_method: pickup || !delivery ? 'pickup' : 'delivery',
    delivery_address: !pickup && delivery ? [method, thread.delivery_address].filter(Boolean).join(' — ') : '',
    items: [
      {
        product_id: null,
        product_name: threadItemLabel(summary),
        product_description: summary,
        quantity: pricing.quantity,
        unit_price: pricing.unit_price,
        hours_needed: '',
        rush_fee: 0,
        is_custom: true,
        material: '',
        engraving_minutes: '',
        weight_grams: '',
        color: '',
      },
    ],
  }
}

/** Normalize local Nicaraguan numbers for wa.me without creating a link for names. */
export function chatPhone(thread) {
  const candidate =
    thread.customer_phone ||
    (/^\d+$/.test(thread.chat_key || '') ? thread.chat_key : '')
  const digits = candidate.replace(/\D/g, '')
  return digits.length === 8 ? `505${digits}` : digits
}

/** Manual editor validation is pure and shared with tests; never trust hidden inputs. */
export function buildThreadPayload(form) {
  const customer_name = (form.customer_name || '').trim(),
    customer_phone = chatPhone(form)
  let chat_key = (form.chat_key || '').trim()
  if (/^name:/i.test(chat_key))
    chat_key = `name:${normalize(chat_key.slice(5))}`
  else if (/^[+\d\s()-]+$/.test(chat_key))
    chat_key = chatPhone({ customer_phone: chat_key })
  if (!chat_key)
    chat_key =
      customer_phone ||
      (customer_name ? `name:${normalize(customer_name)}` : '')
  if (!chat_key) throw new Error('Indique el cliente o teléfono.')
  if (!/^(?:\d{8,15}|name:.+)$/.test(chat_key))
    throw new Error(
      'El identificador debe ser un teléfono o name:nombre del cliente.'
    )
  const summary = (form.summary || '').trim()
  if (!summary) throw new Error('Indique el resumen de la conversación.')
  const quoted_amount =
    form.quoted_amount == null || String(form.quoted_amount).trim() === ''
      ? null
      : Number(form.quoted_amount)
  if (
    quoted_amount !== null &&
    (!Number.isFinite(quoted_amount) || quoted_amount < 0)
  )
    throw new Error('El monto debe ser un número no negativo.')
  const paid_amount = Number(form.paid_amount ?? 0)
  if (
    !Number.isFinite(paid_amount) ||
    paid_amount < 0 ||
    paid_amount > 9999999999.99 ||
    Math.abs(paid_amount * 100 - Math.round(paid_amount * 100)) > 0.00001
  )
    throw new Error(
      'El monto pagado debe ser no negativo y tener hasta dos decimales.'
    )
  const unread_count = Number(form.unread_count || 0)
  if (!Number.isSafeInteger(unread_count) || unread_count < 0)
    throw new Error(
      'El número de mensajes sin leer debe ser un entero no negativo.'
    )
  const reference_images = (form.reference_images || [])
    .map((url) => url.trim())
    .filter(Boolean)
  for (const url of reference_images) {
    let valid = false
    try {
      const parsed = new URL(url)
      valid =
        parsed.protocol === 'https:' &&
        Boolean(parsed.hostname) &&
        !/\s/.test(url)
    } catch {
      /* Reject incomplete URLs. */
    }
    if (!valid)
      throw new Error('Las referencias deben ser enlaces HTTPS válidos.')
  }
  const payload = {
    ...form,
    chat_key,
    customer_name: customer_name || null,
    customer_phone: customer_phone || null,
    summary,
    quoted_amount,
    paid_amount,
    delivery_method: (form.delivery_method || '').trim() || null,
    unread_count,
    reference_images,
    labels: [
      ...new Set(
        (form.labels || []).map((label) => label.trim()).filter(Boolean)
      ),
    ],
    client_id: form.client_id || null,
    order_id: form.order_id || null,
  }
  for (const key of ['promised_date', 'follow_up_date', 'delivery_date']) {
    const value = form[key] || null
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        validDate(
          Number(value.slice(0, 4)),
          Number(value.slice(5, 7)),
          Number(value.slice(8, 10))
        ) !== value)
    )
      throw new Error(
        'Use una fecha válida para la entrega, la promesa y el seguimiento.'
      )
    payload[key] = value
  }
  for (const key of [
    'requested_at',
    'last_customer_message_at',
    'last_our_message_at',
    'last_reviewed_at',
  ]) {
    const value = form[key] || null
    if (
      value &&
      (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ||
        !Number.isFinite(Date.parse(value)))
    )
      throw new Error(
        'Use una fecha ISO válida con zona horaria en los mensajes y la revisión.'
      )
    payload[key] = value ? new Date(value).toISOString() : null
  }
  return payload
}
