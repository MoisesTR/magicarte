import { selectionTotals } from './productPresentations.js'

const PRODUCTION_STATUSES = ['pending', 'confirmed', 'in_progress']
const normalizedName = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function piecesForItem(item = {}) {
  const quantity = Number(item.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  const units = Number(item.units_per_presentation) || 1
  return selectionTotals(quantity, Number.isFinite(units) && units > 0 ? units : 1).required
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
      const linked = item.product_id != null && item.product_id !== ''
      const catalogName = linked ? item.products?.name?.trim() : ''
      const name = catalogName || item.product_name?.trim() || 'Producto sin nombre'
      const key = linked ? `product:${item.product_id}` : `name:${normalizedName(name)}`
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
