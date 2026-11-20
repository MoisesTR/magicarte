import test from 'node:test'
import assert from 'node:assert/strict'
import * as feed from '../src/utils/whatsappFeed.js'

const now = '2026-11-20T18:00:00Z' // Friday in Managua
const open = (id, fields = {}) => ({
  id,
  status: 'sent',
  kind: 'quote',
  ...fields,
})
const ids = (groups) =>
  groups.map((group) => group.threads.map((row) => row.id))

test('deliveries use exclusive calendar groups, sorted dates, no closed rows, and undated last', () => {
  const rows = [
    open('later', { delivery_date: '2026-12-01' }),
    open('next', { delivery_date: '2026-11-23' }),
    open('week', { delivery_date: '2026-11-22' }),
    open('tomorrow', { delivery_date: '2026-11-21' }),
    open('today', { delivery_date: '2026-11-20' }),
    open('old', { delivery_date: '2026-11-18' }),
    open('older', { delivery_date: '2026-11-17' }),
    open('undated', { paid_amount: '700' }),
    open('unconfirmed'),
    open('closed', {
      status: 'won',
      paid_amount: 700,
      delivery_date: '2026-11-20',
    }),
  ]
  const before = structuredClone(rows)
  const groups = feed.groupDeliveries(rows, now)
  assert.deepEqual(
    groups.map((group) => group.title),
    [
      'Atrasadas',
      'Hoy',
      'Mañana',
      'Esta semana',
      'Próxima semana',
      'Más adelante',
      'Sin fecha',
    ]
  )
  assert.deepEqual(ids(groups), [
    ['older', 'old'],
    ['today'],
    ['tomorrow'],
    ['week'],
    ['next'],
    ['later'],
    ['undated'],
  ])
  assert.deepEqual(rows, before)
})

test('Managua midnight, Sunday/Monday and year rollover do not move delivery dates', () => {
  const rows = ['2026-12-27', '2026-12-28', '2027-01-03', '2027-01-04'].map(
    (delivery_date) => open(delivery_date, { delivery_date })
  )
  assert.deepEqual(ids(feed.groupDeliveries(rows, '2026-12-28T05:59:59Z')), [
    [],
    ['2026-12-27'],
    ['2026-12-28'],
    [],
    ['2027-01-03'],
    ['2027-01-04'],
    [],
  ])
  assert.deepEqual(ids(feed.groupDeliveries(rows, '2026-12-28T06:00:00Z')), [
    ['2026-12-27'],
    ['2026-12-28'],
    [],
    ['2027-01-03'],
    ['2027-01-04'],
    [],
    [],
  ])
  assert.equal(feed.deliveryDateLabel('2026-11-20', now), 'Hoy')
  assert.equal(feed.deliveryDateLabel('2026-11-21', now), 'Mañana')
  assert.equal(feed.deliveryDateLabel('2026-11-22', now), 'dom 22/11')
  assert.equal(feed.deliveryDateLabel(null, now), 'Sin fecha')
})

test('confirmed takes precedence over all tabs; payment requests always stay in Pagos and due first', () => {
  const rows = [
    open('confirmed', {
      paid_amount: 700,
      promised_date: '2026-11-01',
      awaiting_reply: true,
    }),
    open('dated', { delivery_date: '2026-11-20' }),
    open('payment-later', {
      kind: 'payment',
      status: 'to_quote',
      awaiting_reply: true,
      follow_up_date: '2026-11-23',
    }),
    open('payment-today', {
      kind: 'payment',
      awaiting_reply: true,
      follow_up_date: '2026-11-20',
    }),
    open('payment-overdue', { kind: 'payment', follow_up_date: '2026-11-18' }),
    open('reply', { promised_date: '2026-11-20' }),
  ]
  const groups = feed.groupThreads(rows, now)
  assert.equal(groups[0].key, 'confirmed')
  assert.deepEqual(
    groups
      .find((g) => g.key === 'confirmed')
      .threads.map((t) => t.id)
      .sort(),
    ['confirmed', 'dated']
  )
  assert.deepEqual(
    groups.find((g) => g.key === 'payments').threads.map((t) => t.id),
    ['payment-overdue', 'payment-today', 'payment-later']
  )
  assert.deepEqual(
    groups.find((g) => g.key === 'today').threads.map((t) => t.id),
    ['reply']
  )
  assert.equal(
    new Set(groups.flatMap((g) => g.threads.map((t) => t.id))).size,
    rows.length
  )
  assert.equal(groups[0].count, 1)
  assert.deepEqual(feed.feedKPIs(rows, now), {
    confirmed: 1,
    today: 1,
    unanswered: 0,
    toQuote: 0,
    payments: 3,
  })
  assert.deepEqual(feed.rowChip(rows[3], now), {
    text: 'Revisar hoy',
    tone: 'warning',
  })
  assert.deepEqual(feed.rowChip(rows[4], now), {
    text: 'Vencido 2 d',
    tone: 'danger',
  })
})

