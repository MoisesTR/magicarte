import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { moneyNIO as money } from '../src/utils/finance.js'
import * as colors from '../src/utils/filamentColors.js'
import * as wall from '../src/utils/filamentWall.js'

// Replace external boundaries, not inventory behavior, so Node can exercise the
// existing JSX page without a browser, authentication or Supabase requests.
async function inventoryHarness(overrides = {}, business = { currentBusiness: { slug: 'hikari', name: 'Hikari' }, currentBusinessId: 2 }) {
  const source = (await readFile(new URL('../src/pages/Inventory.jsx', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '')
    .replace('export default function Inventory', 'function Inventory')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'transform', format: 'cjs' })
  const calls = []
  const errors = []
  const effects = []
  const state = { 0: { id: 'owner' }, 1: false, 17: wall.readWallPreferences('other', {}), ...overrides }
  let index = 0
  const deps = {
    money,
    ...colors,
    ...wall,
    useState(initial) {
      const slot = index++
      if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial
      return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value }]
    },
    useMemo: callback => callback(),
    useEffect(callback) { effects.push(callback) },
    useBusiness: () => business,
    toast: { error: message => errors.push(message), success() {} },
    AdminLogin: () => null,
    Swatch: ({ hex, transparent, label }) => React.createElement('span', { 'data-hex': hex, title: transparent ? 'Transparente' : label }),
    FilamentWall: () => React.createElement('section', { 'data-wall': true }),
    copyColorLink: async () => true,
    window: { location: { origin: 'https://example.test' } },
    createInventoryItem: async (item, businessId) => { calls.push({ operation: 'create', item, businessId }); return { data: { id: 'new' } } },
    updateInventoryItem: async (id, item, businessId) => { calls.push({ operation: 'update', id, item, businessId }); return {} },
    addInventoryMovement: async (movement, businessId) => { calls.push({ operation: 'movement', movement, businessId }); return {} },
    fetchInventoryStock: async () => ({ data: [] }),
    fetchInventoryMovements: async () => ({ data: [] }),
    removeInventoryItem() {},
  }
  const Inventory = new Function('React', 'deps', `const { ${Object.keys(deps).join(', ')} } = deps; ${code}; return Inventory`)(React, deps)
  return { render() { index = 0; effects.length = 0; return Inventory() }, state, calls, errors, effects }
}

function elements(tree, predicate) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, predicate))
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)]
}

const filament = { id: 'one', name: 'Filamento PLA Matte · Ivory White', inventory_kind: 'filament', filament_material: 'PLA Matte', filament_color: 'Ivory White', unit: 'g', grams_per_spool: 1000, current_stock: 1000, is_active: true }

test('stock cards, table, movement history and every filament picker choice have matching swatches', async () => {
  const harness = await inventoryHarness({ 2: [filament], 3: [{ id: 'move', inventory_item_id: 'one', quantity_delta: 1000, occurred_at: '2026-11-19', movement_type: 'purchase' }], 7: true })
  const html = renderToStaticMarkup(harness.render())
  assert.equal((html.match(/data-hex="#FFFFFF"/g) || []).length, 4)
  assert.match(html, /type="radio"/)
  assert.match(html, /min-h-10 min-w-0/)
  assert.match(html, /max-h-48/)
})

test('typing a known code updates the actual form; native color and hex override it', async () => {
  const harness = await inventoryHarness({ 8: true })
  let tree = harness.render()
  elements(tree, element => element.type === 'input' && element.props.inputMode === 'numeric')[0].props.onChange({ target: { value: '11100' } })
  assert.equal(harness.state[15].material, 'PLA Matte')
  assert.equal(harness.state[15].color, 'Ivory White')
  assert.equal(harness.state[15].color_hex, '#FFFFFF')
  tree = harness.render()
  elements(tree, element => element.type === 'input' && element.props.type === 'color')[0].props.onChange({ target: { value: '#abc123' } })
  assert.equal(harness.state[15].color_hex, '#ABC123')
  tree = harness.render()
  elements(tree, element => element.type === 'input' && element.props.placeholder === '#RRGGBB')[0].props.onChange({ target: { value: '#123abc' } })
  assert.equal(harness.state[15].color_hex, '#123ABC')
  tree = harness.render()
  elements(tree, element => element.type === 'input' && element.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } })
  assert.equal(harness.state[15].color_transparent, true)
})

