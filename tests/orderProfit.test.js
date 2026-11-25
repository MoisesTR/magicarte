import test from 'node:test'
import assert from 'node:assert/strict'
import { itemCost, orderProfit } from '../src/utils/orderProfit.js'

const modelQuote = { summary: { costModel: { fixedPerOrder: 95, variablePerPiece: 57.7, basisQuantity: 26, version: 1 } } }
const item = (overrides = {}) => ({ product_id: 'a', product_name: 'Esfera', quantity: 26, unit_price: 140, ...overrides })

test('itemCost applies fixed and variable costs to production pieces', () => {
  assert.deepEqual(itemCost(item(), modelQuote), { cost: 1595.2, exact: true })
  assert.deepEqual(itemCost(item({ quantity: 1, units_per_presentation: 6 }), modelQuote), { cost: 441.2, exact: true })
})
test('itemCost falls back to approximate per-piece cost, including zero', () => {
  assert.deepEqual(itemCost(item({ quantity: 2, units_per_presentation: 6 }), { summary: { unitCost: 66 } }), { cost: 792, exact: false })
  assert.deepEqual(itemCost(item(), { summary: { unitCost: 0 } }), { cost: 0, exact: false })
})
test('itemCost refuses absent and invalid costs instead of treating them as free', () => {
  for (const quote of [null, {}, { summary: {} }, ...[null, '', -1, 'invalid', Infinity].map(unitCost => ({ summary: { unitCost } }))]) {
    assert.equal(itemCost(item(), quote), null)
  }
  assert.equal(itemCost(item(), { summary: { costModel: { fixedPerOrder: null, variablePerPiece: 10 } } }), null)
})
test('profit and margin use only costed item revenue and report missing names', () => {
  const result = orderProfit({ order_items: [item({ quantity: 2, unit_price: 100 }), item({ product_id: 'b', product_name: 'Bolsa', quantity: 1, unit_price: 500 })] }, { a: { summary: { unitCost: 30 } } })
  assert.deepEqual(result, { revenue: 700, cost: 60, profit: 140, marginPct: 70, costedRevenue: 200, missingItems: ['Bolsa'], approximate: true })
})
test('fixed cost is charged once per product across package and loose-piece lines', () => {
  const result = orderProfit({ order_items: [item({ quantity: 1, units_per_presentation: 6, unit_price: 900 }), item({ quantity: 20 })] }, { a: modelQuote })
  assert.equal(result.cost, 1595.2)
  assert.equal(result.profit, 2104.8)
  assert.equal(result.approximate, false)
})
test('different products using the same quote each incur their own fixed cost', () => {
  const result = orderProfit({ order_items: [item({ quantity: 1 }), item({ product_id: 'b', quantity: 1 })] }, { a: modelQuote, b: modelQuote })
  assert.equal(result.cost, 305.4)
})
test('revenue honors saved line subtotals and otherwise mirrors quantity times price plus rush fee', () => {
  const result = orderProfit({ delivery_fee: 1000, shipping: 500, total_amount: 9999, order_payments: [{ amount: 9000 }], order_items: [item({ quantity: 2, unit_price: 100, rush_fee: 20, subtotal: 180 }), item({ quantity: 1, unit_price: 100, rush_fee: 25 })] }, { a: { summary: { unitCost: 30 } } })
  assert.equal(result.revenue, 305)
  assert.equal(result.costedRevenue, 305)
  assert.equal(result.profit, 215)
  assert.equal(result.marginPct, 70)
})
test('margin is rounded to a whole percent and zero revenue never divides by zero', () => {
  assert.equal(orderProfit({ order_items: [item({ quantity: 1, unit_price: 3 })] }, { a: { summary: { unitCost: 1 } } }).marginPct, 67)
  const result = orderProfit({ order_items: [item({ quantity: 1, unit_price: 0 })] }, { a: modelQuote })
  assert.equal(result.marginPct, null)
  assert.equal(result.profit, -152.7)
})
test('empty orders and wholly uncosted orders have no profit or margin', () => {
  assert.deepEqual(orderProfit({}), { revenue: 0, cost: 0, profit: null, marginPct: null, costedRevenue: 0, missingItems: [], approximate: false })
  assert.equal(orderProfit({ order_items: [item()] }).profit, null)
})
