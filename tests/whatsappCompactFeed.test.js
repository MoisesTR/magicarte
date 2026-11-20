import test from 'node:test'
import assert from 'node:assert/strict'
import * as feed from '../src/utils/whatsappFeed.js'

const now = new Date('2026-11-20T04:00:00Z') // Nov 19, 22:00 Managua
const keys = ['today', 'unanswered', 'toQuote', 'payments', 'waiting', 'inOrders', 'closed']
const groupsWith = (...nonempty) =>
  keys.map((key) => ({
    key,
    threads: nonempty.includes(key) ? [{ id: key }] : [],
  }))
const open = (fields = {}) => ({ status: 'to_quote', kind: 'quote', ...fields })

test('isNotCustomer requires done status and the exact lost reason prefix', () => {
  for (const lost_reason of ['No es cliente', 'No es cliente: delivery', 'No es cliente equivocado'])
    assert.equal(feed.isNotCustomer({ status: 'done', lost_reason }), true)
  for (const status of ['to_quote', 'sent', 'follow_up', 'won', 'lost'])
    assert.equal(feed.isNotCustomer({ status, lost_reason: 'No es cliente: proveedor' }), false)
  for (const lost_reason of [undefined, null, '', 'No aceptó', 'no es cliente', ' No es cliente'])
    assert.equal(feed.isNotCustomer({ status: 'done', lost_reason }), false)
  assert.equal(feed.isNotCustomer({ status: 'done' }), false)
})

test('non-customer row chips override quoted money and stale urgency with muted classification', () => {
  for (const lost_reason of ['No es cliente', 'No es cliente: delivery'])
    assert.deepEqual(feed.rowChip({
      status: 'done',
      lost_reason,
      quoted_amount: 1200,
      promised_date: '2026-11-01',
      awaiting_reply: true,
    }, now), { text: lost_reason, tone: 'neutral' })
})

test('non-customer threads appear only in Cerrados despite stale open-task and delivery fields', () => {
  const groups = feed.groupThreads([{
    id: 'not-customer',
    status: 'done',
    kind: 'other',
    lost_reason: 'No es cliente: delivery',
    status_changed_at: now.toISOString(),
    promised_date: '2026-11-01',
    delivery_date: '2026-11-19',
    paid_amount: 100,
    awaiting_reply: true,
    follow_up_date: '2026-11-01',
  }], now)
  assert.deepEqual(groups.filter((group) => group.key !== 'closed').flatMap((group) => group.threads), [])
  assert.deepEqual(groups.find((group) => group.key === 'closed').threads.map((thread) => thread.id), ['not-customer'])
})

for (const [index, key] of keys.slice(0, 5).entries()) {
  test(`default tab prioritizes ${key} regardless of input order`, () => {
    const groups = groupsWith(...keys.slice(index)).reverse()
    const before = structuredClone(groups)
    assert.equal(feed.defaultFeedTab(groups), key)
    assert.deepEqual(groups, before)
  })
}
test('won chats go to En Pedidos; lost and non-customer chats go to Descartados', () => {
  const at = '2026-11-19T12:00:00Z'
  const groups = feed.groupThreads([
    open({ id: 'linked', status: 'won', order_id: 'order-89', status_changed_at: at }),
    open({ id: 'won', status: 'won', status_changed_at: at }),
    open({ id: 'lost', status: 'lost', status_changed_at: at }),
    open({ id: 'not-customer', status: 'done', lost_reason: 'No es cliente: delivery', status_changed_at: at }),
  ], now)
  const inOrders = groups.find((group) => group.key === 'inOrders')
  const discarded = groups.find((group) => group.key === 'closed')
  assert.equal(inOrders.title, 'En Pedidos (30 días)')
  assert.equal(discarded.title, 'Descartados (30 días)')
  assert.deepEqual(inOrders.threads.map((thread) => thread.id).sort(), ['linked', 'won'])
  assert.deepEqual(discarded.threads.map((thread) => thread.id).sort(), ['lost', 'not-customer'])
  assert.equal(feed.defaultFeedTab(groups), 'today')
})

