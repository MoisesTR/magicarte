import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { groupFilaments } from '../src/utils/filamentWall.js'

const row = { business_name: 'Hikari Studio 3D', primary_color: '#EA7354', filament_material: 'PLA Matte', filament_color: 'Ivory White', color_hex: '#FFFFFF', color_transparent: false, availability: 'poco' }
async function harness(initial = {}, overrides = {}) {
  const source = (await readFile(new URL('../src/pages/PublicFilamentColors.jsx', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '').replace('export default function ', 'function ')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'transform', format: 'cjs' })
  const state = { ...initial }, effects = [], requests = [], shares = []
  let index = 0
  const document = { title: 'Previous page' }
  const deps = { groupFilaments, document, window: { location: { href: 'https://test/hikari/colores' } }, useParams: () => ({ business: 'hikari' }), useMemo: callback => callback(), useState(value) { const slot = index++; if (!(slot in state)) state[slot] = typeof value === 'function' ? value() : value; return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value }] }, useEffect(callback) { effects.push(callback) }, SpoolCard: ({ item, publicView }) => React.createElement('article', { 'data-public': publicView }, item.filament_color), fetchPublicFilamentColors: async slug => { requests.push(slug); return { data: [row] } }, shareColorLink: async (...args) => { shares.push(args); return 'copied' }, ...overrides }
  const Component = new Function('React', 'deps', `const { ${Object.keys(deps).join(', ')} } = deps; ${code}; return PublicFilamentColors`)(React, deps)
  return { state, effects, requests, shares, document, render() { index = 0; effects.length = 0; return Component() } }
}
function elements(tree, predicate) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, predicate))
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)]
}

test('customer page loads the slug anonymously and safely restores its branded meta title', async () => {
  const h = await harness()
  assert.match(renderToStaticMarkup(h.render()), /Cargando colores/)
  h.effects[0]()
  await new Promise(resolve => setImmediate(resolve))
  const html = renderToStaticMarkup(h.render())
  assert.deepEqual(h.requests, ['hikari'])
  assert.match(html, /Hikari Studio 3D/)
  assert.match(html, /Elija el color para su pieza/)
  assert.match(html, /PLA Mate/)
  assert.match(html, /data-public="true"/)
  assert.match(html, /--filament-accent:#EA7354/)
  const cleanup = h.effects[1]()
  assert.equal(h.document.title, 'Colores disponibles · Hikari Studio 3D')
  cleanup()
  assert.equal(h.document.title, 'Previous page')
  assert.doesNotMatch(html, /Iniciar sesión|unit_cost|current_stock/)
})

test('customer page exposes useful empty/error states and retries without a login', async () => {
  for (const [result, expected] of [[{ data: [] }, /Estamos preparando nuevos colores/], [{ data: [], error: Error('offline') }, /No pudimos cargar los colores/]]) {
    const h = await harness({}, { fetchPublicFilamentColors: async () => result })
    h.render(); h.effects[0]()
    await new Promise(resolve => setImmediate(resolve))
    const tree = h.render()
    assert.match(renderToStaticMarkup(tree), expected)
    if (result.error) assert.equal(elements(tree, x => x.type === 'button' && x.props.children === 'Reintentar').length, 1)
  }
})

test('customer share uses the actual page link and offers a manual selectable link if copying fails', async () => {
  const h = await harness({ 0: { slug: 'hikari', rows: [row], status: 'ready' } }, { shareColorLink: async () => 'manual' })
  const tree = h.render()
  await elements(tree, x => x.type === 'button' && x.props.children === 'Compartir')[0].props.onClick()
  const link = elements(h.render(), x => x.type === 'input' && x.props.readOnly)[0]
  assert.equal(link.props.value, 'https://test/hikari/colores')
})

test('late public fetch results cannot overwrite a page after cleanup', async () => {
  let finish
  const h = await harness({}, { fetchPublicFilamentColors: () => new Promise(resolve => { finish = resolve }) })
  h.render()
  const cleanup = h.effects[0]()
  cleanup()
  finish({ data: [row] })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.state[0].status, 'loading')
})
