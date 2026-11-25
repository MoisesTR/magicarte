import test from 'node:test'
import assert from 'node:assert/strict'
import { piecesForItem, summarizePiecesToProduce } from '../src/utils/productionPieces.js'

const item = (overrides = {}) => ({ product_id: 'sphere', product_name: 'Esfera Pokémon', quantity: 1, units_per_presentation: 6, ...overrides })
const order = (order_number, order_items, status = 'pending') => ({ id: `order-${order_number}`, order_number, order_items, status })

test('piecesForItem multiplies saved packs and defaults missing units to loose quantity', () => {
  assert.equal(piecesForItem(item({ units_per_presentation: 26 })), 26)
  assert.equal(piecesForItem(item({ quantity: 3, units_per_presentation: null })), 3)
  assert.equal(piecesForItem(item({ quantity: '2', units_per_presentation: '6' })), 12)
  assert.equal(piecesForItem(item({ quantity: 2, units_per_presentation: 0 })), 2)
})

test('piecesForItem returns zero for zero, missing, negative or invalid quantity', () => {
  for (const quantity of [0, -1, null, undefined, '', 'invalid', NaN, Infinity]) {
    assert.equal(piecesForItem(item({ quantity })), 0, String(quantity))
  }
  assert.equal(piecesForItem(), 0)
})

test('summary groups linked products across orders with sorted unique order numbers', () => {
  const orders = [
    order(103, [item({ product_name: 'Old name', units_per_presentation: 26 })]),
    order(98, [item({ products: { name: 'Esfera Pokémon actual' } })], 'confirmed'),
    order(97, [item({ units_per_presentation: 3 }), item({ units_per_presentation: 3 })], 'in_progress'),
  ]
  const original = structuredClone(orders)
  const summary = summarizePiecesToProduce(orders)
  assert.deepEqual(summary, {
    rows: [{ key: 'product:sphere', name: 'Esfera Pokémon actual', pieces: 38, orderNumbers: [97, 98, 103], linked: true }],
    totalPieces: 38,
    orderCount: 3,
  })
  assert.deepEqual(orders, original, 'must not mutate saved orders or items')
})

test('summary excludes produced and inactive statuses by default and allows explicit statuses', () => {
  const orders = ['pending', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled', 'canceled'].map((status, index) => order(index + 1, [item()], status))
  assert.equal(summarizePiecesToProduce(orders).totalPieces, 18)
  assert.equal(summarizePiecesToProduce(orders).orderCount, 3)
  assert.equal(summarizePiecesToProduce(orders, { statuses: ['confirmed'] }).totalPieces, 6)
  assert.deepEqual(summarizePiecesToProduce(orders, { statuses: [] }), { rows: [], totalPieces: 0, orderCount: 0 })
})

test('unlinked names group case/accent/trim-insensitively without merging linked products', () => {
  const summary = summarizePiecesToProduce([
    order(10, [item({ product_id: null, product_name: '  Esfera PokÉmon  ', quantity: 2 })]),
    order(2, [item({ product_id: undefined, product_name: 'esfera pokemon' })]),
    order(3, [item({ product_id: 'other' })]),
    order(4, [item()]),
  ])
  assert.equal(summary.rows.length, 3)
  assert.deepEqual(summary.rows[0], { key: 'name:esfera pokemon', name: 'Esfera PokÉmon', pieces: 18, orderNumbers: [2, 10], linked: false })
  assert.equal(summary.rows.filter(row => row.linked).length, 2)
  assert.equal(summary.totalPieces, 30)
  assert.equal(summary.orderCount, 4)
})

test('summary sorts descending, deduplicates numeric order numbers, and only counts contributing orders', () => {
  const summary = summarizePiecesToProduce([
    order(9, [item({ product_id: 'small', quantity: 2, units_per_presentation: null }), item({ quantity: 0 })]),
    order(10, [item({ quantity: 2 })]),
    order('10', [item({ quantity: 1 })], 'confirmed'),
    order(11, [item({ quantity: 'bad' })]),
    order(12, []),
    { status: 'pending' },
  ])
  assert.deepEqual(summary.rows.map(row => row.pieces), [18, 2])
  assert.deepEqual(summary.rows[0].orderNumbers, [10])
  assert.equal(summary.totalPieces, 20)
  assert.equal(summary.orderCount, 2)
})

test('summary handles empty input', () => {
  assert.deepEqual(summarizePiecesToProduce([]), { rows: [], totalPieces: 0, orderCount: 0 })
  assert.deepEqual(summarizePiecesToProduce(), { rows: [], totalPieces: 0, orderCount: 0 })
})
