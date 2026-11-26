import { selectionTotals } from './productPresentations.js'

const PRODUCTION_STATUSES = ['pending', 'confirmed', 'in_progress']
const normalizedName = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function piecesForItem(item = {}) {
  const quantity = Number(item.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  const units = Number(item.units_per_presentation) || 1
  return selectionTotals(quantity, Number.isFinite(units) && units > 0 ? units : 1).required
}

const isLinked = item => item.product_id != null && item.product_id !== ''
const catalogNameForItem = item => (isLinked(item) ? item.products?.name?.trim() : '') || ''
const nameForItem = item => catalogNameForItem(item) || item.product_name?.trim() || 'Producto sin nombre'

// Stable grouping key: catalog products by id, unlinked items by accent/case-insensitive name.
export function pieceKeyForItem(item = {}) {
  return isLinked(item) ? `product:${item.product_id}` : `name:${normalizedName(nameForItem(item))}`
}

export function orderHasPieceKey(order, key) {
  if (!key) return false
  return (order?.order_items || []).some(item => pieceKeyForItem(item) === key)
}

export function piecesInOrderForKey(order, key) {
  return (order?.order_items || []).reduce((sum, item) => (pieceKeyForItem(item) === key ? sum + piecesForItem(item) : sum), 0)
}

// Label for a selected key, even when it no longer appears in the current summary.
export function describePieceKey(key, summary = { rows: [] }, orders = []) {
  const row = summary.rows?.find(candidate => candidate.key === key)
  if (row) return { name: row.name, pieces: row.pieces }
  for (const order of orders) {
    const item = (order.order_items || []).find(candidate => pieceKeyForItem(candidate) === key)
    if (item) return { name: nameForItem(item), pieces: 0 }
  }
  return { name: 'Producto seleccionado', pieces: 0 }
}

export function summarizePiecesToProduce(orders = [], { statuses = PRODUCTION_STATUSES } = {}) {
  const rows = new Map()
  const contributingOrders = new Set()
  let totalPieces = 0

  for (const order of orders) {
    if (!statuses.includes(order.status)) continue
    for (const item of order.order_items || []) {
      const pieces = piecesForItem(item)
      if (!pieces) continue
      const linked = isLinked(item)
      const catalogName = catalogNameForItem(item)
      const name = nameForItem(item)
      const key = pieceKeyForItem(item)
      if (!rows.has(key)) rows.set(key, { key, name, pieces: 0, orderNumbers: new Set(), linked })
      const row = rows.get(key)
      if (catalogName) row.name = catalogName
      row.pieces += pieces
      if (order.order_number != null && order.order_number !== '') {
        row.orderNumbers.add(Number(order.order_number) || order.order_number)
      }
      totalPieces += pieces
      contributingOrders.add(order.id ?? order.order_number ?? order)
    }
  }

  return {
    rows: [...rows.values()]
      .map(row => ({ ...row, orderNumbers: [...row.orderNumbers].sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true })) }))
      .sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name, 'es')),
    totalPieces,
    orderCount: contributingOrders.size,
  }
}