test('empty feed and closed-only feed default to today, never a closed task', () => {
  assert.equal(feed.defaultFeedTab([]), 'today')
  assert.equal(feed.defaultFeedTab(groupsWith()), 'today')
  assert.equal(feed.defaultFeedTab(groupsWith('closed')), 'today')
})

test('remembered tabs are scoped to business and only restored while populated', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }
  const groups = groupsWith('today', 'waiting', 'closed')
  feed.saveFeedTab('business-a', 'waiting', storage)
  feed.saveFeedTab('business-b', 'closed', storage)
  assert.equal(feed.loadFeedTab('business-a', groups, storage), 'waiting')
  assert.equal(feed.loadFeedTab('business-b', groups, storage), 'closed')
  assert.equal(feed.loadFeedTab('business-c', groups, storage), 'today')
  assert.equal(
    feed.loadFeedTab('business-a', groupsWith('payments'), storage),
    'payments'
  )
  assert.equal(feed.loadFeedTab('business-a', groups, storage), 'waiting')
})
test('denied storage, unknown preferences, and missing business safely use defaults', () => {
  const denied = {
    getItem() {
      throw Error('denied')
    },
    setItem() {
      throw Error('denied')
    },
  }
  assert.equal(feed.loadFeedTab('a', groupsWith('toQuote'), denied), 'toQuote')
  assert.doesNotThrow(() => feed.saveFeedTab('a', 'today', denied))
  assert.equal(
    feed.loadFeedTab('a', groupsWith('waiting'), { getItem: () => 'invalid' }),
    'waiting'
  )
  assert.equal(
    feed.loadFeedTab(null, groupsWith('toQuote'), {
      getItem() {
        assert.fail('missing business must not read shared storage')
      },
    }),
    'toQuote'
  )
  assert.doesNotThrow(() =>
    feed.saveFeedTab(null, 'today', {
      setItem() {
        assert.fail('missing business must not write shared storage')
      },
    })
  )
})

test('tab keyboard arrows wrap, Home/End navigate, and unrelated keys are ignored', () => {
  const groups = groupsWith()
  assert.equal(feed.feedTabKey(groups, 'today', 'ArrowLeft'), 'closed')
  assert.equal(feed.feedTabKey(groups, 'closed', 'ArrowRight'), 'today')
  assert.equal(feed.feedTabKey(groups, 'toQuote', 'ArrowRight'), 'payments')
  assert.equal(feed.feedTabKey(groups, 'payments', 'ArrowLeft'), 'toQuote')
  assert.equal(feed.feedTabKey(groups, 'waiting', 'Home'), 'today')
  assert.equal(feed.feedTabKey(groups, 'today', 'End'), 'closed')
  assert.equal(feed.feedTabKey(groups, 'today', 'Tab'), null)
  assert.equal(feed.feedTabKey([], 'today', 'ArrowRight'), null)
})

test('waiting group alone is limited to eight until explicitly expanded', () => {
  const threads = Array.from({ length: 30 }, (_, id) => ({ id }))
  const waiting = { key: 'waiting', threads }
  assert.deepEqual(feed.visibleFeedThreads(waiting, false), threads.slice(0, 8))
  assert.deepEqual(feed.visibleFeedThreads(waiting, true), threads)
  assert.deepEqual(
    feed.visibleFeedThreads({ key: 'today', threads }, false),
    threads
  )
  assert.equal(waiting.threads.length, 30)
  assert.deepEqual(
    feed.visibleFeedThreads(
      { key: 'waiting', threads: threads.slice(0, 8) },
      false
    ),
    threads.slice(0, 8)
  )
})

