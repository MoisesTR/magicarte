import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function api({ row, error = null, designs = { data: [], error: null, available: true } } = {}) {
  const requests = [], designReads = []
  const client = { from(table) {
    const request = { table, filters: [] }; requests.push(request)
    return {
      select(columns) { request.columns = columns; return this },
      eq(...args) { request.filters.push(args); return this },
      order() { return this },
      maybeSingle() { request.single = true; return this },
      then(resolve, reject) { return Promise.resolve({ data: request.single ? row : row ? [row] : [], error }).then(resolve, reject) },
    }
  } }
  const source = (await readFile(new URL('../src/data/orders.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const methods = new Function('supabase', 'TABLE', 'fetchOrderItemDesigns', `${source}; return { fetchOrderForBusiness, fetchOrdersForBusiness }`)(client, { ORDERS: 'orders' }, async (...args) => { designReads.push(args); return designs })
  return { ...methods, requests, designReads }
}
test('detail lookup refuses missing ids or scope without any read', async () => {
  const h = await api()
  for (const [id, business] of [[null, 'b'], ['o', null], ['', 'b'], ['o', '']]) {
    assert.ok((await h.fetchOrderForBusiness(id, business)).error)
  }
  assert.equal(h.requests.length, 0)
})
test('by-id read has exact list relationships, explicit business/id scope and design enrichment', async () => {
  const row = { id: 'o', business_id: 'b', order_items: [{ id: 'i', presentation_label: 'Pack', units_per_presentation: 6 }], order_payments: [{ id: 'p', amount: 20 }], clients: { id: 'c', name: 'Ana' } }
  const design = { order_item_id: 'i', design_name: 'Historical design', quantity: 6, note: 'Do not lose' }
  const h = await api({ row, designs: { data: [design], error: null, available: true } })
  const result = await h.fetchOrderForBusiness('o', 'b')
  assert.deepEqual(h.requests[0].filters, [['id', 'o'], ['business_id', 'b']])
  assert.deepEqual(h.designReads, [[['i'], 'b']])
  assert.deepEqual(result.data.order_items[0].order_item_designs, [design])
  assert.deepEqual(result.data.order_payments, row.order_payments)
  assert.deepEqual(result.data.clients, row.clients)
  assert.equal(result.data.order_items[0].units_per_presentation, 6)
  await h.fetchOrdersForBusiness('b')
  assert.equal(h.requests[0].columns, h.requests[1].columns)
})
test('detail refuses an unexpected wrong-business or wrong-id row before design reads', async () => {
  for (const row of [{ id: 'o', business_id: 'wrong' }, { id: 'wrong', business_id: 'b' }]) {
    const h = await api({ row })
    const result = await h.fetchOrderForBusiness('o', 'b')
    assert.equal(result.data, null)
    assert.ok(result.error)
    assert.equal(h.designReads.length, 0)
  }
})
test('detail propagates read/design failures and preserves optional-design unavailable behavior', async () => {
  const row = { id: 'o', business_id: 'b', order_items: [{ id: 'i' }] }
  const failure = Error('denied')
  for (const options of [{ error: failure }, { row, designs: { error: failure } }]) {
    const h = await api(options)
    assert.equal((await h.fetchOrderForBusiness('o', 'b')).error, failure)
  }
  const h = await api({ row, designs: { available: false, error: null } })
  assert.deepEqual((await h.fetchOrderForBusiness('o', 'b')).data, row)
})
