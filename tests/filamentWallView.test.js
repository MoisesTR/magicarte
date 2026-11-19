import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as wall from '../src/utils/filamentWall.js'
import * as colors from '../src/utils/filamentColors.js'

const filament = { id: 'one', inventory_kind: 'filament', filament_material: 'PLA Matte', filament_color: 'Ivory White', color_hex: '#FFFFFF', grams_per_spool: 1000, current_stock: 3200, unit_cost: 0.5, low_stock_threshold: 250, is_active: true, notes: 'Código Bambu 11100' }
const passthrough = ({ children }) => React.createElement('div', null, children)
const dialog = ({ children, open }) => open === false ? null : React.createElement('div', null, children)

async function harness(path, overrides = {}, initial = {}) {
  const source = (await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '').replace(/^import ['"][^'"]+['"]\n/gm, '').replace('export default function ', 'function ').replaceAll('export function ', 'function ')
  const componentName = source.match(/function (\w+)\(/)?.[1]
  const { code } = await transform(source, { loader: 'jsx', jsx: 'transform', format: 'cjs' })
  const state = { ...initial }, effects = []
  let index = 0
  const deps = { ...wall, ...colors, useState(value) { const slot = index++; if (!(slot in state)) state[slot] = typeof value === 'function' ? value() : value; return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value }] }, useEffect(callback) { effects.push(callback) }, useMemo: callback => callback(), Dialog: dialog, DialogBackdrop: passthrough, DialogPanel: passthrough, DialogTitle: passthrough, Description: passthrough, SpoolIllustration: () => React.createElement('span', { 'data-spool': true }), ...overrides }
  if (path.endsWith('SpoolCard.jsx')) delete deps.SpoolIllustration
  const Component = new Function('React', 'deps', `const { ${Object.keys(deps).join(', ')} } = deps; ${code}; return ${overrides.componentName || componentName}`)(React, deps)
  return { state, effects, render(props) { index = 0; effects.length = 0; return Component(props) } }
}
function elements(tree, predicate) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, predicate))
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)]
}
const text = element => renderToStaticMarkup(element)

test('admin spool card is a keyboard button with stock meter, ceil rolls and accessible English name', async () => {
  const h = await harness('components/SpoolCard.jsx', { componentName: 'SpoolCard' })
  const html = text(h.render({ item: filament }))
  assert.match(html, /<button/)
  assert.match(html, /aria-label="PLA Matte Ivory White, 3.2 kg"/)
  assert.match(html, /Blanco marfil/)
  assert.match(html, /4 rollos/)
  assert.match(html, /role="meter"/)
  assert.match(html, /aria-valuenow="80"/)
})

test('public spool card reuses art, bilingual names and poco badge without stock or cost markup', async () => {
  const h = await harness('components/SpoolCard.jsx', { componentName: 'SpoolCard' })
  const html = text(h.render({ item: { ...filament, availability: 'poco' }, publicView: true }))
  assert.match(html, /<article/)
  assert.match(html, /Blanco marfil/)
  assert.match(html, /lang="en">Ivory White/)
  assert.match(html, /Pocas unidades/)
  assert.doesNotMatch(html, /kg|rollos|meter|C\$|11100|3200/)
})

test('spool artwork supplies transparent glass and distinct silk, marble and wood treatments', async () => {
  const h = await harness('components/SpoolCard.jsx', { componentName: 'SpoolIllustration' })
  for (const [material, suffix] of [['PLA Silk+', 'silk'], ['PLA Marble', 'marble'], ['PLA Wood', 'wood']]) assert.match(text(h.render({ item: { ...filament, filament_material: material } })), new RegExp(`filament-spool-${suffix}`))
  assert.match(text(h.render({ item: { ...filament, color_transparent: true } })), /filament-spool-glass/)
})

test('exhausted admin cards are muted with Agotado and zero rolls', async () => {
  const h = await harness('components/SpoolCard.jsx', { componentName: 'SpoolCard' })
  const html = text(h.render({ item: { ...filament, current_stock: 0 } }))
  assert.match(html, /filament-card-empty/)
  assert.match(html, /Agotado/)
  assert.match(html, /0 rollos/)
})