test('row chip prioritizes earliest overdue date over reply and amount', () => {
  assert.deepEqual(
    feed.rowChip(
      open({
        promised_date: '2026-11-19',
        follow_up_date: '2026-11-17',
        awaiting_reply: true,
        quoted_amount: 900,
      }),
      now
    ),
    { text: 'Vencido 2 d', tone: 'danger' }
  )
  assert.deepEqual(feed.rowChip(open({ promised_date: '2026-11-19' }), now), {
    text: 'Prometido hoy',
    tone: 'warning',
  })
  assert.deepEqual(feed.rowChip(open({ follow_up_date: '2026-11-18' }), now), {
    text: 'Vencido 1 d',
    tone: 'danger',
  })
})
test('row chip uses Managua day even after UTC midnight', () => {
  assert.deepEqual(
    feed.rowChip(
      open({ promised_date: '2026-11-20', quoted_amount: 500 }),
      now
    ),
    { text: 'C$ 500.00', tone: 'neutral' }
  )
  assert.deepEqual(
    feed.rowChip(open({ promised_date: '2026-11-19' }), '2026-11-20T06:00:00Z'),
    { text: 'Vencido 1 d', tone: 'danger' }
  )
})
test('awaiting reply chips use hours then days, clamp future messages, and tolerate missing dates', () => {
  const chip = (at) =>
    feed.rowChip(
      open({ awaiting_reply: true, last_customer_message_at: at }),
      now
    )
  assert.deepEqual(chip('2026-11-20T01:00:00Z'), {
    text: 'Escribió hace 3 h',
    tone: 'warning',
  })
  assert.deepEqual(chip('2026-11-18T04:00:00Z'), {
    text: 'Escribió hace 2 d',
    tone: 'warning',
  })
  assert.deepEqual(chip('2026-11-20T05:00:00Z'), {
    text: 'Escribió hace 0 h',
    tone: 'warning',
  })
  assert.deepEqual(chip(null), { text: 'Sin responder', tone: 'warning' })
  assert.deepEqual(chip('invalid'), { text: 'Sin responder', tone: 'warning' })
})
test('waiting chips prefer calendar response age; quotes/payments can show their amount', () => {
  assert.deepEqual(
    feed.rowChip(
      open({
        status: 'sent',
        last_our_message_at: '2026-11-17T23:00:00Z',
        quoted_amount: '450.5',
      }),
      now
    ),
    { text: 'Sin respuesta 2 d', tone: 'neutral' }
  )
  assert.deepEqual(
    feed.rowChip(
      open({ status: 'sent', last_our_message_at: '2026-11-20T05:00:00Z' }),
      now
    ),
    { text: 'Sin respuesta 0 d', tone: 'neutral' }
  )
  assert.deepEqual(feed.rowChip(open({ quoted_amount: '450.5' }), now), {
    text: 'C$ 450.50',
    tone: 'neutral',
  })
  assert.deepEqual(
    feed.rowChip(
      open({
        kind: 'payment',
        status: 'follow_up',
        last_our_message_at: '2026-11-17T23:00:00Z',
        quoted_amount: 0,
      }),
      now
    ),
    { text: 'C$ 0.00', tone: 'neutral' }
  )
  assert.deepEqual(
    feed.rowChip(open({ status: 'sent', last_our_message_at: 'invalid' }), now),
    { text: 'Cotización enviada', tone: 'neutral' }
  )
  assert.deepEqual(feed.rowChip(open(), now), {
    text: 'Por cotizar',
    tone: 'neutral',
  })
})
for (const status of ['won', 'lost', 'done']) {
  test(`closed ${status} rows never retain stale urgency`, () => {
    const row = {
      status,
      promised_date: '2026-11-01',
      awaiting_reply: true,
      last_customer_message_at: '2026-11-17T04:00:00Z',
      last_our_message_at: '2026-11-17T04:00:00Z',
    }
    assert.deepEqual(feed.rowChip(row, now), {
      text: feed.STATUS_LABELS[status],
      tone: 'neutral',
    })
    assert.deepEqual(feed.rowChip({ ...row, quoted_amount: 1200 }, now), {
      text: 'C$ 1,200.00',
      tone: 'neutral',
    })
  })
}
