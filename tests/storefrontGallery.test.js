import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { galleryIndex, swipeDirection, thumbnailOverflow } from '../src/utils/storefrontGallery.js'

test('gallery indices wrap in both directions, including large offsets', () => {
  assert.equal(galleryIndex(4, 1, 5), 0)
  assert.equal(galleryIndex(0, -1, 5), 4)
  assert.equal(galleryIndex(1, 12, 5), 3)
  assert.equal(galleryIndex(1, -12, 5), 4)
})
test('empty and single-image galleries stay at zero', () => {
  for (const count of [0, 1]) for (const step of [-1, 1]) assert.equal(galleryIndex(0, step, count), 0)
})
test('horizontal swipes meet a 40px threshold and ignore vertical movement', () => {
  assert.equal(swipeDirection(-40, 0), 1)
  assert.equal(swipeDirection(40, 10), -1)
  assert.equal(swipeDirection(-39, 0), 0)
  assert.equal(swipeDirection(39, 0), 0)
  assert.equal(swipeDirection(-60, 80), 0)
  assert.equal(swipeDirection(40, 40), 0)
  assert.equal(swipeDirection(-20, 0, 20), 1)
})
test('thumbnail edge hints follow actual scroll overflow with rounding tolerance', () => {
  assert.deepEqual(thumbnailOverflow(0, 300, 300), { left: false, right: false })
  assert.deepEqual(thumbnailOverflow(0, 300, 700), { left: false, right: true })
  assert.deepEqual(thumbnailOverflow(150, 300, 700), { left: true, right: true })
  assert.deepEqual(thumbnailOverflow(399.5, 300, 700), { left: true, right: false })
})
test('ProductDetail delegates public gallery without replacing the admin photo editor', async () => {
  const detail = await readFile(new URL('../src/pages/ProductDetail.jsx', import.meta.url), 'utf8')
  assert.match(detail, /import StorefrontProductGallery from '..\/components\/StorefrontProductGallery'/)
  assert.match(detail, /<StorefrontProductGallery[\s\S]*?key=\{product.id\}[\s\S]*?images=\{/)
  assert.doesNotMatch(detail, /setLightboxIndex|setSelectedImage/)
  const gallery = await readFile(new URL('../src/components/StorefrontProductGallery.jsx', import.meta.url), 'utf8')
  for (const text of ['Foto anterior', 'Foto siguiente', 'Toca para ampliar', 'ArrowLeft', 'ArrowRight', 'Escape', 'onTouchCancel', 'aria-modal', 'focus-visible', 'ResizeObserver']) assert.ok(gallery.includes(text), text)
  assert.match(gallery, /scrollIntoView\(\{[^}]*behavior: 'smooth'[^}]*inline: 'nearest'/)
  assert.match(gallery, /suppressClick.current/)
  assert.match(gallery, /setSelectedIndex\(current => galleryIndex/)
})

test('public gallery renders accessible mobile controls only for multiple images', async () => {
  const { Buffer } = await import('node:buffer')
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const { transform } = await import('esbuild')
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const require = createRequire(import.meta.url)
  const sourceUrl = new URL('../src/components/StorefrontProductGallery.jsx', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' })
  const resolved = code.replace(/from "([^"]+)"/g, (_, specifier) => `from "${specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : pathToFileURL(require.resolve(specifier)).href}"`)
  const Gallery = (await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)).default
  for (const count of [1, 12]) {
    const html = renderToStaticMarkup(React.createElement(Gallery, { images: Array.from({ length: count }, (_, index) => `data:image/png,${index}`), name: 'Regalo' }))
    assert.match(html, /Toca para ampliar/)
    assert.match(html, /aria-label="Ampliar foto 1 de Regalo"/)
    assert.equal(html.includes('aria-label="Foto anterior"'), count > 1)
    assert.equal(html.includes('aria-label="Foto siguiente"'), count > 1)
    assert.equal(html.includes(`1 / ${count}`), count > 1)
    assert.equal((html.match(/aria-label="Ver foto /g) || []).length, count > 1 ? count : 0)
    if (count > 1) {
      assert.match(html, /md:opacity-0/)
      assert.match(html, /md:group-focus-within:opacity-100/)
      assert.match(html, /aria-current="true"/)
      assert.match(html, /min-h-11 min-w-11/)
    }
  }
})
