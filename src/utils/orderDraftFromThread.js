import { validateOrderDraftInput, validateOrderDraft } from '../../api/_lib/orderDraftFromThread.js'

const clone = value => structuredClone(value)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const itemFacts = items => items.map(row => {
  const item = { ...row }
  delete item.product_open
  delete item.product_active_index
  return item
})

/** A private snapshot makes even legacy in-place item edits observable. */
export function createDraftSession(original) {
  return { original: clone(original), form: clone(original), edited: [] }
}

export function editDraftSession(state, next) {
  const edited = new Set(state.edited)
  for (const key of Object.keys(next)) {
    const previous = key === 'items' ? itemFacts(state.form.items) : state.form[key]
    const value = key === 'items' ? itemFacts(next.items) : next[key]
    if (!same(previous, value)) edited.add(key)
  }
  // Client selection owns the identity bundle even when one value happens to match.
  if (edited.has('client_id')) edited.add('customer_name')
  return { ...state, form: clone(next), edited: [...edited] }
}

export function mergeDraftSession(state, draft, catalog) {
  const valid = validateOrderDraft(draft, catalog)
  const form = clone(state.form)
  for (const field of ['customer_name', 'delivery_method', 'delivery_address', 'recipient_name']) {
    if (!state.edited.includes(field) && valid[field] !== null) form[field] = valid[field]
  }
  // A changed line owns the entire list: AI splits cannot be safely aligned by index.
  if (!state.edited.includes('items')) {
    const template = state.original.items[0]
    form.items = valid.items.map((item, index) => ({
      ...clone(template),
      _key: `${template._key || 'thread'}-ai-${index}`,
      product_id: item.product_id,
      product_query: item.product_id ? item.product_name : '',
      product_open: false,
      product_active_index: -1,
      product_name: item.product_name,
      product_description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      is_custom: !item.product_id,
    }))
  }
  if (!state.edited.includes('notes')) {
    const originalDeposit = state.original.notes.match(/Anticipo recibido por WhatsApp: C\$[^\n]+\(verificar comprobante\)/)?.[0]
    const deposit = originalDeposit || (valid.deposit_amount > 0 ? `Anticipo recibido por WhatsApp: C$${valid.deposit_amount} (verificar comprobante)` : '')
    // Keep the original evidence alongside AI notes; neither summary nor deposit is lost.
    const notes = [state.original.notes, valid.notes].filter(Boolean)
    if (deposit && !notes.some(note => note.includes(deposit))) notes.push(deposit)
    form.notes = [...new Set(notes)].join('\n\n')
  }
  return { ...state, form }
}

export function restoreDraftSession(state) {
  return createDraftSession(state.original)
}

export async function requestOrderDraft(thread, products, { getSession, fetchImpl = fetch }) {
  const catalog = products.slice(0, 200).map(product => ({ id: product.id, name: product.name, price: Number(product.price) }))
  const normalizedThread = { ...thread }
  for (const field of ['quoted_amount', 'paid_amount']) {
    const value = thread[field]
    if (typeof value === 'string') normalizedThread[field] = value.trim() ? Number(value) : null
  }
  const input = validateOrderDraftInput({ thread: normalizedThread, catalog })
  let session
  try { session = (await getSession())?.data?.session } catch { throw new Error('No se pudo verificar su sesión. Puede completar el pedido manualmente.') }
  if (!session?.access_token) throw new Error('Inicie sesión para completar el pedido con IA.')
  let response
  try {
    response = await fetchImpl('/api/draft-order-from-thread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(input),
    })
  } catch { throw new Error('No se pudo completar el pedido con IA. Revise su conexión; puede continuar manualmente.') }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('Su sesión venció. Inicie sesión de nuevo; puede continuar manualmente.')
    if (response.status === 503) throw new Error('La IA no está configurada. Puede completar el pedido manualmente.')
    if (response.status === 429) throw new Error('La IA alcanzó su límite de uso. Puede continuar manualmente.')
    throw new Error('No se pudo completar el pedido con IA. Puede continuar manualmente.')
  }
  return validateOrderDraft(result, input.catalog)
}

/** Preserve imported shipping facts without changing ordinary lightweight creation. */
export function threadOrderDeliveryFields(form) {
  const delivery = form.delivery_method === 'delivery'
  const fee = Number(form.delivery_fee)
  return {
    delivery_method: delivery ? 'delivery' : 'pickup',
    delivery_address: delivery ? form.delivery_address?.trim() || null : null,
    delivery_fee: delivery && Number.isFinite(fee) && fee >= 0 ? fee : 0,
    recipient_name: delivery ? form.recipient_name?.trim() || null : null,
    recipient_phone: delivery ? form.recipient_phone?.trim() || null : null,
    estimated_delivery_date: form.estimated_delivery_date || null,
  }
}
