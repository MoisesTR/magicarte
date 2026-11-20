import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { createRequire } from 'node:module'
import { threadOrderPrefill } from '../src/utils/whatsappFeed.js'
import * as presentations from '../src/utils/productPresentations.js'
import * as quoteForms from '../src/utils/quoteForms.js'
import * as payments from '../src/utils/orderPayments.js'
const require = createRequire(import.meta.url)
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean)
  if (predicate(tree)) return tree
  return find(tree.props?.children, predicate)
}
async function page(file, initial, imported = true, { failCreateOnce = false } = {}) {
  let importActive = imported
  const source = await readFile(file, 'utf8')
  const stateNames = [...source.matchAll(/const \[(\w+),\s*\w+\] = useState/g)].map(match => match[1])
  let form = structuredClone(initial), cursor = 0
  const calls = [], module = { exports: {} }
  const react = {
    useEffect() {}, useMemo: fn => fn(), useRef: current => ({ current }),
    useState(initial) { const name = stateNames[cursor++]; const overrides = { user: { id: 'owner' }, checkingAuth: false, showForm: true }; return [name in overrides ? overrides[name] : typeof initial === 'function' ? initial() : initial, () => {}] },
  }
  const mutation = name => async (...args) => { calls.push([name, ...args]); if (name === 'createOrder' && failCreateOnce && calls.filter(([operation]) => operation === name).length === 1) return { error: new Error('Temporary save failure') }; return { data: [{ id: 'order' }], error: null } }
  const imports = {
    react,
    'react-router-dom': { useLocation: () => ({ pathname: '/admin/orders', search: '', hash: '' }), useNavigate: () => () => {} },
    'react-hot-toast': { __esModule: true, default: { error: message => calls.push(['error', message]), success() {} } },
  }
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  new Function('require', 'module', 'exports', 'localStorage', code)(name => {
    if (name in imports) return imports[name]
    if (name.endsWith('/useThreadOrderDraft')) return { __esModule: true, default: () => ({ formData: form, setFormData(update) { form = typeof update === 'function' ? update(form) : update }, isImported: importActive, clear() { importActive = false }, cancelPending() {}, status: 'idle' }) }
    if (name.endsWith('/useThreadOrderImport')) return { __esModule: true, default: () => ({ clearImport() {}, completeConversion: async () => true }) }
    if (name.endsWith('/useOrderDeepLink')) return { __esModule: true, default() {} }
    if (name.endsWith('/BusinessContext')) return { useBusiness: () => ({ currentBusinessId: 2, currentBusiness: { slug: 'hikari', name: 'Hikari' } }) }
    if (name.endsWith('/supabaseClient')) return { supabase: {} }
    if (name.includes('/data/')) return new Proxy({}, { get: (_, method) => mutation(method) })
    if (name.endsWith('/productPresentations')) return presentations
    if (name.endsWith('/quoteForms')) return quoteForms
    if (name.endsWith('/orderPayments')) return payments
    if (name.endsWith('/orderDraftFromThread')) return require('../src/utils/orderDraftFromThread.js')
    if (name.includes('/components/')) return { __esModule: true, default: props => props.children || null }
    return require(name)
  }, module, module.exports, { getItem: () => null })
  const render = () => { cursor = 0; return module.exports.default() }
  return { calls, render, get form() { return form } }
}

test('main matched catalog item exposes editable engraving without switching product identity', async () => {
  const form = threadOrderPrefill({ customer_name: 'Cliente', summary: 'Vitral' })
  form.items[0] = { ...form.items[0], product_id: 'vitral', is_custom: false, product_description: 'Alma Medina', product_query: 'Vitral' }
  const h = await page('src/pages/Orders.jsx', form)
  const description = find(h.render(), node => ['textarea', 'input'].includes(node.type) && node.props.value === 'Alma Medina')
  assert.ok(description, 'catalog engraving must be visible and editable')
  description.props.onChange({ target: { value: 'Alma María Medina' } })
  assert.equal(h.form.items[0].product_description, 'Alma María Medina')
  assert.equal(h.form.items[0].product_id, 'vitral')
  await find(h.render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  const rows = h.calls.find(([name]) => name === 'insertOrderItems')[1]
  assert.equal(rows[0].product_description, 'Alma María Medina')
  assert.equal(rows[0].product_id, 'vitral')
})

test('Hikari imported shipping survives create while normal creation stays pickup', async () => {
  const form = threadOrderPrefill({ customer_name: 'Cliente', summary: 'Vitral', delivery_method: 'envío por Cargotrans a Estelí', delivery_date: '2026-11-25', quoted_amount: 300 })
  form.recipient_name = 'Alma Medina'
  for (const imported of [true, false]) {
    const h = await page('src/pages/hikari/Orders.jsx', form, imported)
    await find(h.render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    const saved = h.calls.find(([name]) => name === 'createOrder')?.[1]
    assert.ok(saved)
    assert.equal(saved.delivery_method, imported ? 'delivery' : 'pickup')
    if (imported) {
      assert.match(saved.delivery_address, /Cargotrans a Estelí/)
      assert.equal(saved.recipient_name, 'Alma Medina')
      assert.equal(saved.estimated_delivery_date, '2026-11-25')
    }
  }
})


test('Hikari failed imported save retries shipping without clearing its reviewable facts', async () => {
  const form = threadOrderPrefill({ customer_name: 'Cliente', summary: 'Vitral', delivery_method: 'envío por Cargotrans a Estelí', delivery_date: '2026-11-25', quoted_amount: 300 })
  form.recipient_name = 'Alma Medina'
  const h = await page('src/pages/hikari/Orders.jsx', form, true, { failCreateOnce: true })
  const submit = () => find(h.render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await submit()
  assert.ok(h.calls.some(([name]) => name === 'error'))
  await submit()
  const saved = h.calls.filter(([name]) => name === 'createOrder').map(([, value]) => value)
  assert.equal(saved.length, 2)
  assert.equal(saved[1].delivery_method, 'delivery')
  assert.equal(saved[1].delivery_address, form.delivery_address)
  assert.equal(saved[1].recipient_name, 'Alma Medina')
  assert.equal(saved[1].estimated_delivery_date, '2026-11-25')
})