test('default confirmed only for overdue/today; unknown remembered keys use actionable default', () => {
  for (const delivery_date of ['2026-11-19', '2026-11-20']) {
    const groups = feed.groupThreads(
      [
        open('delivery', { delivery_date }),
        open('reply', { promised_date: '2026-11-20' }),
      ],
      now
    )
    assert.equal(feed.defaultFeedTab(groups), 'confirmed')
    assert.equal(
      feed.loadFeedTab('a', groups, { getItem: () => 'obsolete' }),
      'confirmed'
    )
  }
  const groups = feed.groupThreads(
    [
      open('delivery', { delivery_date: '2026-11-21' }),
      open('reply', { promised_date: '2026-11-20' }),
    ],
    now
  )
  assert.equal(feed.defaultFeedTab(groups), 'today')
})

test('confirmed date filters ignore activity/promises; overdue included and undated only in all', () => {
  const rows = [
    open('old', { delivery_date: '2026-11-10' }),
    open('today', { delivery_date: '2026-11-20' }),
    open('week', { delivery_date: '2026-11-22' }),
    open('next', {
      delivery_date: '2026-11-23',
      promised_date: '2026-11-01',
      updated_at: now,
    }),
    open('undated', { paid_amount: 700, updated_at: now }),
    open('reply', { promised_date: '2026-11-20' }),
  ]
  assert.deepEqual(
    feed.filterThreadsByDate(rows, 'today', now).map((t) => t.id),
    ['old', 'today', 'reply']
  )
  assert.deepEqual(
    feed.filterThreadsByDate(rows, 'week', now).map((t) => t.id),
    ['old', 'today', 'week', 'reply']
  )
  assert.equal(feed.filterThreadsByDate(rows, 'all', now), rows)
})

for (const [quoted_amount, paid_amount, text, tone] of [
  [1400, 1400, 'Pagado', 'success'],
  [1400, 1500, 'Pagado', 'success'],
  [1400, 700, 'Pagó la mitad · falta C$700', 'warning'],
  [1400, 699, 'Pagó la mitad · falta C$701', 'warning'],
  [1400, 701, 'Pagó la mitad · falta C$699', 'warning'],
  [1400, 698.99, 'Anticipo C$698.99 · falta C$701.01', 'warning'],
  [1000, 200, 'Anticipo C$200 · falta C$800', 'warning'],
  [null, '700.5', 'Pagó C$700.50', 'warning'],
  [1400, 0, 'Sin pago registrado', 'neutral'],
])
  test(`payment chip ${quoted_amount}/${paid_amount}`, () =>
    assert.deepEqual(feed.paymentChip({ quoted_amount, paid_amount }), {
      text,
      tone,
    }))

test('editor validates delivery fields and payment amount; additive payment rounds in cents', () => {
  const form = {
    customer_name: 'Ana',
    summary: 'Llaveros',
    delivery_date: '2026-11-22',
    delivery_method: ' Retiro El Edén ',
    paid_amount: '700.50',
  }
  const payload = feed.buildThreadPayload(form)
  assert.equal(payload.delivery_date, '2026-11-22')
  assert.equal(payload.delivery_method, 'Retiro El Edén')
  assert.equal(payload.paid_amount, 700.5)
  assert.equal(
    feed.buildThreadPayload({ customer_name: 'Ana', summary: 'Llaveros' })
      .paid_amount,
    0
  )
  for (const value of [-1, NaN, 'NaN', Infinity])
    assert.throws(
      () => feed.buildThreadPayload({ ...form, paid_amount: value }),
      /pago|pagado/i
    )
  assert.throws(
    () => feed.buildThreadPayload({ ...form, delivery_date: '2026-02-30' }),
    /fecha/i
  )
  assert.equal(feed.addThreadPayment('700.10', '0.20'), 700.3)
  assert.throws(() => feed.addThreadPayment(NaN, 20), /pago|monto/i)
  assert.throws(() => feed.addThreadPayment(9999999999.99, 0.01), /pago|monto/i)
  for (const value of [0, -1, '', 'NaN', Infinity, '0.001'])
    assert.throws(() => feed.addThreadPayment(700, value), /pago|monto/i)
})

test('order date comes from agreed delivery, not response promise; unsupported new-order payments remain untouched', () => {
  const form = feed.threadOrderPrefill({
    summary: 'Llaveros',
    promised_date: '2026-11-19',
    delivery_date: '2026-11-22',
    quoted_amount: 1400,
    paid_amount: 700,
  })
  assert.equal(form.estimated_delivery_date, '2026-11-22')
  assert.equal(form.payment_status, 'unpaid')
  assert.equal(Object.hasOwn(form, 'paid_amount'), false)
  assert.equal(
    feed.threadOrderPrefill({
      summary: 'Llaveros',
      promised_date: '2026-11-19',
    }).estimated_delivery_date,
    ''
  )
})
