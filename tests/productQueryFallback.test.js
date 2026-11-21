import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { COLUMNS, TABLE } from '../src/utils/constants.js'
import { productOptionalColumnsFallback } from '../src/utils/productPricePayload.js'

const missing = column => ({ code: '42703', message: `column products.${column} does not exist` })
async function queryApi(results) {
  const requests = []
  const supabase = { from(table) {
    const request = { table, filters: [] }; requests.push(request)
    return {
      select(columns) { request.columns = columns; return this },
      filter(...args) { request.filters.push(args); return this },
      order(...args) { request.order = args; return this },
      then(resolve, reject) { return Promise.resolve(results[requests.indexOf(request)]).then(resolve, reject) },
    }
  } }
  const source = (await readFile(new URL('../src/hooks/useSupabaseQuery.jsx', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const api = new Function('supabase', 'COLUMNS', 'TABLE', 'productOptionalColumnsFallback', 'useQuery', `${source}; return useSupabaseQuery`)(supabase, COLUMNS, TABLE, productOptionalColumnsFallback, options => options)
  return { api, requests }
}
test('explicit product reads recover missing video or both optional columns, retaining every filter and ordering', async () => {
  for (const columns of [['video_url'], ['price_mode', 'video_url'], ['video_url', 'price_mode']]) {
    const data = [{ id: 'frame', name: 'Marco', image_url: 'frame.webp' }]
    const { api, requests } = await queryApi([...columns.map(column => ({ error: missing(column) })), { data, error: null }])
    const options = { filters: [{ column: 'business_id', value: 2 }, { column: 'id', value: 'frame' }, { column: 'is_visible', value: true }], order: { column: 'created_at', ascending: false } }
    const result = await api(TABLE.PRODUCT, options).queryFn()
    assert.equal(result, data)
    assert.equal(requests.length, columns.length + 1)
    assert.equal(requests[0].columns, COLUMNS[TABLE.PRODUCT])
    for (const request of requests) {
      assert.deepEqual(request.filters, [['business_id', 'eq', 2], ['id', 'eq', 'frame'], ['is_visible', 'eq', true]])
      assert.deepEqual(request.order, ['created_at', { ascending: false, nullsFirst: false }])
      assert.equal(request.table, TABLE.PRODUCT)
      assert.notEqual(request.columns, '*')
      assert.ok(request.columns.includes('image_url'))
    }
    for (const column of columns) assert.ok(!requests.at(-1).columns.split(', ').includes(column))
    assert.ok(COLUMNS[TABLE.PRODUCT].includes('video_url'))
  }
})
test('product read fallback stops on authorization, other columns and repeated missing-column errors', async () => {
  for (const errors of [[{ code: '42501', message: 'video_url denied' }], [missing('other')], [missing('video_url'), missing('video_url')]]) {
    const { api, requests } = await queryApi(errors.map(error => ({ error })))
    await assert.rejects(api(TABLE.PRODUCT).queryFn(), error => error === errors.at(-1))
    assert.equal(requests.length, errors.length)
  }
})
test('non-product reads retain their ordinary error and query behavior without optional fallback', async () => {
  const error = missing('video_url')
  const { api, requests } = await queryApi([{ error }])
  await assert.rejects(api(TABLE.CATEGORIES, { filters: [{ column: 'business_id', operator: 'neq', value: 3 }] }).queryFn(), failure => failure === error)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].columns, COLUMNS[TABLE.CATEGORIES])
  assert.deepEqual(requests[0].filters, [['business_id', 'neq', 3]])
})
