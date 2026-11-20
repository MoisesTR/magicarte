import { addThreadPayment } from '../utils/whatsappFeed.js'
import { requestThreadClassification } from '../utils/whatsappClassification.js'
import { validateClassification } from '../../api/_lib/whatsappClassification.js'
import { supabase } from '../config/supabaseClient'

const NOTICE = 'Falta activar la sección WhatsApp'
const FIELDS = [
  'chat_key',
  'customer_name',
  'customer_phone',
  'client_id',
  'kind',
  'status',
  'summary',
  'next_action',
  'quoted_amount',
  'delivery_date',
  'delivery_method',
  'paid_amount',
  'promised_date',
  'promise_source',
  'follow_up_date',
  'requested_at',
  'last_customer_message_at',
  'last_our_message_at',
  'awaiting_reply',
  'unread_count',
  'labels',
  'reference_images',
  'order_id',
  'lost_reason',
  'notes',
  'source',
  'last_reviewed_at',
  'ai_tag',
  'ai_tag_reason',
  'ai_tagged_at',
]
const AI_FIELDS = ['ai_tag', 'ai_tag_reason', 'ai_tagged_at']
const withAITags = (thread) =>
  thread && {
    ...thread,
    ...Object.fromEntries(AI_FIELDS.map((key) => [key, thread[key] ?? null])),
  }
const missingAITags = (error) =>
  ['42703', 'PGRST204'].includes(error?.code) &&
  /whatsapp_threads/i.test(error.message || '') &&
  /\bai_tag(?:_reason|ged_at)?\b/i.test(error.message || '')
const withoutAITags = (payload) =>
  Object.fromEntries(
    Object.entries(payload).filter(([key]) => !AI_FIELDS.includes(key))
  )
const tagUnavailable = () => ({
  data: null,
  aiTagsAvailable: false,
  error: new Error(
    'Falta aplicar la migración de etiquetas AI. La conversación se conserva sin clasificar.'
  ),
})
async function writeWithAITags(payload, operation) {
  const result = await readResult(operation(payload))
  if (
    !missingAITags(result.error) ||
    !AI_FIELDS.some((key) => Object.hasOwn(payload, key))
  )
    return result
  const legacy = withoutAITags(payload)
  if (!Object.keys(legacy).length) return tagUnavailable()
  return { ...(await readResult(operation(legacy))), aiTagsAvailable: false }
}
const editable = (value) =>
  Object.fromEntries(
    FIELDS.filter((key) => Object.hasOwn(value, key)).map((key) => [
      key,
      value[key],
    ])
  )
const missing = (error) =>
  ['42P01', 'PGRST205'].includes(error?.code) &&
  /whatsapp_(threads|reviews)/i.test(error.message || '')
const required = (businessId, id = true) =>
  businessId != null && businessId !== '' && id != null && id !== ''
const invalid = () => ({
  data: null,
  error: new Error('Thread and business ids are required'),
})
async function readResult(query) {
  const result = await query
  return missing(result.error)
    ? { data: null, error: new Error(NOTICE), available: false, notice: NOTICE }
    : result
}

/** Complete per-business feed, independently paginated beyond the API row cap. */
export async function fetchWhatsAppFeed(businessId) {
  if (!required(businessId)) throw new Error('A business id is required')
  let threads = [],
    offset = 0,
    threadMissing = false
  while (true) {
    const result = await supabase
      .from('whatsapp_threads')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(offset, offset + 499)
    if (missing(result.error)) {
      threadMissing = true
      break
    }
    if (result.error) throw new Error(result.error.message)
    threads.push(...(result.data || []).map(withAITags))
    if ((result.data || []).length < 500) break
    offset += 500
  }
  const review = await supabase
    .from('whatsapp_reviews')
    .select('*')
    .eq('business_id', businessId)
    .order('reviewed_at', { ascending: false })
    .limit(1)
  if (review.error && !missing(review.error))
    throw new Error(review.error.message)
  return {
    threads,
    lastReview: review.data?.[0] || null,
    available: !threadMissing,
    notice: threadMissing || missing(review.error) ? NOTICE : null,
  }
}
export async function fetchWhatsAppThread(id, businessId) {
  if (!required(businessId, id)) return invalid()
  const result = await readResult(
    supabase
      .from('whatsapp_threads')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle()
  )
  return { ...result, data: withAITags(result.data) }
}
export async function createWhatsAppThread(thread, businessId) {
  if (!required(businessId)) return invalid()
  return writeWithAITags(editable(thread), (payload) =>
    supabase
      .from('whatsapp_threads')
      .insert([{ ...payload, business_id: businessId }])
      .select()
      .single()
  )
}
export async function updateWhatsAppThread(id, thread, businessId) {
  if (!required(businessId, id)) return invalid()
  return writeWithAITags(editable(thread), (payload) =>
    supabase
      .from('whatsapp_threads')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
  )
}

