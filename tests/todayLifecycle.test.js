import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
const require = createRequire(import.meta.url)
const flush = () => new Promise(resolve => setImmediate(resolve))

async function harness() {
  const source = await readFile(new URL('../src/hooks/useTodayPanel.js', import.meta.url), 'utf8')
  const { code } = await transform(source, { format: 'cjs' })
  let state = [], slot = 0, effects = [], options, authListener, resolveUser
  const events = new Map(), removed = [], refetches = [], reads = []
  const imports = {
    react: {
      useState(initial) { const id = slot++; if (!(id in state)) state[id] = typeof initial === 'function' ? initial() : initial; return [state[id], value => { state[id] = typeof value === 'function' ? value(state[id]) : value }] },
      useEffect(callback) { effects.push(callback) },
    },
    '@tanstack/react-query': { useQuery(value) { options = value; return { refetch: value => refetches.push(value), isPending: true } } },
    '../config/supabaseClient': { supabase: { auth: {
      getUser: () => new Promise(resolve => { resolveUser = resolve }),
      onAuthStateChange(callback) { authListener = callback; return { data: { subscription: { unsubscribe: () => removed.push('auth') } } } },
    } } },
    '../data/today': { fetchTodayPanel: async id => { reads.push(id); return { orders: [{ id }] } } },
  }
  const module = { exports: {} }
  const fakeWindow = { addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => { events.delete(name); removed.push(name) } }
  const fakeDocument = { visibilityState: 'visible', addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => { events.delete(name); removed.push(name) } }
  new Function('require', 'module', 'exports', 'window', 'document', code)(name => imports[name] || require(name), module, module.exports, fakeWindow, fakeDocument)
  return {
    events, removed, refetches, reads, fakeDocument,
    render(id) { slot = 0; effects = []; return module.exports.default(id) },
    get options() { return options }, get effects() { return effects },
    auth(session) { authListener('SIGNED_IN', session) },
    resolveUser(user) { resolveUser({ data: { user } }) },
  }
}
test('daily data is disabled until authenticated and business-scoped; query identity includes both', async () => {
  const h = await harness()
  h.render(null)
  assert.equal(h.options.enabled, false)
  h.effects[0]()
  h.resolveUser({ id: 'user-one' }); await flush()
  h.render(null)
  assert.equal(h.options.enabled, false)
  h.render('business-one')
  assert.equal(h.options.enabled, true)
  assert.deepEqual(h.options.queryKey, ['today-panel', 'business-one', 'user-one'])
  await h.options.queryFn()
  assert.deepEqual(h.reads, ['business-one'])
  assert.equal(h.options.retry, false)
})
test('focus and visible-tab refresh are guarded and listeners are cleaned up', async () => {
  const h = await harness()
  h.render('one'); h.effects[0](); h.auth({ user: { id: 'user' } })
  h.render('one')
  const cleanup = h.effects[1]()
  h.events.get('focus')()
  assert.equal(h.refetches.length, 1)
  assert.deepEqual(h.refetches[0], { cancelRefetch: false })
  h.fakeDocument.visibilityState = 'hidden'
  h.events.get('visibilitychange')()
  assert.equal(h.refetches.length, 1)
  h.fakeDocument.visibilityState = 'visible'
  h.events.get('visibilitychange')()
  assert.equal(h.refetches.length, 2)
  cleanup()
  assert.equal(h.events.size, 0)
})
test('late initial auth response cannot resurrect a signed-out session', async () => {
  const h = await harness()
  h.render('one'); const cleanup = h.effects[0]()
  h.auth(null)
  h.resolveUser({ id: 'stale-user' }); await flush()
  assert.equal(h.render('one').user, null)
  assert.equal(h.options.enabled, false)
  cleanup()
  assert.ok(h.removed.includes('auth'))
})
test('business and user query-key changes never project late old-business results', async () => {
  const h = await harness()
  h.render('old'); h.effects[0](); h.auth({ user: { id: 'u1' } }); h.render('old')
  let resolveOld, resolveNew
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const observer = new QueryObserver(client, { ...h.options, queryFn: () => new Promise(resolve => { resolveOld = resolve }) })
  const unsubscribe = observer.subscribe(() => {})
  h.render('new')
  observer.setOptions({ ...h.options, queryFn: () => new Promise(resolve => { resolveNew = resolve }) })
  assert.equal(observer.getCurrentResult().data, undefined)
  resolveOld({ orders: [{ id: 'old-business-order' }] }); await flush()
  assert.equal(observer.getCurrentResult().data, undefined)
  resolveNew({ orders: [{ id: 'new-business-order' }] }); await flush()
  assert.equal(observer.getCurrentResult().data.orders[0].id, 'new-business-order')
  h.auth({ user: { id: 'u2' } }); h.render('new')
  observer.setOptions({ ...h.options, queryFn: () => new Promise(() => {}) })
  assert.equal(observer.getCurrentResult().data, undefined)
  unsubscribe(); client.clear()
})

test('AdminLogin receives a working success callback that enables the scoped query', async () => {
  const h = await harness()
  h.render('one').onLogin({ id: 'signed-in' })
  assert.equal(h.render('one').user.id, 'signed-in')
  assert.equal(h.options.enabled, true)
})
