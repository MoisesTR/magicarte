import { COLUMNS } from '../src/utils/constants.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const replace = async options => (await import('../src/utils/orderItemsSave.js')).replaceOrderItems(options)
function harness({ insertError = null, cleanupError = null, insertThrows = false, cleanupThrows = false, previousIds = ['old-1', 'old-2'] } = {}) {
  const calls = [], items = [{ order_id: 'order', product_name: 'Replacement' }]
  const options = {
    orderId: 'order', businessId: 2, previousIds, items,
    insertOrderItems: async (...args) => {
      calls.push(['insert', ...args])
      if (insertThrows) throw insertError
      return { data: [{ id: 'new-1' }], error: insertError }
    },
    deleteOrderItemsByIds: async (...args) => {
      calls.push(['delete', ...args])
      if (cleanupThrows) throw cleanupError
      return { error: cleanupError }
    },
  }
  return { calls, options }
}

for (const insertThrows of [false, true]) test(`insert failure leaves previous rows untouched (throws=${insertThrows})`, async () => {
  const failure = Error('Insert failed')
  const h = harness({ insertError: failure, insertThrows })
  const result = await replace(h.options)
  assert.equal(result.error, failure)
  assert.equal(result.cleanupError, null)
  assert.deepEqual(h.calls, [['insert', h.options.items, 2]])
})

test('successful replacement inserts first, then deletes exactly loaded old ids', async () => {
  const h = harness()
  const result = await replace(h.options)
  assert.equal(result.error, null)
  assert.equal(result.cleanupError, null)
  assert.deepEqual(h.calls, [['insert', h.options.items, 2], ['delete', 'order', ['old-1', 'old-2'], 2]])
})

test('cleanup excludes newly inserted ids and snapshots ids before awaiting insertion', async () => {
  const h = harness({ previousIds: ['old-1', 'new-1', null, 'old-1'] })
  const insert = h.options.insertOrderItems
  h.options.insertOrderItems = async (...args) => {
    h.options.previousIds.push('late-new')
    return insert(...args)
  }
  await replace(h.options)
  assert.deepEqual(h.calls[1], ['delete', 'order', ['old-1'], 2])
})

for (const cleanupThrows of [false, true]) test(`cleanup failure is explicitly nonblocking (throws=${cleanupThrows})`, async () => {
  const failure = Error('Cleanup failed')
  const h = harness({ cleanupError: failure, cleanupThrows })
  const result = await replace(h.options)
  assert.equal(result.error, null)
  assert.equal(result.cleanupError, failure)
  assert.equal(h.calls.length, 2)
})

test('empty previous ids never invoke cleanup', async () => {
  const h = harness({ previousIds: [] })
  assert.equal((await replace(h.options)).error, null)
  assert.deepEqual(h.calls, [['insert', h.options.items, 2]])
})

test('empty replacement still waits for a successful insert before clearing old ids', async () => {
  const h = harness()
  h.options.items = []
  await replace(h.options)
  assert.deepEqual(h.calls, [['insert', [], 2], ['delete', 'order', ['old-1', 'old-2'], 2]])
})

async function dataHarness({ order = { id: 'order' }, scopeError = null, deleteError = null } = {}) {
  const requests = []
  const client = { from(table) {
    const request = { table, filters: [] }
    requests.push(request)
    return {
      select() { return this },
      eq(...args) { request.filters.push(args); return this },
      in(...args) { request.filters.push(args); return this },
      delete() { request.delete = true; return this },
      maybeSingle() { return this },
      then(resolve, reject) { return Promise.resolve(request.delete ? { error: deleteError } : { data: order, error: scopeError }).then(resolve, reject) },
    }
  } }
  const source = (await readFile('src/data/orders.js', 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const api = new Function('supabase', 'TABLE', 'COLUMNS', `${source}; return { deleteOrderItemsByIds }`)(client, { ORDERS: 'orders', ORDER_ITEMS: 'order_items' }, COLUMNS)
  return { ...api, requests }
}

test('data cleanup verifies parent business and deletes only the requested order/id intersection', async () => {
  const h = await dataHarness()
  assert.equal((await h.deleteOrderItemsByIds('order', ['old-1', 'old-2'], 2)).error, null)
  assert.deepEqual(h.requests, [
    { table: 'orders', filters: [['id', 'order'], ['business_id', 2]] },
    { table: 'order_items', delete: true, filters: [['order_id', 'order'], ['id', ['old-1', 'old-2']]] },
  ])
})

test('data cleanup never deletes on missing scope, not-found, wrong parent or failed scope check', async () => {
  for (const options of [{ order: null }, { order: { id: 'wrong' } }, { scopeError: Error('Denied') }]) {
    const h = await dataHarness(options)
    assert.ok((await h.deleteOrderItemsByIds('order', ['old'], 2)).error)
    assert.equal(h.requests.some(request => request.delete), false)
  }
  const h = await dataHarness()
  for (const [order, business] of [[null, 2], ['order', null], ['', 2], ['order', '']]) {
    assert.ok((await h.deleteOrderItemsByIds(order, ['old'], business)).error)
  }
  assert.equal(h.requests.length, 0)
})

test('data cleanup skips empty ids and returns delete errors', async () => {
  const failure = Error('Delete denied'), h = await dataHarness({ deleteError: failure })
  assert.equal((await h.deleteOrderItemsByIds('order', [], 2)).error, null)
  assert.equal(h.requests.length, 0)
  assert.equal((await h.deleteOrderItemsByIds('order', ['old'], 2)).error, failure)
})
