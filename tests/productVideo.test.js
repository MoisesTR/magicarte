import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { validateProductVideo, uploadProductVideo, readVideoDuration } from '../src/utils/productVideo.js'
import { COLUMNS, TABLE } from '../src/utils/constants.js'
import { newProductForm } from '../src/utils/quoteForms.js'

const file = { name: 'clip.mp4', type: 'video/mp4', size: 12 * 1024 * 1024 }
test('MP4 validation accepts limits and rejects MOV, wrong MIME and extensions', () => {
  assert.equal(validateProductVideo(file, 30), null)
  assert.equal(validateProductVideo({ ...file, name: 'CLIP.MP4', size: 25 * 1024 * 1024 }, 60), null)
  assert.equal(validateProductVideo({ ...file, type: '' }, 10), null)
  for (const change of [{ name: 'clip.mov', type: 'video/quicktime' }, { type: 'video/quicktime' }, { name: 'clip.mp4.mov' }, { type: 'image/png' }])
    assert.equal(validateProductVideo({ ...file, ...change }, 10), 'Suba el video en formato MP4.')
})
test('video validation rejects oversized files and invalid or excessive durations', () => {
  assert.match(validateProductVideo({ ...file, size: 25 * 1024 * 1024 + 1 }, 10), /25 MB/)
  assert.match(validateProductVideo(file, 60.01), /60 segundos/)
  for (const duration of [0, -1, NaN, Infinity, null]) assert.ok(validateProductVideo(file, duration))
  assert.equal(validateProductVideo(file), null)
})
test('direct upload uses images bucket, an MP4 path and explicit content type without compression', async () => {
  const calls = []
  const client = { storage: { from(bucket) { return { async upload(...args) { calls.push([bucket, ...args]); return { error: null } } } } } }
  const path = await uploadProductVideo(file, { client, duration: 30, now: () => 123, random: () => 'abc' })
  assert.equal(path, 'products/videos/123-abc.mp4')
  assert.deepEqual(calls, [['images', path, file, { contentType: 'video/mp4', upsert: false }]])
  await assert.rejects(uploadProductVideo(file, { client, duration: 61 }), /60 segundos/)
  assert.equal(calls.length, 1)
  const error = new Error('denied')
  client.storage.from = () => ({ upload: async () => ({ error }) })
  await assert.rejects(uploadProductVideo(file, { client, duration: 20 }), error)
})
function metadataBrowser() {
  const calls = []
  const video = { duration: 20, removeAttribute: name => calls.push(name), load: () => calls.push('load') }
  return { video, calls, document: { createElement: () => video }, url: { createObjectURL: () => 'blob:clip', revokeObjectURL: value => calls.push(value) } }
}
test('duration metadata probe cleans up object URL after success, error and cancellation', async () => {
  for (const outcome of ['success', 'error', 'abort']) {
    const browser = metadataBrowser()
    const controller = new AbortController()
    const promise = readVideoDuration(file, { ...browser, signal: controller.signal })
    assert.equal(browser.video.hidden, true)
    assert.equal(browser.video.preload, 'metadata')
    if (outcome === 'success') { browser.video.onloadedmetadata(); assert.equal(await promise, 20) }
    else { if (outcome === 'error') browser.video.onerror(); else controller.abort(); await assert.rejects(promise) }
    assert.ok(browser.calls.includes('blob:clip'))
    assert.ok(browser.calls.includes('src'))
    assert.equal(browser.video.onloadedmetadata, null)
    assert.equal(browser.video.onerror, null)
  }
})
test('product video has a nullable default and one unapplied additive migration', async () => {
  assert.equal(newProductForm().video_url, null)
  assert.match(COLUMNS[TABLE.PRODUCT], /\bvideo_url\b/)
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  const matches = files.filter(name => name.endsWith('_add_product_video_url.sql'))
  assert.equal(matches.length, 1)
  assert.ok(matches[0] > '20261121160523_add_product_price_mode.sql')
  assert.equal((await readFile(new URL(`../supabase/migrations/${matches[0]}`, import.meta.url), 'utf8')).trim(), 'alter table public.products add column video_url text null;')
})
test('admin wires optional video beside photos, retains path and blocks saving during upload', async () => {
  const admin = await readFile(new URL('../src/pages/Admin.jsx', import.meta.url), 'utf8')
  const field = await readFile(new URL('../src/components/ProductVideoField.jsx', import.meta.url), 'utf8')
  assert.match(admin, /<ProductGallery[\s\S]*?<ProductVideoField/)
  assert.match(admin, /video_url: product.video_url \|\| null/)
  assert.match(admin, /videoBusy.current/)
  assert.match(admin, /videoAvailable === false/)
  for (const copy of ['Video (opcional)', 'Quitar video', 'Subiendo video', 'MP4', 'H.264']) assert.ok(field.includes(copy), copy)
  assert.match(field, /accept=['"]video\/mp4,\.mp4['"]/)
  assert.match(field, /<video[^>]*muted[^>]*controls/)
  assert.match(field, /getImageUrl\(value\)/)
  assert.doesNotMatch(field, /compress-image|uploadCompressedImage|storage.*remove/)
})

test('admin video field renders linked help, validation accept and a removable muted preview', async () => {
  const { createRequire } = await import('node:module')
  const { transform } = await import('esbuild')
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const helpers = await import('../src/utils/productVideo.js')
  const require = createRequire(import.meta.url)
  const source = await readFile(new URL('../src/components/ProductVideoField.jsx', import.meta.url), 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name.endsWith('/supabaseClient')) return { supabase: {} }
    if (name.endsWith('/getImageUrl')) return { getImageUrl: path => `public/${path}` }
    if (name.endsWith('/productVideo.js')) return helpers
    return require(name)
  }, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.default, { value: 'products/videos/clip.mp4', onChange() {}, onBusyChange() {} }))
  assert.match(html, /for="product-video"/)
  assert.match(html, /accept="video\/mp4,\.mp4"/)
  assert.match(html, /aria-describedby="product-video-help"/)
  assert.match(html, /<video[^>]*src="public\/products\/videos\/clip.mp4"[^>]*muted=""[^>]*controls=""[^>]*playsinline=""/)
  assert.match(html, /Quitar video/)
})
