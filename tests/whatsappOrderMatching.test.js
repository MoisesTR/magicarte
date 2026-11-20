import test from 'node:test'
import assert from 'node:assert/strict'
import * as feed from '../src/utils/whatsappFeed.js'

const thread = (fields = {}) => ({
  id: 'thread',
  business_id: 2,
  chat_key: '50588841808',
  status: 'sent',
  requested_at: '2026-11-20T12:00:00Z',
  created_at: '2026-11-10T12:00:00Z',
  ...fields,
})
const order = (fields = {}) => ({
  id: 'order',
  business_id: 2,
  customer_phone: '88841808',
  status: 'confirmed',
  created_at: '2026-11-20T12:00:00Z',
  ...fields,
})
for (const [input, expected] of [
  ['+505 8884 1808', '88841808'],
  ['505-8884-1808', '88841808'],
  ['88841808', '88841808'],
  ['50588841808', '88841808'],
  ['50672545734', '50672545734'],
  [null, null],
  ['', null],
  [undefined, null],
  ['123-4567', null],
  ['---', null],
  ['50512345', '50512345'],
  ['150588841808', '150588841808'],
  [88841808, '88841808'],
])
  test(`normalizePhone ${JSON.stringify(input)}`, () => {
    assert.equal(feed.normalizePhone(input), expected)
  })

test('matches normalized phone within the same business without mutating inputs', () => {
  const rows = [thread()],
    orders = [order()]
  const before = structuredClone({ rows, orders })
  const matches = feed.matchThreadsToOrders(rows, orders)
  assert.ok(matches instanceof Map)
  assert.equal(matches.get('thread'), orders[0])
  assert.deepEqual({ rows, orders }, before)
  assert.equal(
    feed.matchThreadsToOrders(rows, [order({ business_id: 3 })]).size,
    0
  )
  assert.equal(
    feed.matchThreadsToOrders(
      [thread({ business_id: null })],
      [order({ business_id: null })]
    ).size,
    0
  )
  assert.equal(
    feed.matchThreadsToOrders(rows, [order({ business_id: '2' })]).size,
    1
  )
})
test('date window is inclusive at requested_at minus two days and excludes one millisecond earlier', () => {
  const boundary = order({ created_at: '2026-11-18T12:00:00Z' })
  assert.equal(
    feed.matchThreadsToOrders([thread()], [boundary]).get('thread'),
    boundary
  )
  assert.equal(
    feed.matchThreadsToOrders(
      [thread()],
      [order({ created_at: '2026-11-18T11:59:59.999Z' })]
    ).size,
    0
  )
})
test('missing requested_at uses created_at; invalid dates and missing phones never match', () => {
  assert.equal(
    feed.matchThreadsToOrders(
      [thread({ requested_at: null })],
      [order({ created_at: '2026-11-08T12:00:00Z' })]
    ).size,
    1
  )
  for (const value of [null, '', 'not-a-date']) {
    assert.equal(
      feed.matchThreadsToOrders([thread()], [order({ created_at: value })])
        .size,
      0
    )
  }
  assert.equal(
    feed.matchThreadsToOrders([thread({ requested_at: 'bad' })], [order()])
      .size,
    0
  )
  assert.equal(
    feed.matchThreadsToOrders(
      [thread({ requested_at: null, created_at: null })],
      [order()]
    ).size,
    0
  )
  assert.equal(
    feed.matchThreadsToOrders(
      [thread({ chat_key: '123' })],
      [order({ customer_phone: '123' })]
    ).size,
    0
  )
  assert.equal(
    feed.matchThreadsToOrders([thread()], [order({ customer_phone: null })])
      .size,
    0
  )
})
test('canceled is the real Orders status; most recent eligible order wins regardless of input order', () => {
  const older = order({ id: 'older', created_at: '2026-11-19T00:00:00Z' })
  const newer = order({ id: 'newer', created_at: '2026-11-21T00:00:00Z' })
  const canceled = order({
    id: 'canceled',
    status: 'canceled',
    created_at: '2026-11-22T00:00:00Z',
  })
  for (const orders of [
    [older, newer, canceled],
    [canceled, newer, older],
  ]) {
    assert.equal(
      feed.matchThreadsToOrders([thread()], orders).get('thread'),
      newer
    )
  }
})
test('explicit order_id wins even with different phone, old date or canceled status; absent link never rematches', () => {
  const linked = order({
    id: 'linked',
    customer_phone: null,
    status: 'canceled',
    created_at: '2020-01-01',
  })
  assert.equal(
    feed
      .matchThreadsToOrders([thread({ order_id: 'linked' })], [order(), linked])
      .get('thread'),
    linked
  )
  assert.equal(
    feed.matchThreadsToOrders([thread({ order_id: 'missing' })], [order()])
      .size,
    0
  )
  assert.equal(
    feed.matchThreadsToOrders(
      [thread({ order_id: 'linked' })],
      [order({ ...linked, business_id: 3 })]
    ).size,
    0
  )
})
test('name: keys never match, including explicit links or numeric names; foreign phones stay distinct', () => {
  for (const fields of [
    { chat_key: 'name:88841808' },
    { chat_key: 'name:Ana', order_id: 'order' },
  ]) {
    assert.equal(feed.matchThreadsToOrders([thread(fields)], [order()]).size, 0)
  }
  assert.equal(
    feed.matchThreadsToOrders(
      [thread({ chat_key: '50672545734' })],
      [order({ customer_phone: '72545734' })]
    ).size,
    0
  )
  assert.equal(
    feed.matchThreadsToOrders(
      [thread({ chat_key: '50672545734' })],
      [order({ customer_phone: '+506 7254-5734' })]
    ).size,
    1
  )
})
