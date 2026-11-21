import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { productOptionalColumnsFallback } from '../src/utils/productPricePayload.js'

const missing = column => ({ code: 'PGRST204', message: `Could not find the '${column}' column of 'products' in the schema cache` })
test('optional column fallback removes only the named missing optional column, without mutating payload', () => {
  const payload = { name: 'Marco', price_mode: 'from', video_url: 'products/videos/clip.mp4', price: 10 }
  for (const column of ['price_mode', 'video_url']) {
    const expected = { ...payload }; delete expected[column]
    assert.deepEqual(productOptionalColumnsFallback(payload, missing(column)), expected)
    assert.deepEqual(productOptionalColumnsFallback(payload, { code: '42703', details: `column products.${column} does not exist` }), expected)
    assert.ok(Object.hasOwn(payload, column))
  }
  for (const error of [null, missing('other'), { code: '42501', message: 'video_url denied' }, missing('video_urls')])
    assert.equal(productOptionalColumnsFallback(payload, error), null)
})
async function apiFor(results) {
  const requests = []
  const supabase = { from(table) {
    const request = { table }; requests.push(request)
    return { insert(data) { request.data = data[0]; return this }, update(data) { request.data = data; return this }, select() { request.select = true; return this }, eq(...args) { request.filter = args; return this }, then(resolve) { return Promise.resolve(results[requests.indexOf(request)]).then(resolve) } }
  } }
  const source = (await readFile(new URL('../src/data/products.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const api = new Function('supabase', 'productOptionalColumnsFallback', `${source}; return { createProduct, updateProduct }`)(supabase, productOptionalColumnsFallback)
  return { api, requests }
}
for (const operation of ['createProduct', 'updateProduct']) {
  test(`${operation} recovers missing video, price or both in bounded retries with intact scope`, async () => {
    for (const columns of [['video_url'], ['price_mode'], ['video_url', 'price_mode'], ['price_mode', 'video_url']]) {
      const { api, requests } = await apiFor([...columns.map(column => ({ error: missing(column) })), { data: [{ id: 'saved' }], error: null }])
      const payload = { name: 'Marco', price: 10, price_mode: 'from', video_url: 'products/videos/clip.mp4' }
      const result = operation === 'createProduct' ? await api[operation](payload, 2) : await api[operation]('saved', payload)
      assert.equal(result.error, null)
      assert.equal(requests.length, columns.length + 1)
      assert.equal(result.data[0].id, 'saved')
      assert.equal(result.videoAvailable, columns.includes('video_url') ? false : undefined)
      assert.equal(result.priceModeAvailable, columns.includes('price_mode') ? false : undefined)
      const final = requests.at(-1)
      for (const column of columns) assert.equal(Object.hasOwn(final.data, column), false)
      assert.equal(final.data.price, 10)
      if (operation === 'createProduct') assert.equal(final.data.business_id, 2)
      else assert.deepEqual(final.filter, ['id', 'saved'])
      assert.equal(payload.video_url, 'products/videos/clip.mp4')
    }
  })
  test(`${operation} surfaces unrelated or repeated errors without discarding more fields`, async () => {
    for (const errors of [[missing('other')], [missing('video_url'), missing('video_url')], [{ code: '42501', message: 'video_url denied' }]]) {
      const { api, requests } = await apiFor(errors.map(error => ({ error })))
      const payload = { video_url: 'clip.mp4', price_mode: 'from' }
      const result = operation === 'createProduct' ? await api[operation](payload, 2) : await api[operation]('saved', payload)
      assert.equal(result.error, errors.at(-1))
      assert.equal(requests.length, errors.length)
    }
  })
}
