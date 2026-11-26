import test from 'node:test'
import assert from 'node:assert/strict'
import { describePieceKey, orderHasPieceKey, pieceKeyForItem, piecesForItem, piecesInOrderForKey, summarizePiecesToProduce } from '../src/utils/productionPieces.js'

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

test('pieceKeyForItem uses the product id for linked items and a normalized name otherwise', () => {
  assert.equal(pieceKeyForItem(item()), 'product:sphere')
  assert.equal(pieceKeyForItem(item({ product_id: 42 })), 'product:42')
  assert.equal(pieceKeyForItem(item({ product_id: null, product_name: '  Esfera PokÉmon  ' })), 'name:esfera pokemon')
  assert.equal(pieceKeyForItem(item({ product_id: '', product_name: 'ÁRBOL Navideño' })), 'name:arbol navideno')
  assert.equal(pieceKeyForItem({ product_id: null, product_name: '  ' }), 'name:producto sin nombre')
  assert.equal(pieceKeyForItem(), 'name:producto sin nombre')
})

test('summary row keys match pieceKeyForItem for the same items', () => {
  const items = [item(), item({ product_id: null, product_name: ' Taza Mágica ' })]
  const summary = summarizePiecesToProduce([order(1, items)])
  assert.deepEqual(summary.rows.map(row => row.key).sort(), items.map(pieceKeyForItem).sort())
})

test('orderHasPieceKey matches linked and unlinked items and tolerates missing data', () => {
  const mixed = order(5, [item({ product_id: 'mug' }), item({ product_id: null, product_name: 'Esfera Pokémon' })], 'completed')
  assert.equal(orderHasPieceKey(mixed, 'product:mug'), true)
  assert.equal(orderHasPieceKey(mixed, 'name:esfera pokemon'), true)
  assert.equal(orderHasPieceKey(mixed, 'product:sphere'), false)
  assert.equal(orderHasPieceKey(mixed, 'name:mug'), false)
  assert.equal(orderHasPieceKey({}, 'product:mug'), false)
  assert.equal(orderHasPieceKey(mixed, null), false)
  assert.equal(orderHasPieceKey(undefined, 'product:mug'), false)
})

test('piecesInOrderForKey sums pieces of matching items including units per presentation', () => {
  const mixed = order(6, [
    item({ quantity: 2, units_per_presentation: 6 }),
    item({ quantity: 1, units_per_presentation: null }),
    item({ product_id: 'mug', quantity: 4 }),
  ])
  assert.equal(piecesInOrderForKey(mixed, 'product:sphere'), 13)
  assert.equal(piecesInOrderForKey(mixed, 'product:mug'), 24)
  assert.equal(piecesInOrderForKey(mixed, 'product:none'), 0)
  assert.equal(piecesInOrderForKey({}, 'product:sphere'), 0)
})

test('describePieceKey prefers the summary row, then order items, then a generic label', () => {
  const summary = { rows: [{ key: 'product:sphere', name: 'Esfera actual', pieces: 38 }] }
  const orders = [order(1, [item({ product_id: 'mug', products: { name: 'Taza catálogo' }, product_name: 'Taza vieja' })], 'ready')]
  assert.deepEqual(describePieceKey('product:sphere', summary, orders), { name: 'Esfera actual', pieces: 38 })
  assert.deepEqual(describePieceKey('product:mug', summary, orders), { name: 'Taza catálogo', pieces: 0 })
  assert.deepEqual(describePieceKey('product:gone', summary, orders), { name: 'Producto seleccionado', pieces: 0 })
  assert.deepEqual(describePieceKey('product:gone'), { name: 'Producto seleccionado', pieces: 0 })
})
