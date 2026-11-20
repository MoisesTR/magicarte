import { newOrderForm } from './quoteForms.js'

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
const DAY = 86400000
const normalize = (value) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('es-NI')
const plain = (value) =>
  normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Calendar arithmetic is date-only; timestamps are always interpreted in Managua. */
export function managuaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
}
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10)
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
const dueDate = (thread) =>
  [thread.promised_date, thread.follow_up_date].filter(Boolean).sort()[0]
export function feedKPIs(threads, now = new Date()) {
  const rows = threads.filter((t) => OPEN_STATUSES.includes(t.status)),
    today = managuaDay(now)
  return {
    today: rows.filter((t) => dueDate(t) <= today).length,
    unanswered: rows.filter((t) => t.awaiting_reply).length,
    toQuote: rows.filter((t) => t.status === 'to_quote').length,
    payments: rows.filter((t) => t.kind === 'payment').length,
  }
}

/** Exclusive priority grouping. KPI counts intentionally overlap, feed cards never do. */
export function groupThreads(threads, now = new Date()) {
  const today = managuaDay(now)
  const groups = [
    ['today', 'Para hoy'],
    ['unanswered', 'Esperando tu respuesta'],
    ['toQuote', 'Por cotizar'],
    ['payments', 'Pagos pendientes'],
    ['waiting', 'Esperando al cliente'],
    ['closed', 'Cerrados (30 días)'],
  ].map(([key, title]) => ({ key, title, threads: [] }))
  for (const thread of threads) {
    let index,
      timeHint = ''
    if (!OPEN_STATUSES.includes(thread.status)) {
      if (
        !thread.status_changed_at ||
        new Date(thread.status_changed_at) < new Date(now) - 30 * DAY
      )
        continue
      index = 5
    } else if (dueDate(thread) <= today) {
      index = 0
      const days = dayDifference(today, dueDate(thread))
      timeHint = days > 0 ? `Vencido hace ${days} días` : 'Prometido hoy'
    } else if (thread.awaiting_reply) {
      index = 1
      const hours = hoursAgo(thread.last_customer_message_at, now)
      timeHint =
        hours == null ? 'Sin respuesta pendiente' : `Escribió hace ${hours} h`
    } else if (thread.status === 'to_quote') index = 2
    else if (thread.kind === 'payment') index = 3
    else {
      index = 4
      if (thread.last_our_message_at)
        timeHint = `Sin respuesta hace ${Math.max(0, dayDifference(today, managuaDay(thread.last_our_message_at)))} días`
    }
    groups[index].threads.push({ ...thread, timeHint })
  }
  groups[0].threads.sort((a, b) => dueDate(a).localeCompare(dueDate(b)))
  groups[1].threads.sort((a, b) =>
    (a.last_customer_message_at || '9999').localeCompare(
      b.last_customer_message_at || '9999'
    )
  )
  groups[4].threads.sort((a, b) =>
    (a.last_our_message_at || '9999').localeCompare(
      b.last_our_message_at || '9999'
    )
  )
  groups[5].threads.sort((a, b) =>
    b.status_changed_at.localeCompare(a.status_changed_at)
  )
  return groups
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

/** Adapter shared by all three business order forms; never invent a payment. */
export function threadOrderPrefill(thread, orderDate = managuaDay()) {
  const phone = (thread.customer_phone || '').replace(/\D/g, '')
  return {
    ...newOrderForm(orderDate),
    customer_name: thread.customer_name || thread.customer_phone || '',
    customer_phone:
      phone.startsWith('505') && phone.length === 11 ? phone.slice(3) : phone,
    client_id: thread.client_id || null,
    notes: [thread.summary, thread.notes].filter(Boolean).join('\n\n'),
    estimated_delivery_date: thread.promised_date || '',
    delivery_method: 'pickup',
    items: [
      {
        product_id: null,
        product_name: thread.summary || 'Pedido de WhatsApp',
        product_description: thread.summary || '',
        quantity: 1,
        unit_price:
          thread.quoted_amount == null ? '' : Number(thread.quoted_amount),
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
  for (const key of ['promised_date', 'follow_up_date']) {
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
      throw new Error('Use una fecha válida para la promesa y el seguimiento.')
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
