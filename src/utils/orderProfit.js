import { piecesForItem } from './productionPieces.js'

const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const finiteNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const validCost = value => finiteNumber(value) && Number(value) >= 0

export function itemCost(item, quote) {
  const summary = quote?.summary
  const pieces = piecesForItem(item)
  const model = summary?.costModel
  if (model && validCost(model.fixedPerOrder) && validCost(model.variablePerPiece)) {
    return { cost: money(Number(model.fixedPerOrder) + Number(model.variablePerPiece) * pieces), exact: true }
  }
  if (validCost(summary?.unitCost)) {
    return { cost: money(Number(summary.unitCost) * pieces), exact: false }
  }
  return null
}

export function orderProfit(order = {}, quotesByProductId = {}) {
  let revenue = 0, cost = 0, costedRevenue = 0, costedItems = 0, approximate = false
  const missingItems = [], fixedProducts = new Set()
  for (const item of order.order_items || []) {
    // Saved subtotals preserve line-level adjustments; drafts use the editor formula.
    const lineRevenue = finiteNumber(item.subtotal) ? Number(item.subtotal)
      : Math.max(1, Number(item.quantity) || 1) * (Number(item.unit_price) || 0) + (Number(item.rush_fee) || 0)
    revenue += lineRevenue
    const quote = item.product_id ? quotesByProductId[item.product_id] : null
    const estimate = itemCost(item, quote)
    if (!estimate) {
      missingItems.push(item.product_name || item.products?.name || 'Producto sin nombre')
      continue
    }
    let lineCost = estimate.cost
    if (estimate.exact) {
      if (fixedProducts.has(item.product_id)) lineCost -= Number(quote.summary.costModel.fixedPerOrder)
      fixedProducts.add(item.product_id)
    }
    cost += lineCost
    costedRevenue += lineRevenue
    costedItems++
    approximate ||= !estimate.exact
  }
  revenue = money(revenue)
  cost = money(cost)
  costedRevenue = money(costedRevenue)
  const profit = costedItems ? money(costedRevenue - cost) : null
  return {
    revenue, cost, profit,
    marginPct: costedRevenue ? Math.round(profit / costedRevenue * 100) : null,
    costedRevenue, missingItems, approximate,
  }
}
