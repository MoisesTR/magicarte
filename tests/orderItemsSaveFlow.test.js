import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import { newOrderForm } from '../src/utils/quoteForms.js'

const require = createRequire(import.meta.url)
const editors = ['src/pages/Orders.jsx', 'src/pages/hikari/Orders.jsx', 'src/components/QuickEngravingForm.jsx']
const warning = 'Pedido guardado, pero no se pudieron limpiar productos anteriores; revise el pedido.'
const item = { id: 'old-item', product_name: 'Producto', product_description: 'Personalizado', product_id: null, quantity: 1, unit_price: 100, subtotal: 100 }
const order = { id: 'old-order', client_id: 'client', customer_name: 'Ana', order_date: '2026-11-20', status: 'pending', payment_status: 'unpaid', total_amount: 100, order_items: [item], order_payments: [] }

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean)
  return predicate(tree) ? tree : find(tree.props?.children, predicate)
}

async function editor(file, { creating = false, insertError = null, deleteError = null } = {}) {
  const source = await readFile(file, 'utf8')
  const stateNames = [...source.matchAll(/const \[(\w+),\s*\w+\] = useState/g)].map(match => match[1])
  let cursor = 0
  const calls = []
  const form = { ...newOrderForm('2026-11-20'), customer_name: 'Ana', client_id: 'client', items: [{ ...item, is_custom: true }] }
  const react = {
    useEffect() {}, useMemo: fn => fn(), useRef: current => ({ current }),
    useState(initial) {
      const name = stateNames[cursor++]
      const overrides = { user: { id: 'owner' }, checkingAuth: false, showForm: true, editingOrder: creating ? null : order }
      return [name in overrides ? overrides[name] : typeof initial === 'function' ? initial() : initial, () => {}]
    },
  }
  const mutation = name => async (...args) => {
    calls.push([name, ...args])
    if (name === 'insertOrderItems') return { data: [{ id: 'new-item' }], error: insertError }
    if (name === 'deleteOrderItems' || name === 'deleteOrderItemsByIds') return { error: deleteError }
    return { data: [{ id: 'new-order' }], error: null }
  }
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'localStorage', code)(name => {
    if (name === 'react') return react
    if (name === 'react-hot-toast') return { __esModule: true, default: { error: message => calls.push(['toast', message]), success: message => calls.push(['success', message]) } }
    if (name === 'react-router-dom') return { useLocation: () => ({ pathname: '/admin/orders', search: '', hash: '' }), useNavigate: () => () => {} }
    if (name.endsWith('/useThreadOrderDraft')) return { __esModule: true, default: () => ({ formData: form, setFormData() {}, clear() {}, cancelPending() {}, isImported: false, status: 'idle' }) }
    if (name.endsWith('/useThreadOrderImport')) return { __esModule: true, default: () => ({ clearImport() {}, completeConversion: async id => calls.push(['conversion', id]) }) }
    if (name.endsWith('/useOrderDeepLink')) return { __esModule: true, default() {} }
    if (name.endsWith('/BusinessContext')) return { useBusiness: () => ({ currentBusinessId: 2, currentBusiness: { name: 'Magic Arte', slug: 'magic-arte' } }) }
    if (name.endsWith('/supabaseClient')) return { supabase: {} }
    if (name.endsWith('/data/clients')) return { findClientByNormalizedPhone: async () => ({ data: { id: 'client' } }), findClientByExactName: async () => ({ data: { id: 'client' } }), createClientReturning: async () => ({ data: { id: 'client' } }) }
    if (name.includes('/data/')) return new Proxy({}, { get: (_, method) => mutation(method) })
    if (name.includes('/utils/')) return require(`../src/utils/${name.split('/').pop().replace(/\.js$/, '')}.js`)
    if (name.includes('/components/') || name.startsWith('./')) return { __esModule: true, default: () => null }
    return require(name)
  }, module, module.exports, { getItem: () => null })
  const props = { businessId: 2, editingOrder: creating ? null : order, initialThreadForm: creating ? form : null, onSaved: () => calls.push(['refresh']), onClose: () => calls.push(['close']) }
  const tree = file.includes('QuickEngraving') ? module.exports.default(props) : module.exports.default()
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  return calls
}

for (const file of editors) {
  test(`${file}: insert failure never deletes previous rows or reports success`, async () => {
    const calls = await editor(file, { insertError: Error('Insert failed') })
    assert.equal(calls.some(([name]) => name.startsWith('deleteOrderItems')), false)
    assert.equal(calls.some(([name]) => name === 'success'), false)
    assert.ok(calls.some(([name, message]) => name === 'toast' && message.includes('Insert failed')))
  })

  test(`${file}: edit inserts before scoped deletion of loaded ids`, async () => {
    const calls = await editor(file)
    assert.deepEqual(calls.find(([name]) => name === 'deleteOrderItemsByIds'), ['deleteOrderItemsByIds', 'old-order', ['old-item'], 2])
    assert.ok(calls.findIndex(([name]) => name === 'insertOrderItems') < calls.findIndex(([name]) => name === 'deleteOrderItemsByIds'))
    assert.equal(calls.some(([name]) => name === 'deleteOrderItems'), false)
    assert.ok(calls.some(([name]) => name === 'success'))
  })

  test(`${file}: cleanup failure logs, warns and refreshes nonblocking`, async t => {
    t.mock.method(console, 'error', () => {})
    const calls = await editor(file, { deleteError: Error('Cleanup denied') })
    assert.ok(calls.some(([name, message]) => name === 'toast' && message === warning))
    assert.equal(console.error.mock.calls.length, 1)
    assert.ok(calls.some(([name]) => name === 'success'))
    assert.ok(calls.some(([name]) => name === (file.includes('QuickEngraving') ? 'refresh' : 'fetchOrdersForBusiness')))
  })

  test(`${file}: new orders still insert once without any cleanup`, async () => {
    const calls = await editor(file, { creating: true })
    assert.equal(calls.filter(([name]) => name === 'createOrder').length, 1)
    assert.equal(calls.filter(([name]) => name === 'insertOrderItems').length, 1)
    assert.equal(calls.some(([name]) => name.startsWith('deleteOrderItems')), false)
    assert.ok(calls.some(([name]) => name === 'success'))
  })
}
