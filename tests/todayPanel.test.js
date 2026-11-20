import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getManaguaContext, dateKey, getSectionOrder, selectDeliveries, selectReceivables,
  selectFollowUps, selectProduction, selectLowStock, selectDayClose, selectKPIs,
} from '../src/utils/todayPanel.js'
const now = new Date('2026-11-19T16:00:00Z') // Thursday, 10:00 Managua
const order = (id, fields = {}) => ({ id, status: 'pending', total_amount: 100, delivery_fee: 20, order_payments: [], ...fields })
const ids = rows => rows.map(row => row.id)

test('Managua calendar ignores host timezone and UTC midnight', () => {
  const context = getManaguaContext(new Date('2026-11-20T05:59:00Z'))
  assert.equal(context.today, '2026-11-19')
  assert.equal(context.hour, 23)
  assert.equal(context.tomorrow, '2026-11-20')
  assert.equal(context.weekEnd, '2026-11-22')
  assert.match(context.dateLabel, /jueves.*19.*noviembre.*2026/)
})
for (const [instant, greeting] of [
  ['2026-11-19T06:00:00Z', 'Buenos días'],
  ['2026-11-19T17:59:00Z', 'Buenos días'],
  ['2026-11-19T18:00:00Z', 'Buenas tardes'],
  ['2026-11-19T23:59:00Z', 'Buenas tardes'],
  ['2026-11-20T00:00:00Z', 'Buenas noches'],
]) test(`greeting boundary ${instant}`, () => assert.equal(getManaguaContext(new Date(instant)).greeting, greeting))

