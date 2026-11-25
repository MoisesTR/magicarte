import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function api() {
  const requests = []
  const client = { from(table) {
    const request = { table, filters: [] }; requests.push(request)
    return {
      select(columns) { request.columns = columns; return this },
      eq(...args) { request.filters.push(['eq', ...args]); return this },
      in(...args) { request.filters.push(['in', ...args]); return this },
      order(...args) { request.order = args; return this },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) },
    }
  } }
  const source = (await readFile(new URL('../src/data/calcQuotes.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  return { requests, ...new Function('supabase', `${source}; return { fetchCostQuotes, fetchProductCostQuotes }`)(client) }
}
test('cost quote picker reads this business only with name, date and summary', async () => {
  const h = await api()
  assert.throws(() => h.fetchCostQuotes(null), /business/i)
  await h.fetchCostQuotes('business')
  assert.equal(h.requests.length, 1)
  const request = h.requests[0]
  assert.equal(request.table, 'calc_quotes')
  for (const column of ['id', 'name', 'updated_at', 'summary']) assert.ok(request.columns.includes(column))
  assert.deepEqual(request.filters, [['eq', 'business_id', 'business']])
  assert.deepEqual(request.order, ['updated_at', { ascending: false }])
})
test('order cost query joins products to cost quotes once with explicit business scope', async () => {
  const h = await api()
  assert.throws(() => h.fetchProductCostQuotes(['a'], null), /business/i)
  await h.fetchProductCostQuotes(['a', 'b', 'a', null], 'business')
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].table, 'products')
  assert.match(h.requests[0].columns, /calc_quote_id/)
  assert.match(h.requests[0].columns, /cost_quote:calc_quotes!products_calc_quote_id_fkey\(id, summary\)/)
  assert.deepEqual(h.requests[0].filters, [['eq', 'business_id', 'business'], ['eq', 'cost_quote.business_id', 'business'], ['in', 'id', ['a', 'b']]])
})
test('an empty product list performs no database request', async () => {
  const h = await api()
  assert.deepEqual(await h.fetchProductCostQuotes([], 'business'), { data: [], error: null })
  assert.equal(h.requests.length, 0)
})

test('private cost hook batches loaded orders and editor products, maps the join and propagates errors', async () => {
  const source = (await readFile(new URL('../src/hooks/useOrderCostQuotes.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export default ', '')
  let options, readArgs
  const useHook = new Function('useQuery', 'fetchProductCostQuotes', `${source}; return useOrderCostQuotes`)(o => { options = o; return o }, async (...args) => { readArgs = args; return { data: [{ id: 'a', cost_quote: { id: 'q', summary: { unitCost: 2 } } }, { id: 'b', cost_quote: null }], error: null } })
  useHook([{ order_items: [{ product_id: 'a' }, { product_id: null }] }], [{ product_id: 'b' }, { product_id: 'a' }], 'business', true)
  assert.deepEqual(await options.queryFn(), { a: { id: 'q', summary: { unitCost: 2 } } })
  assert.deepEqual(readArgs, [['a', 'b'], 'business'])
  assert.equal(options.refetchOnWindowFocus, false)
  assert.equal(options.retry, false)
  useHook([], [], 'business', true)
  assert.equal(options.enabled, false)
  useHook([{ order_items: [{ product_id: 'a' }] }], [], 'business', false)
  assert.equal(options.enabled, false)
  const error = Error('denied')
  const failing = new Function('useQuery', 'fetchProductCostQuotes', `${source}; return useOrderCostQuotes`)(o => o, async () => ({ error }))
  await assert.rejects(failing([{ order_items: [{ product_id: 'a' }] }], [], 'business', true).queryFn(), /denied/)
})
