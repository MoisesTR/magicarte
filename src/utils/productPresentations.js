// Pure presentation math and immutable order snapshots. Quantity always means packs.
const count = (value) => Math.max(0, Math.floor(Number(value) || 0))
const money = (value) => Math.round((Number(value) || 0) * 100) / 100

export function activeOptions(rows = []) {
  return rows
    .filter((row) => row.is_active !== false)
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
}
export function presentationPrice(rows, fallback = 0) {
  const active = activeOptions(rows)
  return active.length
    ? Math.min(...active.map((row) => Number(row.price)))
    : Number(fallback)
}
export function unitPrice(presentation) {
  return money(
    Number(presentation.price) / Math.max(1, count(presentation.units))
  )
}
export function formatPresentationMoney(value) {
  const rounded = money(value)
  return `C$${rounded.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 })}`
}
export function presentationPriceLabel(rows, fallback = 0) {
  return `${activeOptions(rows).length ? 'Desde ' : ''}${formatPresentationMoney(presentationPrice(rows, fallback))}`
}
export function selectionTotals(packs, units, designs = []) {
  const required = count(packs) * count(units)
  const chosen = designs.reduce((sum, row) => sum + count(row.quantity), 0)
  return {
    required,
    chosen,
    remaining: Math.max(0, required - chosen),
    over: Math.max(0, chosen - required),
  }
}
export function changeDesignQuantity(selections, design, delta, required) {
  const key = (row) =>
    design.id
      ? row.design_id === design.id
      : !row.design_id && row.design_name === design.name
  const current = selections.find(key)
  const available = Math.max(
    0,
    required - selectionTotals(0, 0, selections).chosen
  )
  const quantity = Math.max(
    0,
    count(current?.quantity) + Math.min(delta, delta > 0 ? available : delta)
  )
  const others = selections.filter((row) => !key(row))
  if (!quantity) return others
  const next = {
    design_id: design.id || null,
    design_name: design.name,
    quantity,
    note: current?.note || '',
  }
  return current
    ? selections.map((row) => (key(row) ? next : row))
    : [...selections, next]
}
export function copyDesigns(rows) {
  return rows.map((row, sort_order) => ({
    name: row.name,
    image_url: row.image_url || null,
    is_active: row.is_active !== false,
    sort_order,
  }))
}
export function moveOption(rows, index, delta) {
  const next = rows.slice()
  if (index + delta < 0 || index + delta >= next.length) return next
  ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
  return next
}
export function presentationSnapshot(row) {
  return {
    presentation_id: row.id || null,
    presentation_label: row.label,
    units_per_presentation: Number(row.units),
    unit_price: Number(row.price),
  }
}
// Special packs are order snapshots only; they never create catalog rows.
export function defaultSpecialLabel(units) {
  return `Paquete especial de ${Math.max(1, count(units))}`
}
export function buildSpecialPresentation({ label, units, price }) {
  const errors = {}
  const empty = (value) => value == null || String(value).trim() === ''
  if (typeof label !== 'string' || !label.trim())
    errors.label = 'Escribe el nombre del paquete.'
  if (empty(units) || !Number.isInteger(Number(units)) || Number(units) < 1)
    errors.units = 'Las unidades deben ser un número entero mayor o igual a 1.'
  if (empty(price) || !Number.isFinite(Number(price)) || Number(price) < 0)
    errors.price = 'Escribe un precio mayor o igual a 0.'
  return {
    snapshot: Object.keys(errors).length
      ? null
      : presentationSnapshot({ label: label.trim(), units, price }),
    errors,
  }
}
export function isSpecialPresentation(item, presentations = []) {
  return !!(
    item?.presentation_label?.trim() &&
    (!item.presentation_id ||
      !presentations.some((row) => row.id === item.presentation_id))
  )
}
export function presentationSelectorModel(
  presentations,
  selected,
  { admin = false } = {}
) {
  const active = activeOptions(presentations)
  const current = active.find(
    (row) =>
      row.id &&
      row.id === selected?.id &&
      row.label === selected.label &&
      Number(row.units) === Number(selected.units) &&
      Number(row.price) === Number(selected.price)
  )
  const specialSelected =
    admin &&
    !!selected &&
    isSpecialPresentation(presentationSnapshot(selected), presentations)
  return {
    active,
    selectedCatalogId: current?.id || null,
    specialSelected,
    hasSnapshot: !!selected && !current && !specialSelected,
  }
}
export function updateSpecialPresentationDraft(draft, field, value) {
  const next = { ...draft, [field]: value }
  if (field === 'label') next.nameEdited = true
  if (field === 'units' && !draft.nameEdited)
    next.label = defaultSpecialLabel(value)
  return next
}
export function orderItemOptions(item) {
  if (
    !item.presentation_label &&
    !item.units_per_presentation &&
    !item.order_item_designs?.length &&
    !item.designs?.length
  )
    return {}
  return {
    presentation_id: item.presentation_id || null,
    presentation_label: item.presentation_label || null,
    units_per_presentation: item.units_per_presentation || null,
    designs: (item.designs || item.order_item_designs || []).map((row) => ({
      ...row,
    })),
  }
}
export function designLines(designs = []) {
  return designs
    .filter((row) => count(row.quantity) && row.design_name?.trim())
    .map(
      (row) =>
        `• ${row.design_name} ×${count(row.quantity)}${row.note?.trim() ? ` — ${row.note.trim()}` : ''}`
    )
}
export function presentationMessageLines(
  product,
  presentation,
  packs,
  designs = [],
  hasDesigns = true
) {
  const lines = [
    product.name,
    `${packs} × ${presentation.label} (${formatPresentationMoney(money(presentation.price * packs))})`,
    ...designLines(designs),
  ]
  const { remaining, over } = selectionTotals(
    packs,
    presentation.units,
    designs
  )
  if (hasDesigns && remaining) lines.push(`(faltan ${remaining} por elegir)`)
  if (hasDesigns && over) lines.push(`(sobran ${over} por elegir)`)
  return lines
}
export function validateProductOptions(presentations, designs) {
  if (
    presentations.some(
      (row) =>
        !row.label?.trim() ||
        !Number.isInteger(Number(row.units)) ||
        Number(row.units) <= 0 ||
        row.price === '' ||
        !Number.isFinite(Number(row.price)) ||
        Number(row.price) < 0
    )
  )
    return 'Revisa el nombre, las unidades y el precio de cada presentación.'
  const names = designs.map((row) => row.name?.trim().toLowerCase())
  if (names.some((name) => !name) || new Set(names).size !== names.length)
    return 'Los diseños deben tener nombres únicos y no estar vacíos.'
  if (
    designs.some(
      (row) => row.image_url && !/^https:\/\/\S+$/i.test(row.image_url)
    )
  )
    return 'La foto del diseño debe usar HTTPS.'
  return null
}
export function escapePresentationHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]
  )
}
export function orderItemDetailLines(item) {
  const lines = item.presentation_label ? [item.presentation_label] : []
  lines.push(...designLines(item.designs || item.order_item_designs || []))
  return lines
}
// Give drafts stable IDs before bulk upserts, including mixed new/existing rows.
export function identifyOptions(rows, makeId = () => crypto.randomUUID()) {
  return rows.map((row) => (row.id ? row : { ...row, id: makeId() }))
}

// Business-specific order forms share the same product-switch and snapshot rules.
export function catalogOrderItem(product, previous = {}) {
  const cleared = {
    ...previous,
    product_id: null,
    presentation_id: null,
    presentation_label: null,
    units_per_presentation: null,
    designs: [],
  }
  if (!product) return cleared
  const presentation = activeOptions(product.presentations || [])[0]
  return {
    ...cleared,
    product_id: product.id,
    product_name: product.name,
    unit_price: Number(product.price),
    ...(presentation ? presentationSnapshot(presentation) : {}),
  }
}
export function configuredOrderTotal(item, additionalItems = []) {
  return money(
    (Number(item.quantity) || 1) * Number(item.unit_price || 0) +
      Number(item.rush_fee || 0) +
      additionalItems.reduce((sum, row) => sum + Number(row.subtotal || 0), 0)
  )
}
export function orderItemInsertSnapshot(item, orderId) {
  const row = { ...item }
  for (const key of [
    'id',
    'created_at',
    'updated_at',
    'products',
    'order_item_designs',
    'designs',
  ])
    delete row[key]
  return { ...row, order_id: orderId, ...orderItemOptions(item) }
}
