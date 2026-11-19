import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function inventoryWithClient(client) {
  const source = (await readFile(new URL('../src/data/inventory.js', import.meta.url), 'utf8'))
    .replace(/^import .*supabaseClient.*$/m, '')
    .replaceAll('export ', '')
  return new Function('supabase', `${source}; return { fetchInventoryStock, createInventoryItem, updateInventoryItem }`)(client)
}

function mockClient(results) {
  const requests = []
  return { requests, from(table) {
    const request = { table, filters: [], orders: [] }
    requests.push(request)
    const query = {
      select(columns = '*') { request.columns = columns; return this },
      order(column, options) { request.orders.push([column, options]); return this },
      eq(column, value) { request.filters.push([column, value]); return this },
      insert(value) { request.insert = value; return this },
      update(value) { request.update = value; return this },
      single() { request.single = true; return this },
      then(resolve, reject) { return Promise.resolve(results[requests.indexOf(request)]).then(resolve, reject) },
    }
    return query
  } }
}

const missingHex = { code: '42703', message: 'column inventory_stock.color_hex does not exist' }

test('stock selects color columns while preserving business scope and sorting', async () => {
  const result = { data: [{ id: 'one', color_hex: '#ABCDEF', color_transparent: false }], error: null }
  const client = mockClient([result])
  const { fetchInventoryStock } = await inventoryWithClient(client)
  assert.deepEqual(await fetchInventoryStock(2), result)
  assert.equal(client.requests.length, 1)
  assert.match(client.requests[0].columns, /color_hex/)
  assert.match(client.requests[0].columns, /color_transparent/)
  assert.deepEqual(client.requests[0].filters, [['business_id', 2]])
  assert.deepEqual(client.requests[0].orders, [['is_low_stock', { ascending: false }], ['name', undefined]])
})

for (const error of [missingHex,
  { code: '42703', message: 'column inventory_stock.color_transparent does not exist' },
  { code: 'PGRST204', message: "Could not find the 'color_hex' column of 'inventory_stock' in the schema cache" },
]) {
  test(`stock retries once without color columns for ${error.code}: ${error.message}`, async () => {
    const result = { data: [{ id: 'old' }], error: null }
    const client = mockClient([{ data: null, error }, result])
    const { fetchInventoryStock } = await inventoryWithClient(client)
    assert.deepEqual(await fetchInventoryStock(2), result)
    assert.equal(client.requests.length, 2)
    assert.doesNotMatch(client.requests[1].columns, /color_hex|color_transparent|\*/)
    assert.deepEqual(client.requests[1].filters, client.requests[0].filters)
    assert.deepEqual(client.requests[1].orders, client.requests[0].orders)
  })
}

test('fallback errors are returned without a third request', async () => {
  const failed = { data: null, error: missingHex }
  const client = mockClient([failed, failed])
  const { fetchInventoryStock } = await inventoryWithClient(client)
  assert.deepEqual(await fetchInventoryStock(2), failed)
  assert.equal(client.requests.length, 2)
})

for (const error of [
  { code: '42501', message: 'permission denied' },
  { code: '42703', message: 'column inventory_stock.variant_color does not exist' },
  { code: 'PGRST205', message: "Could not find the table 'inventory_stock' in the schema cache" },
  { code: '500', message: 'color_hex request failed' },
]) {
  test(`does not mask unrelated errors: ${error.message}`, async () => {
    const failed = { data: null, error }
    const client = mockClient([failed])
    const { fetchInventoryStock } = await inventoryWithClient(client)
    assert.deepEqual(await fetchInventoryStock(2), failed)
    assert.equal(client.requests.length, 1)
  })
}

test('create and update persist color metadata and read all returned item fields without schema-dependent selects', async () => {
  const item = { name: 'Filamento', color_hex: '#ABCDEF', color_transparent: true }
  const result = { data: { id: 'one', ...item }, error: null }
  const client = mockClient([result, result])
  const { createInventoryItem, updateInventoryItem } = await inventoryWithClient(client)
  assert.deepEqual(await createInventoryItem(item, 2), result)
  assert.deepEqual(await updateInventoryItem('one', item, 2), result)
  assert.deepEqual(client.requests[0].insert, [{ ...item, business_id: 2 }])
  assert.deepEqual(client.requests[1].update, item)
  assert.deepEqual(client.requests[1].filters, [['id', 'one'], ['business_id', 2]])
  assert.equal(client.requests[0].columns, '*')
  assert.equal(client.requests[1].columns, '*')
})
