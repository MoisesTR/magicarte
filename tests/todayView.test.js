import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const Link = ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children)

async function loadModule(file, overrides = {}) {
  const source = await readFile(file, 'utf8')
  const imports = { 'react-router-dom': { Link }, ...overrides }
  for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    if (imports[specifier]) continue
    if (specifier.startsWith('.')) {
      const resolved = new URL(specifier, file)
      const suffix = path.extname(resolved.pathname)
      if (suffix === '.js') imports[specifier] = await import(resolved.href)
      else {
        if (!suffix) resolved.pathname += '.jsx'
        imports[specifier] = await loadModule(resolved, overrides)
      }
    }
  }
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => imports[name] || require(name), module, module.exports)
  return module.exports
}
const now = new Date('2026-11-19T16:00:00Z')
const order = { id: 'id 1', order_number: 42, customer_name: 'Cliente de prueba', status: 'in_progress', priority: 'urgent', total_amount: 100, delivery_fee: 20, order_payments: [], estimated_delivery_date: '2026-11-19', delivery_method: 'pickup', follow_up_date: '2026-11-19', follow_up_reason: 'notify_ready' }
const snapshot = { orders: [order], payments: [], inventory: [] }
const moduleOverride = value => ({ __esModule: true, default: value })
async function page(overrides = {}) {
  const result = { user: { id: 'user' }, checkingAuth: false, loading: false, isFetching: false, isError: false, refresh() {}, data: snapshot, now, ...overrides }
  const { default: Today } = await loadModule(new URL('../src/pages/Today.jsx', import.meta.url), {
    '../context/BusinessContext': { useBusiness: () => ({ currentBusinessId: 'b', currentBusiness: { slug: 'hikari', name: 'Hikari Studio' } }) },
    '../hooks/useTodayPanel': moduleOverride(() => result),
    '../components/AdminLogin': moduleOverride(() => React.createElement('p', null, 'Iniciar sesión')),
  })
  return { tree: Today(), result }
}
const html = tree => renderToStaticMarkup(tree)
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(child => find(child, predicate))
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)]
}
test('Hoy renders Spanish greeting/business, KPI row, all core sections and scoped order deep links', async () => {
  const markup = html((await page()).tree)
  for (const text of ['Buenos días', 'Hikari Studio', 'Entregas', 'Por cobrar', 'Seguimientos', 'Producción', 'Cierre del día', 'Sin anticipo', 'Avisar que está listo', 'Recoger en tienda']) assert.ok(markup.includes(text), text)
  assert.ok(markup.includes('/admin/hikari/orders?order=id%201'))
  assert.ok(markup.includes('min-h-10'))
  assert.ok(markup.includes('min-w-0'))
  assert.ok(markup.includes('md:grid-cols-2'))
  assert.ok(markup.includes('xl:grid-cols-3'))
  assert.ok(!markup.includes('Inventario bajo'))
})
test('time emphasis changes actual section DOM order, not only visual CSS', async () => {
  for (const [date, first] of [[now, 'deliveries'], [new Date('2026-11-19T18:00:00Z'), 'followUps'], [new Date('2026-11-20T00:00:00Z'), 'dayClose']]) {
    const markup = html((await page({ now: date })).tree)
    const sections = [...markup.matchAll(/id="today-([^"]+)"/g)].map(match => match[1])
    assert.equal(sections[0], first)
  }
})
test('Hoy renders active low stock with existing filament swatch and inventory link', async () => {
  const markup = html((await page({ data: { ...snapshot, inventory: [{ id: 'f', name: 'PLA Matte', inventory_kind: 'filament', filament_material: 'PLA', filament_color: 'Blue', color_hex: '#123456', color_transparent: false, is_active: true, is_low_stock: true, current_stock: 120, unit: 'g' }] } })).tree)
  assert.ok(markup.includes('Inventario bajo'))
  assert.ok(markup.includes('background-color:#123456'))
  assert.ok(markup.includes('/admin/hikari/inventory'))
  assert.ok(markup.includes('120 g'))
})
test('loading/auth states do not project financial sections', async () => {
  const loading = html((await page({ loading: true, data: undefined })).tree)
  assert.ok(loading.includes('Cargando su día'))
  assert.ok(loading.includes('animate-pulse'))
  assert.ok(!loading.includes('Por cobrar'))
  const login = html((await page({ user: null, loading: false })).tree)
  assert.ok(login.includes('Iniciar sesión'))
  assert.ok(!login.includes('Por cobrar'))
})
test('read failures show retry and hide even stale totals; refresh calls the existing loader', async () => {
  let retries = 0
  const { tree } = await page({ isError: true, refresh: () => retries++ })
  const markup = html(tree)
  assert.ok(markup.includes('No se pudo cargar su día'))
  assert.ok(!markup.includes('Por cobrar'))
  find(tree, element => element.type === 'button' && element.props.children === 'Reintentar')[0].props.onClick()
  assert.equal(retries, 1)
  const ready = await page({ refresh: () => retries++ })
  find(ready.tree, element => element.type === 'button' && element.props['aria-label'] === 'Actualizar panel')[0].props.onClick()
  assert.equal(retries, 2)
})
test('empty panels have subtle encouraging empty states', async () => {
  const markup = html((await page({ data: { orders: [], payments: [], inventory: [] } })).tree)
  for (const text of ['Nada atrasado', 'No hay saldos pendientes', 'Seguimientos al día', 'Sin pagos recibidos hoy']) assert.ok(markup.includes(text), text)
})
test('business route is scoped, Hoy is first navigation tab and bare admin defaults to Hoy', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.ok(app.includes("path='/admin/:business/hoy' element={<BusinessScopedPage page={Today} />}"))
  assert.ok(app.includes('to={`/admin/${slug}/hoy`}'))
  const nav = await readFile(new URL('../src/components/AdminChrome.jsx', import.meta.url), 'utf8')
  assert.equal(nav.match(/tab: '([^']+)'/)?.[1], 'hoy')
  const context = await readFile(new URL('../src/context/BusinessContext.jsx', import.meta.url), 'utf8')
  assert.ok(context.includes("segments[3] || 'hoy'"))
})