test('detail adjustment requires inline confirmation then submits the exact ledger movement', async () => {
  const calls = []
  const h = await harness('components/FilamentDetail.jsx', {
    fetchItemInventoryMovements: async () => ({ data: [] }),
    addInventoryMovement: async (...args) => { calls.push(args); return {} },
  })
  const props = { item: filament, businessId: 2, onClose() {}, onEdit() {}, onRefresh: async () => calls.push('refresh') }
  h.render(props)
  // The real number control is grams for the open spool; closed rolls remain untouched.
  let tree = h.render(props)
  const gramsUnit = elements(tree, x => x.type === 'button' && x.props.children === 'Gramos')[0]
  gramsUnit.props.onClick()
  tree = h.render(props)
  elements(tree, x => x.type === 'input' && x.props.type === 'number')[0].props.onChange({ target: { value: '500' } })
  tree = h.render(props)
  elements(tree, x => x.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(calls.length, 0)
  tree = h.render(props)
  assert.match(text(tree), /Confirmar ajuste/)
  await elements(tree, x => x.type === 'button' && x.props.children === 'Confirmar ajuste')[0].props.onClick()
  assert.deepEqual(calls[0], [{ inventory_item_id: 'one', movement_type: 'adjustment', quantity_delta: 300, note: 'Ajuste de existencia (muro)' }, 2])
  assert.equal(calls[1], 'refresh')
})

test('detail shows costs per kg, value, threshold and item-scoped history; failures are visible', async () => {
  const requests = []
  const h = await harness('components/FilamentDetail.jsx', { fetchItemInventoryMovements: async (...args) => { requests.push(args); return { error: Error('denied') } }, addInventoryMovement: async () => ({}) })
  const props = { item: filament, businessId: 2, onClose() {}, onEdit() {}, onRefresh() {} }
  let html = text(h.render(props))
  assert.match(html, /Costo promedio \/ kg/)
  assert.match(html, /500.00/)
  assert.match(html, /Valor en stock/)
  assert.match(html, /1,600.00/)
  assert.match(html, /250 g/)
  await h.effects[0]()
  assert.deepEqual(requests[0], [2, 'one'])
  html = text(h.render(props))
  assert.match(html, /No pudimos cargar los movimientos/)
})

test('wall includes search, counts, availability, rainbow/material sorting and opens a detail on tap', async () => {
  const preferences = wall.readWallPreferences('hikari', {})
  const updates = []
  const h = await harness('components/FilamentWall.jsx', { SpoolCard: () => null, FilamentDetail: () => null })
  const props = { items: [filament], businessId: 2, preferences, onPreferences: value => updates.push(value), onEdit() {}, onRefresh() {} }
  let tree = h.render(props)
  assert.match(text(tree), /Muro de filamentos/)
  assert.match(text(tree), /Solo disponibles/)
  elements(tree, x => x.type === 'input' && x.props.type === 'search')[0].props.onChange({ target: { value: 'marfil' } })
  assert.equal(updates[0].query, 'marfil')
  elements(tree, x => x.props.item?.id === 'one' && typeof x.props.onClick === 'function')[0].props.onClick()
  tree = h.render(props)
  assert.equal(elements(tree, x => x.props.item?.id === 'one' && x.props.businessId === 2).length, 1)
})

test('opening a fractional spool detail does not propose a rounding-only stock adjustment', async () => {
  const h = await harness('components/FilamentDetail.jsx', { fetchItemInventoryMovements: async () => ({ data: [] }), addInventoryMovement: async () => ({}) })
  const props = { item: { ...filament, current_stock: 1833.333, grams_per_spool: 750 }, businessId: 2, onClose() {}, onEdit() {}, onRefresh() {} }
  const tree = h.render(props)
  elements(tree, x => x.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.match(text(h.render(props)), /La existencia ya coincide/)
  assert.equal(h.state[5], null)
})

test('a changed total invalidates confirmation instead of sending a stale adjustment', async () => {
  const calls = []
  const h = await harness('components/FilamentDetail.jsx', { fetchItemInventoryMovements: async () => ({ data: [] }), addInventoryMovement: async (...args) => { calls.push(args); return {} } })
  const props = { item: filament, businessId: 2, onClose() {}, onEdit() {}, onRefresh() {} }
  let tree = h.render(props)
  elements(tree, x => x.type === 'input' && x.props.type === 'number')[0].props.onChange({ target: { value: '50' } })
  tree = h.render(props)
  elements(tree, x => x.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  tree = h.render({ ...props, item: { ...filament, current_stock: 3100 } })
  await elements(tree, x => x.type === 'button' && x.props.children === 'Confirmar ajuste')[0].props.onClick()
  assert.equal(calls.length, 0)
  assert.match(text(h.render(props)), /La existencia cambió/)
})