test('date keys preserve SQL dates, convert timestamps and reject missing/invalid dates', () => {
  assert.equal(dateKey('2026-11-19'), '2026-11-19')
  assert.equal(dateKey('2026-11-20T05:00:00Z'), '2026-11-19')
  for (const value of [null, '', 'bad', '2026-02-30']) assert.equal(dateKey(value), null)
})
test('calendar arithmetic handles Sunday, month and year rollover', () => {
  const sunday = getManaguaContext(new Date('2026-11-22T16:00:00Z'))
  assert.equal(sunday.weekEnd, '2026-11-22')
  assert.equal(getManaguaContext(new Date('2027-01-01T05:00:00Z')).tomorrow, '2027-01-01')
})
for (const [instant, first] of [[now, 'deliveries'], [new Date('2026-11-19T18:00:00Z'), 'followUps'], [new Date('2026-11-20T00:00:00Z'), 'dayClose']]) {
  test(`section emphasis starts with ${first} and keeps all sections once`, () => {
    const result = getSectionOrder(instant)
    assert.equal(result[0], first)
    assert.equal(new Set(result).size, 6)
    assert.deepEqual([...result].sort(), ['dayClose', 'deliveries', 'followUps', 'lowStock', 'production', 'receivables'])
  })
}
test('deliveries are exclusive date groups through Sunday, sorted and only open', () => {
  const orders = [
    order('overdue2', { estimated_delivery_date: '2026-11-18' }),
    order('week', { estimated_delivery_date: '2026-11-22' }),
    order('today', { estimated_delivery_date: '2026-11-19' }),
    order('tomorrow', { estimated_delivery_date: '2026-11-20' }),
    order('overdue1', { estimated_delivery_date: '2026-11-01', status: 'backlog' }),
    order('later', { estimated_delivery_date: '2026-11-23' }), order('undated'),
    order('done', { status: 'completed', estimated_delivery_date: '2026-11-19' }),
    order('canceled', { status: 'canceled', estimated_delivery_date: '2026-11-18' }),
  ]
  const snapshot = structuredClone(orders)
  const groups = selectDeliveries(orders, now)
  assert.deepEqual(ids(groups.overdue), ['overdue1', 'overdue2'])
  assert.deepEqual(ids(groups.today), ['today'])
  assert.deepEqual(ids(groups.tomorrow), ['tomorrow'])
  assert.deepEqual(ids(groups.week), ['week'])
  assert.deepEqual(orders, snapshot)
})
test('Sunday tomorrow is still tomorrow, never duplicated in rest of week', () => {
  const groups = selectDeliveries([order('monday', { estimated_delivery_date: '2026-11-23' })], new Date('2026-11-22T16:00:00Z'))
  assert.deepEqual(ids(groups.tomorrow), ['monday'])
  assert.deepEqual(groups.week, [])
})
test('receivables reuse gross payment balance including delivery and ignore is_gift/payment_status', () => {
  const rows = selectReceivables([
    order('partial', { order_payments: [{ amount: 30, method: 'tarjeta' }], payment_status: 'paid', estimated_delivery_date: '2026-11-20' }),
    order('gift', { is_gift: true, total_amount: 10, estimated_delivery_date: '2026-11-19' }),
    order('paid', { order_payments: [{ amount: 120 }] }),
    order('overpaid', { order_payments: [{ amount: 121 }] }),
    order('done', { status: 'completed' }), order('canceled', { status: 'canceled' }), order('undated'),
  ])
  assert.deepEqual(ids(rows), ['gift', 'partial', 'undated'])
  assert.equal(rows[1].paid, 30)
  assert.equal(rows[1].balance, 90)
  assert.equal(rows[1].chargeTotal, 120)
})
test('no-deposit flag applies only beyond pending/backlog with exactly zero paid', () => {
  for (const status of ['backlog', 'pending', 'confirmed', 'in_progress', 'ready']) {
    const [row] = selectReceivables([order(status, { status })])
    assert.equal(row.withoutDeposit, !['backlog', 'pending'].includes(status))
  }
  assert.equal(selectReceivables([order('partial', { status: 'in_progress', order_payments: [{ amount: 1 }] })])[0].withoutDeposit, false)
})
test('follow-ups include past/today completed post-delivery reminders, sorted overdue first, with backlog count', () => {
  const result = selectFollowUps([
    order('today', { follow_up_date: '2026-11-19', follow_up_reason: 'deposit_request' }),
    order('old', { follow_up_date: '2026-11-17' }),
    order('completed', { status: 'completed', follow_up_date: '2026-11-18', follow_up_reason: 'delivery_received_check' }),
    order('future', { follow_up_date: '2026-11-20' }), order('backlog', { status: 'backlog' }), order('none'),
  ], now)
  assert.deepEqual(ids(result.orders), ['old', 'completed', 'today'])
  assert.equal(result.orders[2].follow_up_reason, 'deposit_request')
  assert.equal(result.backlogCount, 1)
})
test('production exposes all real open status keys, including zero counts', () => {
  const counts = selectProduction([order('a', { status: 'backlog' }), order('b'), order('c'), order('d', { status: 'completed' }), order('e', { status: 'canceled' })])
  assert.deepEqual(counts, { backlog: 1, pending: 2, confirmed: 0, in_progress: 0, ready: 0 })
})
test('low stock only includes active low items and retains filament swatch metadata', () => {
  const filament = { id: 'f', name: 'PLA', is_active: true, is_low_stock: true, inventory_kind: 'filament', color_hex: '#ABCDEF', color_transparent: true }
  assert.deepEqual(selectLowStock([filament, { is_active: false, is_low_stock: true }, { is_active: true, is_low_stock: false }]), [filament])
})
test('day close includes every payment received today, even on closed orders, grouped by method', () => {
  const close = selectDayClose([order('closed', { status: 'completed' }), order('canceled', { status: 'canceled' })], [
    { order_id: 'closed', amount: '25', method: 'efectivo', paid_at: '2026-11-19' },
    { order_id: 'canceled', amount: '75', method: 'tarjeta', paid_at: '2026-11-20T05:30:00Z' },
    { amount: 10, method: 'efectivo', paid_at: '2026-11-19T06:00:00Z' },
    { amount: 30, method: 'transferencia', paid_at: '2026-11-20T06:00:00Z' },
    { amount: 999, method: 'efectivo', paid_at: null },
  ], now)
  assert.equal(close.paymentsTotal, 110)
  assert.deepEqual(close.paymentsByMethod, { efectivo: 35, tarjeta: 75 })
})
test('day close uses created_at rather than scheduled order_date, completed_at rather than status alone', () => {
  const close = selectDayClose([
    order('created', { created_at: '2026-11-20T05:00:00Z', order_date: '2026-11-01' }),
    order('notcreated', { created_at: '2026-11-18T20:00:00Z', order_date: '2026-11-19' }),
    order('done', { status: 'completed', completed_at: '2026-11-19T18:00:00Z' }),
    order('oldDone', { status: 'completed', completed_at: '2026-11-18T18:00:00Z' }),
    order('reopened', { status: 'in_progress', completed_at: '2026-11-19T18:00:00Z' }),
  ], [], now)
  assert.equal(close.createdCount, 1)
  assert.equal(close.createdTotal, 120)
  assert.equal(close.completedCount, 1)
})
test('KPI row balances all open orders and counts follow-ups today separately from overdue', () => {
  const result = selectKPIs([
    order('a', { estimated_delivery_date: '2026-11-19', follow_up_date: '2026-11-19', order_payments: [{ amount: 20 }] }),
    order('b', { estimated_delivery_date: '2026-11-18', follow_up_date: '2026-11-18' }),
    order('done', { status: 'completed' }),
  ], now)
  assert.deepEqual(result, { deliveriesToday: 1, overdue: 1, receivableTotal: 220, followUpsToday: 1 })
})
test('empty selector contracts are stable', () => {
  assert.deepEqual(selectDeliveries([], now), { overdue: [], today: [], tomorrow: [], week: [] })
  assert.deepEqual(selectReceivables([]), [])
  assert.deepEqual(selectFollowUps([], now), { orders: [], backlogCount: 0 })
  assert.deepEqual(selectLowStock([]), [])
  assert.deepEqual(selectDayClose([], [], now), { paymentsTotal: 0, paymentsByMethod: {}, createdCount: 0, createdTotal: 0, completedCount: 0 })
})
