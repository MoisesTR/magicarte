import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import * as payments from '../src/utils/orderPayments.js'
import { COLUMNS, TABLE } from '../src/utils/constants.js'

const require = createRequire(import.meta.url)
const orders = [
  { id: 'debt', client_id: 'client', status: 'ready', total_amount: 100.1, delivery_fee: 10.2, order_date: '2026-11-20', order_payments: [{ amount: 0.1, method: 'tarjeta' }, { amount: 0.2, method: 'tarjeta' }, { amount: 29.7, method: 'efectivo' }] },
  { id: 'credit', client_id: 'client', status: 'completed', total_amount: 20, order_date: '2026-11-20', order_payments: [{ amount: 25 }] },
  { id: 'draft', client_id: 'client', status: 'backlog', total_amount: 1000 },
  { id: 'canceled', client_id: 'client', status: 'canceled', total_amount: 999 },
  { id: 'gift', client_id: 'client', status: 'pending', is_gift: true, total_amount: 500 },
]

function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  if (tree && typeof tree === 'object') return textOf(tree.props?.children)
  return tree == null || typeof tree === 'boolean' ? '' : String(tree)
}

async function render(file) {
  const source = await readFile(file, 'utf8')
  const stateNames = [...source.matchAll(/const \[(\w+),\s*\w+\] = useState/g)].map(match => match[1])
  let cursor = 0
  const summaries = []
  const react = { useEffect() {}, useMemo: fn => fn(), useState(initial) {
    const name = stateNames[cursor++]
    const overrides = { user: { email: 'test@example.test' }, checkingAuth: false, orders, linkedOrders: orders, clients: [{ id: 'client', name: 'Ana' }] }
    return [name in overrides ? overrides[name] : typeof initial === 'function' ? initial() : initial, () => {}]
  } }
  const module = { exports: {} }
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react
    if (name === 'react-router-dom') return { useNavigate: () => () => {} }
    if (name.endsWith('/BusinessContext')) return { useBusiness: () => ({ currentBusinessId: 1, currentBusiness: { name: 'Magic Arte', slug: 'magic-arte' }, isAllBusinesses: false }) }
    if (name.endsWith('/orderPayments')) return { ...payments, summarizeReceivables(rows) { const result = payments.summarizeReceivables(rows); summaries.push(result); return result } }
    if (name.includes('/utils/')) return require(`../src/utils/${name.split('/').pop()}.js`)
    if (name.includes('/data/') || name.endsWith('/supabaseClient')) return {}
    if (name.includes('/components/')) return { __esModule: true, default: () => null }
    return require(name)
  }, module, module.exports)
  return { tree: module.exports.default(), summaries }
}

test('Finances and Clients use identical real receivables calculations for the same linked fixture', async () => {
  const finances = await render('src/pages/Finances.jsx')
  const clients = await render('src/pages/Clients.jsx')
  const expected = { totalCharged: 130.3, totalPaid: 55, pending: 80.3, count: 2 }
  assert.ok(finances.summaries.some(summary => JSON.stringify(summary) === JSON.stringify(expected)), 'Finances must calculate billable debt through the shared contract')
  assert.ok(clients.summaries.some(summary => JSON.stringify(summary) === JSON.stringify(expected)), 'Clients must calculate the same per-client receivables, including payments')
  assert.match(textOf(finances.tree), /Pendiente de cobroC\$ 80/)
  assert.match(textOf(clients.tree), /130/, 'ranking still uses gross charged, not paid or balance')
})

async function dataApi(file) {
  const requests = []
  const supabase = { from(table) {
    const request = { table, filters: [] }; requests.push(request)
    return {
      select(columns) { request.columns = columns; return this },
      not(...args) { request.filters.push(args); return this },
      eq(...args) { request.filters.push(args); return this },
      order() { return this },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) },
    }
  } }
  const source = (await readFile(file, 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const api = new Function('supabase', 'TABLE', 'COLUMNS', ...Object.keys(payments), `${source}; return { ${file.includes('clients') ? 'fetchLinkedOrdersForBusiness' : 'fetchFinanceOrders, fetchOrdersForBusiness'} }`)(supabase, TABLE, COLUMNS, ...Object.values(payments))
  return { api, requests }
}

test('Finances and Clients queries share the billable exclusion and retain business scope/payment rows', async () => {
  const finance = await dataApi('src/data/orders.js')
  const clients = await dataApi('src/data/clients.js')
  await finance.api.fetchFinanceOrders(7)
  await clients.api.fetchLinkedOrdersForBusiness(7)
  for (const { requests } of [finance, clients]) {
    assert.ok(requests[0].filters.some(filter => JSON.stringify(filter) === JSON.stringify(['status', 'in', '("backlog","canceled")'])))
    assert.ok(requests[0].filters.some(filter => JSON.stringify(filter) === JSON.stringify(['business_id', 7])))
    assert.match(requests[0].columns, /order_payments\(/)
  }
})

test('order selects and UI sources no longer request or read legacy payment columns', async () => {
  assert.doesNotMatch(COLUMNS[TABLE.ORDERS], /payment_status|payment_method/)
  const finance = await dataApi('src/data/orders.js')
  await finance.api.fetchOrdersForBusiness(7)
  const topLevel = finance.requests[0].columns.split('order_items')[0]
  assert.doesNotMatch(topLevel, /\*|payment_status|payment_method/)
  assert.match(topLevel, /business_id/)
  assert.match(topLevel, /partner_share_amount/)
  for (const file of ['src/pages/Orders.jsx', 'src/pages/hikari/Orders.jsx', 'src/components/QuickEngravingForm.jsx', 'src/utils/quoteForms.js']) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /payment_status|payment_method/, file)
  }
})
