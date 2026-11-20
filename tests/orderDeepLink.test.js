import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
const require = createRequire(import.meta.url)
const flush = () => new Promise(resolve => setImmediate(resolve))
const scopedOrder = (id, fields = {}) => ({ id, business_id: 'business-one', ...fields })

async function loadHook({ search = '', orders = [], enabled = true, businessId = 'business-one', handled = { current: null }, result = { data: null, error: null }, fetch } = {}) {
  const effects = [], opened = [], navigations = [], reads = [], errors = [], cleanups = []
  let refIndex = 0
  const source = await readFile(new URL('../src/hooks/useOrderDeepLink.js', import.meta.url), 'utf8')
  const { code } = await transform(source, { format: 'cjs' })
  const module = { exports: {} }
  const imports = {
    react: { useRef: value => refIndex++ === 0 ? handled : { current: value }, useEffect: callback => effects.push(callback) },
    '../data/orders': { fetchOrderForBusiness: (...args) => { reads.push(args); return fetch ? fetch(...args) : Promise.resolve(result) } },
    'react-hot-toast': { __esModule: true, default: { error: message => errors.push(message) } },
    'react-router-dom': {
      useLocation: () => ({ pathname: '/admin/hikari/orders', search, hash: '#detail', state: { retained: true } }),
      useNavigate: () => (...args) => navigations.push(args),
    },
  }
  new Function('require', 'module', 'exports', code)(name => imports[name] || require(name), module, module.exports)
  module.exports.default(orders, value => opened.push(value), businessId, enabled)
  effects.forEach(effect => cleanups.push(effect()))
  return { opened, navigations, handled, reads, errors, cleanup: () => cleanups.forEach(cleanup => cleanup?.()) }
}
test('deep link fails closed until authenticated with a business id', async () => {
  for (const options of [{ enabled: false }, { businessId: null }, { businessId: undefined, enabled: false }, { businessId: '' }]) {
    const result = await loadHook({ search: '?order=one', orders: [scopedOrder('one')], ...options })
    assert.deepEqual(result.opened, [])
    assert.deepEqual(result.reads, [])
  }
})
test('deep link opens exact loaded business order once and consumes only its own param preserving URL/state', async () => {
  const order = scopedOrder('one')
  const args = { search: '?order=one&other=value', orders: [order] }
  const result = await loadHook(args)
  assert.deepEqual(result.opened, [order])
  assert.deepEqual(result.reads, [])
  assert.deepEqual(result.navigations, [[{ pathname: '/admin/hikari/orders', search: 'other=value', hash: '#detail' }, { replace: true, state: { retained: true } }]])
  assert.deepEqual((await loadHook({ ...args, handled: result.handled })).opened, [])
})
test('consuming a link permits opening the same order from a later link', async () => {
  const handled = { current: 'business-one:one' }
  await loadHook({ handled })
  assert.equal((await loadHook({ search: '?order=one', orders: [scopedOrder('one')], handled })).opened.length, 1)
})
test('deep links fetch a full scoped detail when target is beyond the capped Orders list', async () => {
  const target = scopedOrder('old-target', { order_items: [{ id: 'item', order_item_designs: [{ design_name: 'Saved design' }] }], order_payments: [{ id: 'payment' }] })
  const h = await loadHook({ search: '?order=old-target', orders: [scopedOrder('recent')], result: { data: target, error: null } })
  await flush()
  assert.deepEqual(h.reads, [['old-target', 'business-one']])
  assert.deepEqual(h.opened, [target])
  assert.equal(h.navigations.length, 1)
})
test('a different-business row in the loaded list is never opened or trusted', async () => {
  const h = await loadHook({ search: '?order=one', orders: [scopedOrder('one', { business_id: 'other' })] })
  await flush()
  assert.deepEqual(h.opened, [])
  assert.deepEqual(h.reads, [['one', 'business-one']])
  assert.match(h.errors[0], /No se encontró/)
})
for (const data of [scopedOrder('one', { business_id: 'other' }), scopedOrder('different-id')]) test(`fallback rejects mismatched response ${data.id}/${data.business_id}`, async () => {
  const h = await loadHook({ search: '?order=one', result: { data, error: null } })
  await flush()
  assert.deepEqual(h.opened, [])
  assert.match(h.errors[0], /No se encontró/)
})
test('not-found and failed reads give Spanish feedback and consume the failed deep link', async () => {
  for (const result of [{ data: null, error: null }, { data: null, error: Error('denied') }]) {
    const h = await loadHook({ search: '?order=one', result })
    await flush()
    assert.deepEqual(h.opened, [])
    assert.match(h.errors[0], /No se (?:encontró|pudo abrir)/)
    assert.equal(h.navigations.length, 1)
  }
})
test('cleanup after business/auth/URL changes discards late fallback results and errors', async () => {
  for (const late of [{ data: scopedOrder('one') }, { error: Error('late error') }]) {
    let resolve
    const h = await loadHook({ search: '?order=one', fetch: () => new Promise(done => { resolve = done }) })
    h.cleanup()
    resolve(late)
    await flush()
    assert.deepEqual(h.opened, [])
    assert.deepEqual(h.errors, [])
    assert.deepEqual(h.navigations, [])
  }
})
test('all business order variants wire scope and authentication into the same editor hook', async () => {
  for (const path of ['Orders.jsx', 'hikari/Orders.jsx', 'joyeria/Orders.jsx']) {
    const source = await readFile(new URL(`../src/pages/${path}`, import.meta.url), 'utf8')
    assert.ok(/useOrderDeepLink\(orders,[^\n]+currentBusinessId, Boolean\(user && currentBusinessId\)\)/.test(source))
  }
})
