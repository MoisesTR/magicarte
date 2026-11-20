import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function dataWithClient(client) {
  const source = (await readFile(new URL('../src/data/today.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  return new Function('supabase', `${source}; return { fetchTodayPanel }`)(client)
}
function clientFor(results = {}) {
  const calls = []
  const client = { calls, from(table) {
    const call = { table, filters: [], orders: [] }
    calls.push(call)
    return {
      select(columns) { call.columns = columns; return this },
      eq(...args) { call.filters.push(args); return this },
      order(...args) { call.orders.push(args); return this },
      range(...args) { call.range = args; return this },
      then(resolve, reject) { return Promise.resolve(typeof results[table] === 'function' ? results[table](call) : results[table] || { data: [], error: null }).then(resolve, reject) },
    }
  } }
  return client
}
test('Hoy refuses unknown business ids before issuing any query', async () => {
  const client = clientFor()
  const { fetchTodayPanel } = await dataWithClient(client)
  for (const id of [null, undefined, '']) await assert.rejects(() => fetchTodayPanel(id), /business/i)
  assert.equal(client.calls.length, 0)
})
test('Hoy only reads existing tables, scopes every request and selects payment relationship', async () => {
  const client = clientFor({ orders: { data: [{ id: 'one', order_payments: [] }], error: null } })
  const { fetchTodayPanel } = await dataWithClient(client)
  const result = await fetchTodayPanel('business-2')
  assert.deepEqual(result, { orders: [{ id: 'one', order_payments: [] }], payments: [], inventory: [] })
  assert.deepEqual(client.calls.map(call => call.table).sort(), ['inventory_stock', 'order_payments', 'orders'])
  for (const call of client.calls) {
    assert.deepEqual(call.filters, [['business_id', 'business-2']])
    assert.deepEqual(call.range, [0, 499])
    assert.deepEqual(call.orders, [['id', { ascending: true }]])
  }
  assert.match(client.calls.find(call => call.table === 'orders').columns, /order_payments\(amount,method,paid_at\)/)
})
test('Hoy paginates past the API row cap without losing scope or stable ordering', async () => {
  const client = clientFor({ orders: call => ({ data: call.range[0] === 0 ? Array.from({ length: 500 }, (_, id) => ({ id })) : [{ id: 500 }], error: null }) })
  const { fetchTodayPanel } = await dataWithClient(client)
  assert.equal((await fetchTodayPanel('a')).orders.length, 501)
  const calls = client.calls.filter(call => call.table === 'orders')
  assert.deepEqual(calls.map(call => call.range), [[0, 499], [500, 999]])
  assert.deepEqual(calls[1].filters, [['business_id', 'a']])
})
for (const table of ['orders', 'order_payments', 'inventory_stock']) test(`Hoy propagates ${table} errors, never displaying partial financial totals`, async () => {
  const error = new Error('read failed')
  const { fetchTodayPanel } = await dataWithClient(clientFor({ [table]: { data: null, error } }))
  await assert.rejects(() => fetchTodayPanel('a'), /read failed/)
})
