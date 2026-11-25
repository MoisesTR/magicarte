import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCatalogCard,
  loadCatalogImage,
} from '../src/utils/catalogCanvas.js'

function fakeDocument({ taint = false } = {}) {
  const calls = []
  let exports = 0
  const context = {
    fillRect(...args) {
      calls.push(['rect', ...args])
    },
    fillText(...args) {
      calls.push(['text', ...args])
    },
    drawImage(...args) {
      calls.push(['image', ...args])
    },
    measureText: (text) => ({ width: text.length * 22 }),
  }
  const canvas = {
    getContext: () => context,
    toBlob(callback, type, quality) {
      calls.push(['export', type, quality])
      calls.push(['dimensions', canvas.width, canvas.height])
      if (taint && exports++ === 0)
        throw Object.assign(new Error('tainted'), { name: 'SecurityError' })
      callback(new Blob(['jpeg'], { type }))
    },
  }
  return {
    calls,
    canvas,
    documentObject: {
      fonts: { ready: Promise.resolve().then(() => calls.push(['fonts'])) },
      createElement: () => canvas,
    },
  }
}
test('canvas waits for fonts, exports 1080x1350 JPEG 0.9 and resolves main plus max three thumbnails', async () => {
  const fake = fakeDocument()
  const resolved = []
  const result = await createCatalogCard(
    {
      name: 'Esfera',
      image_url: 'main',
      secondary_images: ['a', 'b', 'c', 'd'],
      price: 300,
      width: 8.9,
      length: 8.9,
    },
    [],
    {
      documentObject: fake.documentObject,
      resolveImageUrl: (path) => {
        resolved.push(path)
        return `public:${path}`
      },
      loadImage: async (url) => ({
        url,
        naturalWidth: 1200,
        naturalHeight: 800,
      }),
    }
  )
  assert.deepEqual(resolved, ['main', 'a', 'b', 'c'])
  assert.ok(
    fake.calls.some(
      (call) => call[0] === 'dimensions' && call[1] === 1080 && call[2] === 1350
    )
  )
  assert.equal(fake.canvas.width, 0)
  assert.equal(fake.calls[0][0], 'fonts')
  assert.equal(fake.calls.filter((call) => call[0] === 'image').length, 4)
  assert.ok(
    fake.calls.some((call) => call[0] === 'text' && call[1] === 'Magic Arte')
  )
  assert.ok(
    fake.calls.some((call) => call[0] === 'text' && call[1] === 'magicarte.net')
  )
  assert.ok(
    fake.calls.some(
      (call) => call[0] === 'text' && call[1] === 'Medidas: 8.9 × 8.9 cm'
    )
  )
  assert.ok(
    fake.calls.some(
      (call) =>
        call[0] === 'export' && call[1] === 'image/jpeg' && call[2] === 0.9
    )
  )
  assert.equal(result.blob.type, 'image/jpeg')
  assert.equal(result.missingPhotos, false)
})
test('failed or absent photos draw neutral placeholders without aborting export', async () => {
  for (const image_url of ['', 'broken']) {
    const fake = fakeDocument()
    const result = await createCatalogCard(
      { name: 'Sin foto', image_url },
      [],
      {
        documentObject: fake.documentObject,
        resolveImageUrl: (value) => value,
        loadImage: async () => {
          throw new Error('CORS')
        },
      }
    )
    assert.equal(result.missingPhotos, true)
    assert.ok(
      fake.calls.some(
        (call) => call[0] === 'text' && call[1] === 'Imagen no disponible'
      )
    )
    assert.equal(result.blob.type, 'image/jpeg')
  }
})
test('tainted export resets the canvas and retries with placeholders', async () => {
  const fake = fakeDocument({ taint: true })
  const result = await createCatalogCard(
    { name: 'Foto', image_url: 'photo' },
    [],
    {
      documentObject: fake.documentObject,
      resolveImageUrl: (value) => value,
      loadImage: async () => ({ naturalWidth: 100, naturalHeight: 100 }),
    }
  )
  assert.equal(result.missingPhotos, true)
  assert.equal(fake.calls.filter((call) => call[0] === 'export').length, 2)
})
test('canvas omits price when unchecked', async () => {
  const fake = fakeDocument()
  await createCatalogCard(
    { name: 'Foto', price: 999, price_mode: 'quote' },
    [],
    {
      documentObject: fake.documentObject,
      resolveImageUrl: (value) => value,
      includePrice: false,
    }
  )
  assert.ok(
    !fake.calls.some(
      (call) => call[0] === 'text' && /C\$|Precio según diseño/.test(call[1])
    )
  )
})
test('image loading sets anonymous CORS before assigning src and handles errors', async () => {
  const events = []
  const makeImage = () => ({
    naturalWidth: 100,
    naturalHeight: 100,
    set crossOrigin(value) {
      events.push(value)
    },
    set src(value) {
      events.push(value)
      queueMicrotask(() => this.onload())
    },
  })
  assert.ok(await loadCatalogImage('public:photo', { createImage: makeImage }))
  assert.deepEqual(events, ['anonymous', 'public:photo'])
  await assert.rejects(
    loadCatalogImage('broken', {
      createImage: () => ({
        set src(value) {
          queueMicrotask(() => this.onerror(new Error(value)))
        },
      }),
    }),
    /image/i
  )
})