export async function deleteWhatsAppThread(id, businessId) {
  if (!required(businessId, id)) return invalid()
  return readResult(
    supabase
      .from('whatsapp_threads')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
  )
}
export async function markWhatsAppThread(
  id,
  status,
  businessId,
  lostReason = null
) {
  if (
    !['to_quote', 'sent', 'follow_up', 'won', 'lost', 'done'].includes(status)
  )
    return { data: null, error: new Error('Invalid WhatsApp status') }
  return updateWhatsAppThread(
    id,
    { status, ...(status === 'lost' ? { lost_reason: lostReason } : {}) },
    businessId
  )
}

/**
 * The review assistant must skip any chat_key that has a thread where
 * status='done' and lost_reason like 'No es cliente%'.
 */
export async function markNotCustomer(thread, reason, businessId) {
  if (!required(businessId, thread?.id ?? null)) return invalid()
  const detail = String(reason ?? '')
    .trim()
    .slice(0, 80)
    .trim()
  return updateWhatsAppThread(
    thread.id,
    {
      status: 'done',
      kind: 'other',
      lost_reason: detail ? `No es cliente: ${detail}` : 'No es cliente',
    },
    businessId
  )
}

/** Call only after both order and items have been successfully persisted. */
export async function completeThreadConversion(id, orderId, businessId) {
  if (!required(businessId, id) || !orderId) return invalid()
  return updateWhatsAppThread(
    id,
    { status: 'won', order_id: orderId },
    businessId
  )
}

/** Fresh read plus compare-and-swap: concurrent payments fail visibly, never overwrite. */
export async function registerWhatsAppPayment(id, amount, businessId) {
  if (!required(businessId, id)) return invalid()
  try {
    addThreadPayment(0, amount)
    const current = await fetchWhatsAppThread(id, businessId)
    if (current.error) return current
    const thread = current.data
    if (!thread || !['to_quote', 'sent', 'follow_up'].includes(thread.status))
      return {
        data: null,
        error: new Error('La conversación ya no está abierta.'),
      }
    const paid_amount = addThreadPayment(thread.paid_amount, amount)
    const result = await readResult(
      supabase
        .from('whatsapp_threads')
        .update({ paid_amount })
        .eq('id', id)
        .eq('business_id', businessId)
        .eq('paid_amount', thread.paid_amount)
        .eq('status', thread.status)
        .select()
        .single()
    )
    if (result.error?.code === 'PGRST116')
      return {
        data: null,
        error: new Error(
          'La conversación cambió. Actualice y revise el pago antes de reintentar.'
        ),
      }
    return result
  } catch (error) {
    return { data: null, error }
  }
}

/** Lightweight matching candidates only; a failed page disables matching, not the feed. */
export async function fetchWhatsAppOrders(businessId, now = new Date()) {
  if (!required(businessId)) throw new Error('A business id is required')
  const since = new Date(new Date(now).getTime() - 90 * 86400000).toISOString()
  const orders = []
  try {
    for (let offset = 0; ; offset += 500) {
      const result = await supabase
        .from('orders')
        .select(
          'id, business_id, order_number, customer_name, customer_phone, status, created_at, estimated_delivery_date'
        )
        .eq('business_id', businessId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + 499)
      if (result.error) throw result.error
      orders.push(...(result.data || []))
      if ((result.data || []).length < 500) return orders
    }
  } catch (error) {
    console.warn('WhatsApp order matching unavailable', error)
    return []
  }
}

/** Classification is optional: return failures without changing or hiding the thread. */
export async function classifyWhatsAppThread(
  thread,
  businessId,
  {
    requestClassification = requestThreadClassification,
    now = () => new Date(),
  } = {}
) {
  if (!required(businessId, thread?.id ?? null)) return invalid()
  if (thread.ai_tag != null) return { data: thread, error: null }
  try {
    const result = validateClassification(
      await requestClassification(thread, {
        getSession: () => supabase.auth.getSession(),
      })
    )
    return await updateWhatsAppThread(
      thread.id,
      {
        ai_tag: result.tag,
        ai_tag_reason: result.reason,
        ai_tagged_at: now().toISOString(),
      },
      businessId
    )
  } catch (error) {
    return { data: null, error }
  }
}
