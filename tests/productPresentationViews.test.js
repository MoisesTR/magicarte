import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Buffer } from 'node:buffer'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
async function load(name) {
  const url = new URL(`../src/components/${name}.jsx`, import.meta.url)
  const { code } = await transform(await readFile(url, 'utf8'), {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'esm',
  })
  const resolved = code.replace(
    /from "([^"]+)"/g,
    (_, specifier) =>
      `from "${specifier.startsWith('.') ? new URL(specifier, url).href : pathToFileURL(require.resolve(specifier)).href}"`
  )
  return (
    await import(
      `data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`
    )
  ).default
}
test('design picker renders touch controls, live count, chosen notes and custom entry without fixed widths', async () => {
  const Picker = await load('ProductDesignPicker')
  const html = renderToStaticMarkup(
    React.createElement(Picker, {
      designs: [
        { id: 'p', name: 'Pikachu', image_url: 'https://example.test/p' },
      ],
      selections: [
        { design_id: 'p', design_name: 'Pikachu', quantity: 4, note: 'Ana' },
      ],
      packs: 1,
      units: 6,
      onChange() {},
    })
  )
  assert.match(html, /Elegidos 4 de 6/)
  assert.match(html, /faltan 2/)
  assert.match(html, /Ej.: nombre para esta pieza/)
  assert.match(html, /Otro diseño/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /min-h-10/)
  assert.match(html, /min-w-0/)
  assert.match(html, /value="Ana"/)
  assert.doesNotMatch(html, /w-\[\d+px\]/)
})
test('presentation selector shows label, pack total, per-piece hint and preserved inactive snapshot', async () => {
  const Selector = await load('ProductPresentationSelector')
  const html = renderToStaticMarkup(
    React.createElement(Selector, {
      presentations: [{ id: 'p', label: 'Paquete de 6', units: 6, price: 690 }],
      selected: { id: null, label: 'Anterior', units: 3, price: 400 },
      onChange() {},
    })
  )
  assert.match(html, /Paquete de 6 · C\$690/)
  assert.match(html, /C\$115 c\/u/)
  assert.match(html, /Anterior/)
})
test('all business forms and order detail/print paths use shared presentation integration', async () => {
  for (const file of [
    'Admin.jsx',
    'hikari/Products.jsx',
    'joyeria/Products.jsx',
  ]) {
    const source = await readFile(
      new URL(`../src/pages/${file}`, import.meta.url),
      'utf8'
    )
    assert.match(source, /<ProductOptionsEditor/)
    assert.match(source, /productOptions\.save/)
    assert.match(source, /productOptions\.price/)
  }
  const orders = await readFile(
    new URL('../src/pages/Orders.jsx', import.meta.url),
    'utf8'
  )
  assert.match(orders, /<OrderItemOptions/)
  assert.match(orders, /orderItemOptions\(item\)/)
  assert.equal((orders.match(/printItemOptions\(i\)/g) || []).length, 2)
  assert.match(orders, /orderItemDetailLines\(item\)/)
})

test('photo drafts, quote prefills and new-product resets clear option drafts explicitly', async () => {
  const admin = await readFile(
    new URL('../src/pages/Admin.jsx', import.meta.url),
    'utf8'
  )
  assert.ok((admin.match(/productOptions.reset\(\)/g) || []).length >= 2)
  assert.match(admin, /resetProductOptions\(\)/)
})

test('public display uses pack total at every CTA and a shared batch for card starting prices', async () => {
  const detail = await readFile(
    new URL('../src/pages/ProductDetail.jsx', import.meta.url),
    'utf8'
  )
  assert.equal((detail.match(/displayPrice/g) || []).length, 4)
  assert.match(detail, /currentChoice.packs/)
  const card = await readFile(
    new URL('../src/components/ProductCard.jsx', import.meta.url),
    'utf8'
  )
  assert.match(card, /usePublicPresentations\(publicBusinessId\)/)
})

test('order editor labels presentation quantities and prices as packs', async () => {
  const source = await readFile(
    new URL('../src/pages/Orders.jsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /item.presentation_label \? 'Paquetes' : 'Cantidad'/)
  assert.match(
    source,
    /item.presentation_label \? 'Precio por paquete \(C\$\)' : 'Precio Unitario \(C\$\)'/
  )
})

for (const change of [
  { label: 'Nuevo nombre' },
  { units: 3 },
  { price: 750 },
]) {
  test(`same-ID presentation drift ${Object.keys(change)[0]} keeps the historical snapshot visibly selected`, async () => {
    const Selector = await load('ProductPresentationSelector')
    const snapshot = {
      id: 'same',
      label: 'Paquete antiguo',
      units: 6,
      price: 690,
    }
    const html = renderToStaticMarkup(
      React.createElement(Selector, {
        presentations: [{ ...snapshot, ...change }],
        selected: snapshot,
        onChange() {},
      })
    )
    assert.match(html, /Presentación guardada seleccionada/)
    assert.match(html, /Paquete antiguo · C\$690/)
    assert.match(html, /6 piezas/)
    assert.match(html, /aria-pressed="false"/)
    assert.doesNotMatch(html, /aria-pressed="true"/)
  })
}
test('unchanged current public presentation stays selected without redundant saved-snapshot UI', async () => {
  const Selector = await load('ProductPresentationSelector')
  const current = {
    id: 'same',
    label: 'Paquete de 6',
    units: '6',
    price: '690.00',
  }
  const html = renderToStaticMarkup(
    React.createElement(Selector, {
      presentations: [current],
      selected: { ...current, units: 6, price: 690 },
      onChange() {},
    })
  )
  assert.match(html, /aria-pressed="true"/)
  assert.doesNotMatch(html, /Presentación guardada seleccionada/)
})
test('business-specific order routes round-trip options and display every item snapshot', async () => {
  const hikari = await readFile(
    new URL('../src/pages/hikari/Orders.jsx', import.meta.url),
    'utf8'
  )
  const joyeria = await readFile(
    new URL('../src/pages/joyeria/Orders.jsx', import.meta.url),
    'utf8'
  )
  const engraving = await readFile(
    new URL('../src/components/QuickEngravingForm.jsx', import.meta.url),
    'utf8'
  )
  for (const source of [hikari, engraving]) {
    assert.match(source, /<OrderItemOptions/)
    assert.match(source, /catalogOrderItem\(/)
    assert.match(source, /orderItemOptions\(/)
    assert.match(source, /fetchOrderProducts/)
  }
  for (const source of [hikari, joyeria])
    assert.match(source, /orderItemDetailLines\(/)
  assert.match(engraving, /additionalItems/)
})

test('choosing current catalog version explicitly replaces the saved snapshot', async () => {
  const Selector = await load('ProductPresentationSelector')
  const snapshot = { id: 'same', label: 'Anterior', units: 6, price: 690 }
  const current = { id: 'same', label: 'Actual', units: 3, price: 400 }
  let chosen
  const tree = Selector({
    presentations: [current],
    selected: snapshot,
    onChange: (row) => {
      chosen = row
    },
  })
  const button = tree.props.children[2][0]
  assert.equal(button.props['aria-pressed'], false)
  button.props.onClick()
  assert.equal(chosen, current)
  const html = renderToStaticMarkup(
    React.createElement(Selector, {
      presentations: [current],
      selected: chosen,
      onChange() {},
    })
  )
  assert.match(html, /aria-pressed="true"/)
  assert.doesNotMatch(html, /guardada/)
})
