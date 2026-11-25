import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)

test('Admin wires catalog entry, current filtered selection and per-product checkboxes without writes', async () => {
  const source = await readFile(
    new URL('../src/pages/Admin.jsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /Crear catálogo/)
  assert.match(source, /WhatsAppCatalog/)
  assert.match(source, /visibleProducts=\{filteredProducts\}/)
  assert.match(source, /type='checkbox'/)
  assert.match(source, /catalogMode/)
})
test('catalog renders selection bar with only price option, safe-area and mobile controls', async () => {
  const source = await readFile(
    new URL('../src/components/WhatsAppCatalog.jsx', import.meta.url),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (name === 'react') return { ...React, useEffect() {} }
      if (name.includes('/utils/whatsappCatalog'))
        return require('../src/utils/whatsappCatalog.js')
      if (name.includes('/data/')) return { fetchPublicPresentations() {} }
      if (name.includes('/utils/getImageUrl'))
        return { getImageUrl: (value) => value }
      if (name.includes('/utils/catalogCanvas'))
        return { createCatalogCard() {} }
      if (name.includes('/utils/catalogDelivery'))
        return {
          shareCatalogFiles() {},
          saveCatalogToFolder() {},
          downloadCatalogFiles() {},
        }
      return require(name)
    },
    module,
    module.exports
  )
  const html = renderToStaticMarkup(
    React.createElement(module.exports.default, {
      products: [{ id: 'a' }],
      visibleProducts: [{ id: 'a' }],
      selectedIds: ['a'],
      onSelectionChange() {},
      onCancel() {},
      businessId: 1,
    })
  )
  for (const copy of [
    'Catálogo para WhatsApp',
    '1 seleccionados',
    'Seleccionar todos (visibles con el filtro actual)',
    'Limpiar',
    'Generar imágenes',
    'Incluir precio',
    'Cancelar',
  ])
    assert.ok(html.includes(copy), copy)
  assert.match(html, /safe-area-inset-bottom/)
  assert.match(html, /fixed[^"]*bottom-0/)
  assert.match(html, /type="checkbox"[^>]*checked/)
  assert.match(source, /getImageUrl/)
  assert.doesNotMatch(source, /\.from\(|\.insert\(|\.update\(|\.delete\(/)
})

async function catalogHarness({
  fetchPresentations = async () => ({ data: [] }),
  createCard = async () => ({
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    missingPhotos: false,
  }),
  capabilities = {},
} = {}) {
  const source = await readFile(
    new URL('../src/components/WhatsAppCatalog.jsx', import.meta.url),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  })
  const slots = []
  const effects = []
  const pendingEffects = []
  const urls = { made: [], revoked: [] }
  let cursor = 0
  let effectCursor = 0
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === 'function' ? value(slots[index]) : value
        },
      ]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect(effect, deps) {
      const index = effectCursor++
      const previous = effects[index]
      if (!previous || deps.some((value, i) => value !== previous.deps[i]))
        pendingEffects.push(() => {
          previous?.cleanup?.()
          effects[index] = { deps, cleanup: effect() }
        })
    },
  }
  const module = { exports: {} }
  new Function(
    'require',
    'module',
    'exports',
    'URL',
    'requestAnimationFrame',
    'navigator',
    'window',
    code
  )(
    (name) => {
      if (name === 'react') return hooks
      if (name.includes('/utils/whatsappCatalog'))
        return require('../src/utils/whatsappCatalog.js')
      if (name.includes('/data/'))
        return { fetchPublicPresentations: fetchPresentations }
      if (name.includes('/utils/getImageUrl'))
        return { getImageUrl: (value) => `public:${value}` }
      if (name.includes('/utils/catalogCanvas'))
        return { createCatalogCard: createCard }
      if (name.includes('/utils/catalogDelivery'))
        return {
          shareCatalogFiles: async () => {},
          saveCatalogToFolder: async () => {},
          downloadCatalogFiles: async () => {},
        }
      return require(name)
    },
    module,
    module.exports,
    {
      createObjectURL(file) {
        const url = `blob:${file.name}`
        urls.made.push(url)
        return url
      },
      revokeObjectURL(url) {
        urls.revoked.push(url)
      },
    },
    (callback) => callback(),
    capabilities,
    {}
  )
  const props = {
    products: [
      { id: 'a', name: 'Esféra', image_url: 'a.jpg' },
      { id: 'b', name: 'Marco', image_url: 'b.jpg' },
    ],
    visibleProducts: [],
    selectedIds: ['a', 'b'],
    onSelectionChange() {},
    onCancel() {},
    businessId: 1,
  }
  return {
    props,
    urls,
    render() {
      cursor = 0
      effectCursor = 0
      const element = module.exports.default(props)
      pendingEffects.splice(0).forEach((effect) => effect())
      return element
    },
    unmount() {
      effects.forEach((effect) => effect.cleanup?.())
    },
  }
}
function elementWithText(element, type, text) {
  if (!element || typeof element !== 'object') return null
  if (element.type === type && element.props.children === text) return element
  for (const child of React.Children.toArray(element.props?.children)) {
    const found = elementWithText(child, type, text)
    if (found) return found
  }
  return null
}

test('catalog generation reads only selected presentations and creates ordered JPEG previews with missing-photo report', async () => {
  const calls = []
  const harness = await catalogHarness({
    fetchPresentations: async (...args) => {
      calls.push(['read', ...args])
      return { data: [{ product_id: 'b', label: 'Set', price: 3 }] }
    },
    createCard: async (product, rows, options) => {
      calls.push([
        'draw',
        product.id,
        rows,
        options.includePrice,
        options.resolveImageUrl(product.image_url),
      ])
      return {
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        missingPhotos: product.id === 'b',
      }
    },
  })
  const element = harness.render()
  const generate = elementWithText(element, 'button', 'Generar imágenes')
  const first = generate.props.onClick()
  await generate.props.onClick()
  await first
  assert.deepEqual(calls[0], ['read', 1, ['a', 'b']])
  assert.equal(calls.filter((call) => call[0] === 'read').length, 1)
  assert.deepEqual(
    calls
      .filter((call) => call[0] === 'draw')
      .map((call) => [call[1], call[3], call[4]]),
    [
      ['a', true, 'public:a.jpg'],
      ['b', true, 'public:b.jpg'],
    ]
  )
  const html = renderToStaticMarkup(harness.render())
  assert.match(html, /2 imágenes listas/)
  assert.match(html, /Fotos no disponibles: Marco/)
  assert.match(html, /01-esfera.jpg/)
  assert.match(html, /02-marco.jpg/)
  assert.match(html, /Descargar imágenes/)
  harness.unmount()
  assert.deepEqual(harness.urls.revoked, harness.urls.made)
})
test('selection changes cancel pending work without stale files or orphaned URLs', async () => {
  let finish
  const harness = await catalogHarness({
    createCard: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  const generate = elementWithText(
    harness.render(),
    'button',
    'Generar imágenes'
  ).props.onClick()
  while (!finish) await Promise.resolve()
  harness.props.selectedIds = ['a']
  harness.render()
  finish({ blob: new Blob(['jpeg']), missingPhotos: false })
  await generate
  const html = renderToStaticMarkup(harness.render())
  assert.doesNotMatch(html, /imágenes listas/)
  assert.deepEqual(harness.urls.made, [])
  harness.unmount()
})
test('unchecking price skips presentation reads and passes includePrice false', async () => {
  const calls = []
  const harness = await catalogHarness({
    fetchPresentations: () => assert.fail('no price read'),
    createCard: async (product, rows, options) => {
      calls.push(options.includePrice)
      return { blob: new Blob(['jpeg']), missingPhotos: false }
    },
  })
  let element = harness.render()
  function checkbox(node) {
    if (node?.type === 'input') return node
    for (const child of React.Children.toArray(node?.props?.children)) {
      const found = checkbox(child)
      if (found) return found
    }
  }
  checkbox(element).props.onChange({ target: { checked: false } })
  harness.render()
  element = harness.render()
  await elementWithText(element, 'button', 'Generar imágenes').props.onClick()
  assert.deepEqual(calls, [false, false])
  harness.unmount()
})