for (const editing of [false, true]) {
  test(`filament ${editing ? 'update' : 'create'} persists uppercase hex and transparency through the real submit handler`, async () => {
    const harness = await inventoryHarness({ 8: true, ...(editing ? { 10: filament } : {}) })
    harness.render()
    Object.assign(harness.state[15], { color: 'Custom', material: 'PLA', color_hex: '#abcdef', color_transparent: true, quantity: '1' })
    const tree = harness.render()
    await elements(tree, element => element.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    assert.deepEqual(harness.errors, [])
    assert.equal(harness.calls[0].operation, editing ? 'update' : 'create')
    assert.equal(harness.calls[0].businessId, 2)
    assert.equal(harness.calls[0].item.color_hex, '#ABCDEF')
    assert.equal(harness.calls[0].item.color_transparent, true)
    assert.equal(harness.calls.filter(call => call.operation === 'movement').length, editing ? 0 : 1)
  })
}

test('malformed hex blocks submission without issuing a write', async () => {
  const harness = await inventoryHarness({ 8: true })
  harness.render()
  Object.assign(harness.state[15], { color: 'Custom', color_hex: 'invalid', quantity: '1' })
  await elements(harness.render(), element => element.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(harness.calls.length, 0)
  assert.match(harness.errors[0], /hexadecimal/)
})

test('Hikari can switch between the filament wall and the unchanged list without hiding other inventory forever', async () => {
  const harness = await inventoryHarness({ 2: [filament], 17: wall.readWallPreferences('hikari', {}) })
  let tree = harness.render()
  assert.match(renderToStaticMarkup(tree), /data-wall="true"/)
  assert.match(renderToStaticMarkup(tree), /Copiar enlace de colores/)
  elements(tree, x => x.type === 'button' && x.props.children === 'Lista')[0].props.onClick()
  tree = harness.render()
  assert.equal(harness.state[17].view, 'list')
  assert.doesNotMatch(renderToStaticMarkup(tree), /data-wall="true"/)
  assert.match(renderToStaticMarkup(tree), /Filamento PLA Matte/)
})

test('businesses without filament items keep the list without a wall toggle', async () => {
  const harness = await inventoryHarness({ 2: [{ id: 'general', name: 'General', is_active: true, inventory_kind: 'general', unit: 'unidad' }], 17: wall.readWallPreferences('hikari', {}) })
  const html = renderToStaticMarkup(harness.render())
  assert.doesNotMatch(html, /Muro de colores|data-wall/)
  assert.match(html, /General/)
})

test('Hikari defaults to wall when business metadata arrives after the initial fallback render', async () => {
  const business = { currentBusiness: { slug: 'magicarte', name: 'Magic Arte' }, currentBusinessId: null }
  const harness = await inventoryHarness({ 2: [filament] }, business)
  harness.render()
  business.currentBusiness = { slug: 'hikari', name: 'Hikari' }
  business.currentBusinessId = 2
  harness.render()
  harness.effects[0]()
  assert.equal(harness.state[17].view, 'wall')
})

for (const editing of [false, true]) {
  test(`filament ${editing ? 'edit' : 'create'} code autofills, permits manual HTTPS edits and saves product metadata`, async () => {
    const h = await inventoryHarness({ 8: true, ...(editing ? { 10: filament } : {}) })
    let tree = h.render()
    elements(tree, x => x.type === 'input' && x.props.inputMode === 'numeric')[0].props.onChange({ target: { value: '11100' } })
    assert.equal(h.state[15].product_url, 'https://us.store.bambulab.com/products/pla-matte?id=40489681780872')
    assert.match(h.state[15].product_image_url, /^https:\/\/store\.bblcdn\.com\//)
    const image = h.state[15].product_image_url
    tree = h.render()
    const input = elements(tree, x => x.type === 'input' && x.props.type === 'url')[0]
    assert.ok(input)
    assert.equal(input.props.pattern, 'https://.*')
    assert.equal(input.props.required, undefined)
    assert.match(renderToStaticMarkup(tree), /Enlace de Bambu/)
    assert.doesNotMatch(renderToStaticMarkup(tree), /type="url"[^>]*product_image/)
    input.props.onChange({ target: { value: 'https://us.store.bambulab.com/products/custom?id=123' } })
    h.state[15].quantity = '1'
    await elements(h.render(), x => x.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    assert.deepEqual(h.errors, [])
    assert.equal(h.calls[0].item.product_url, 'https://us.store.bambulab.com/products/custom?id=123')
    assert.equal(h.calls[0].item.product_image_url, image)
  })
}

test('manually clearing the Bambu link clears the hidden image and saves null values', async () => {
  const h = await inventoryHarness({ 8: true })
  elements(h.render(), x => x.type === 'input' && x.props.inputMode === 'numeric')[0].props.onChange({ target: { value: '11100' } })
  elements(h.render(), x => x.type === 'input' && x.props.type === 'url')[0].props.onChange({ target: { value: '' } })
  assert.equal(h.state[15].product_image_url, '')
  h.state[15].quantity = '1'
  await elements(h.render(), x => x.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(h.calls[0].item.product_url, null)
  assert.equal(h.calls[0].item.product_image_url, null)
})

test('invalid Bambu URLs block the real submit handler before any write', async () => {
  const h = await inventoryHarness({ 8: true })
  h.render()
  Object.assign(h.state[15], { color: 'Custom', quantity: '1', product_url: 'http://example.test' })
  await elements(h.render(), x => x.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(h.calls.length, 0)
  assert.match(h.errors[0], /https:\/\//)
})

test('opening edit preserves saved product metadata rather than silently refilling it', async () => {
  const item = { ...filament, product_url: 'https://example.test/custom', product_image_url: 'https://example.test/photo.jpg' }
  const h = await inventoryHarness({ 2: [item] })
  let tree = h.render()
  elements(tree, x => x.type === 'button' && x.props.children === 'Editar')[0].props.onClick()
  assert.equal(h.state[15].product_url, item.product_url)
  assert.equal(h.state[15].product_image_url, item.product_image_url)
  tree = h.render()
  assert.equal(elements(tree, x => x.type === 'input' && x.props.type === 'url')[0].props.value, item.product_url)
  await elements(tree, x => x.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.deepEqual(h.errors, [])
  assert.equal(h.calls[0].item.product_url, item.product_url)
  assert.equal(h.calls[0].item.product_image_url, item.product_image_url)
})
