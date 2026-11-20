import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as paymentHelpers from '../src/utils/orderPayments.js'

const businesses = [
  { id: 1, name: 'Joyería', partner_name: 'Socio', partner_split_pct: 50 },
  { id: 2, name: 'Magic Arte', partner_name: null, partner_split_pct: 0 },
  { id: 3, name: 'Vacío', partner_name: 'Socio', partner_split_pct: 50 },
]
const order = (id, fields = {}) => ({ id, business_id: 1, total_amount: 100, material_cost: 0, partner_split_pct: 50, material_paid_by: 'us', status: 'completed', payment_status: 'unpaid', ...fields })
const rows = [
  order('exact', { total_amount: 100, delivery_fee: 10, partner_share_amount: 30, your_share_amount: 70 }),
  order('partner-material', { total_amount: 200, material_cost: 40, material_paid_by: 'partner', partner_split_pct: 25 }),
  order('our-material', { total_amount: 80, material_cost: 20 }),
  order('partial'), order('backlog', { status: 'backlog' }), order('canceled', { status: 'canceled' }),
  order('no-split', { total_amount: 20, material_cost: 5, partner_split_pct: null }),
  order('magic', { business_id: 2, total_amount: 10, partner_split_pct: null }),
  order('unrelated', { business_id: 99 }),
]
const receipts = rows.map((row, index) => ({ id: index, order_id: row.id, business_id: row.business_id, amount: [110, 210, 80, 50, 100, 100, 20, 10, 100][index] }))

async function api({ orders = rows, payments = receipts, configs = businesses, failTable = null, failOffset = 0 } = {}) {
  const requests = []
  const failure = Error('Read failed')
  const supabase = { from(table) {
    const request = { table, filters: [] }; requests.push(request)
    const query = {
      select(columns) { request.columns = columns; return this },
      order() { return this },
      eq(...filter) { request.filters.push(filter); return this },
      range(from, to) { request.range = [from, to]; return this },
      then(resolve, reject) {
        let data = ({ businesses: configs, orders, order_payments: payments })[table] || []
        for (const [key, value] of request.filters) data = data.filter(row => row[key] === value)
        if (request.range) data = data.slice(request.range[0], request.range[1] + 1)
        const error = table === failTable && (request.range?.[0] || 0) === failOffset ? failure : null
        return Promise.resolve({ data: error ? null : data, error }).then(resolve, reject)
      },
    }
    return query
  } }
  const source = (await readFile('src/data/businesses.js', 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const methods = new Function('supabase', ...Object.keys(paymentHelpers), `${source}; return { fetchBusinessEarnings, fetchPartnerSettlements }`)(supabase, ...Object.values(paymentHelpers))
  return { ...methods, requests, failure }
}

test('business earnings derives paid shares from real gross receipts with exact/material split snapshots and business scope', async () => {
  const h = await api()
  const result = await h.fetchBusinessEarnings()
  assert.equal(result.error, null)
  assert.deepEqual(result.data, [
    { business_id: 1, name: 'Joyería', orders_count: 7, collected: 670, net_to_us_paid: 260, partner_share_paid: 140 },
    { business_id: 2, name: 'Magic Arte', orders_count: 1, collected: 10, net_to_us_paid: 10, partner_share_paid: 0 },
    { business_id: 3, name: 'Vacío', orders_count: 0, collected: 0, net_to_us_paid: 0, partner_share_paid: 0 },
  ])
  assert.ok(h.requests.every(request => !['business_earnings', 'partner_settlements'].includes(request.table)))
  for (const request of h.requests.filter(request => ['orders', 'order_payments'].includes(request.table))) {
    assert.ok(request.filters.some(([key, value]) => key === 'business_id' && [1, 2, 3].includes(value)))
    assert.doesNotMatch(request.columns, /payment_status|payment_method|\*/)
  }
})

test('partner settlements require a configured partner and billable fully paid orders, preserving gross/material/share contracts', async () => {
  const h = await api()
  assert.deepEqual(await h.fetchPartnerSettlements(), { data: [{
    business_id: 1, name: 'Joyería', partner_name: 'Socio', settled_orders: 4,
    gross: 400, material_total: 65, partner_owed: 140, your_take: 260,
  }], error: null })
})

for (const method of ['fetchBusinessEarnings', 'fetchPartnerSettlements']) {
  test(`${method} reads every order/payment page beyond the API cap`, async () => {
    const orders = Array.from({ length: 1001 }, (_, index) => order(String(index), { total_amount: 0.1, partner_share_amount: 0.05, your_share_amount: 0.05 }))
    const payments = orders.map(row => ({ id: row.id, business_id: 1, order_id: row.id, amount: 0.1 }))
    const h = await api({ orders, payments, configs: businesses.slice(0, 1) })
    const result = await h[method]()
    assert.equal(result.error, null)
    const row = result.data[0]
    assert.equal(method === 'fetchBusinessEarnings' ? row.orders_count : row.settled_orders, 1001)
    assert.equal(method === 'fetchBusinessEarnings' ? row.collected : row.gross, 100.1)
    assert.equal(method === 'fetchBusinessEarnings' ? row.partner_share_paid : row.partner_owed, 50.05)
    for (const table of ['orders', 'order_payments']) assert.ok(h.requests.some(request => request.table === table && request.range?.[0] === 1000))
  })

  test(`${method} fails closed on a failed read instead of returning partial aggregates`, async () => {
    const h = await api({ failTable: 'order_payments' })
    assert.deepEqual(await h[method](), { data: null, error: h.failure })
  })
}

for (const method of ['fetchBusinessEarnings', 'fetchPartnerSettlements']) {
  test(`${method} retains fractional-cent percentage shares like the existing SQL formula`, async () => {
    const h = await api({ configs: businesses.slice(0, 1), orders: [order('fraction', { total_amount: 0.01 })], payments: [{ id: 'cash', business_id: 1, order_id: 'fraction', amount: 0.01 }] })
    const result = await h[method]()
    assert.equal(method === 'fetchBusinessEarnings' ? result.data[0].partner_share_paid : result.data[0].partner_owed, 0.005)
    assert.equal(method === 'fetchBusinessEarnings' ? result.data[0].net_to_us_paid : result.data[0].your_take, 0.005)
  })
}
