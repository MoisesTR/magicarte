import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('detail history filters by business and item before limiting, not the global latest movements', async () => {
  const source = (await readFile(new URL('../src/data/inventory.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const calls = []
  const result = { data: [{ id: 'movement' }], error: null }
  const query = Object.fromEntries(['select', 'eq', 'order', 'limit'].map(name => [name, (...args) => { calls.push([name, ...args]); return query }]))
  query.then = resolve => Promise.resolve(result).then(resolve)
  const client = { from: name => { calls.push(['from', name]); return query } }
  const fetch = new Function('supabase', `${source}; return fetchItemInventoryMovements`)(client)
  assert.deepEqual(await fetch(2, 'blue', 8), result)
  assert.deepEqual(calls, [['from', 'inventory_movements'], ['select', '*'], ['eq', 'business_id', 2], ['eq', 'inventory_item_id', 'blue'], ['order', 'occurred_at', { ascending: false }], ['limit', 8]])
})
