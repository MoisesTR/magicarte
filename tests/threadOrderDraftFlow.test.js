import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import * as helpers from '../src/utils/orderDraftFromThread.js'
import { threadOrderPrefill } from '../src/utils/whatsappFeed.js'
const flush = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const original = () => threadOrderPrefill({ summary: '18 vitrales a C$300 c/u', paid_amount: 2700 })
const result = { customer_name: 'Cliente', items: [{ product_id: 'p', product_name: 'Vitral', quantity: 18, unit_price: 300, description: 'Alma Medina' }], delivery_method: 'delivery', delivery_address: 'Estelí', recipient_name: null, deposit_amount: 2700, notes: null }
async function harness() {
  const source = await readFile('src/hooks/useThreadOrderDraft.js', 'utf8')
  const { code } = await transform(source, { format: 'cjs' })
  const slots = [], effects = [], calls = [], requests = []
  let cursor = 0
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i] },
    useEffect(run, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: run() } }) },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : { ...helpers, requestOrderDraft: (...args) => { calls.push(args); const request = deferred(); requests.push(request); return request.promise } }, module, module.exports)
  let options = { businessId: 1, products: [{ id: 'p', name: 'Vitral', price: 300 }], catalogBusinessId: null, getSession() {} }
  return { calls, requests, render(next = {}) { options = { ...options, ...next }; cursor = 0; const api = module.exports.default(original, options); effects.splice(0).forEach(run => run()); return api }, unmount() { for (const slot of slots) slot?.cleanup?.() } }
}

test('draft flow waits for scoped loaded catalog, calls once and preserves edits made while waiting', async () => {
  const h = await harness()
  let api = h.render()
  api.begin(original(), { summary: '18 vitrales' })
  api = h.render()
  api.setFormData(p => ({ ...p, customer_name: 'Propietaria' }))
  api = h.render({ catalogBusinessId: 1 })
  assert.equal(h.calls.length, 1)
  h.render({ products: [{ id: 'p', name: 'Vitral', price: 300 }] })
  assert.equal(h.calls.length, 1)
  h.requests[0].resolve(result)
  await flush()
  api = h.render()
  assert.equal(api.formData.customer_name, 'Propietaria')
  assert.equal(api.formData.items[0].product_id, 'p')
  assert.equal(api.status, 'completed')
  api.restoreOriginal()
  api = h.render()
  assert.deepEqual(api.formData, original())
  assert.equal(api.isImported, true, 'original restoration must retain imported delivery save semantics')
  assert.equal(h.calls.length, 1)
})

test('draft flow rejects stale responses after clear, restore, new imports, business changes and unmount', async () => {
  for (const operation of ['clear', 'restore', 'new', 'business', 'unmount']) {
    const h = await harness()
    let api = h.render({ catalogBusinessId: 1 })
    api.begin(original(), { summary: 'first' }); api = h.render()
    if (operation === 'clear') api.clear()
    if (operation === 'restore') api.restoreOriginal()
    if (operation === 'new') api.begin({ ...original(), customer_name: 'New import' }, { summary: 'next' })
    if (operation === 'business') h.render({ businessId: 2 })
    if (operation === 'unmount') h.unmount()
    h.requests[0].resolve(result)
    await flush()
    api = h.render()
    assert.notEqual(api.formData.customer_name, 'Cliente', operation)
  }
})

test('draft failure is inline and leaves deterministic form editable', async () => {
  const h = await harness()
  let api = h.render({ catalogBusinessId: 1 })
  api.begin(original(), { summary: 'first' }); h.render()
  h.requests[0].reject(new Error('Puede continuar manualmente.'))
  await flush()
  api = h.render()
  assert.equal(api.status, 'error')
  assert.match(api.error, /manualmente/)
  assert.deepEqual(api.formData, original())
  api.setFormData(p => ({ ...p, customer_name: 'Editado' }))
  assert.equal(h.render().formData.customer_name, 'Editado')
})

test('switching away and back permanently invalidates the old business draft', async () => {
  const h = await harness()
  let api = h.render({ catalogBusinessId: 1 })
  api.begin(original(), { summary: 'first' }); h.render()
  h.render({ businessId: 2 })
  h.render({ businessId: 1 })
  h.requests[0].resolve(result)
  await flush()
  api = h.render()
  assert.equal(api.formData.customer_name, '')
  assert.equal(api.status, 'idle')
})


test('canceling AI for submission preserves import identity through failure and later edits', async () => {
  const h = await harness()
  let api = h.render({ catalogBusinessId: 1 })
  api.begin(original(), { summary: 'first' }); api = h.render()
  api.cancelPending()
  h.requests[0].resolve(result)
  await flush()
  api = h.render()
  assert.equal(api.isImported, true)
  assert.equal(api.formData.customer_name, '')
  assert.equal(api.status, 'idle')
  api.setFormData(previous => ({ ...previous, delivery_address: 'Cargotrans a Estelí' }))
  api = h.render()
  assert.equal(api.formData.delivery_address, 'Cargotrans a Estelí')
  assert.equal(api.isImported, true)
  api.clear()
  assert.equal(h.render().isImported, false)
})
