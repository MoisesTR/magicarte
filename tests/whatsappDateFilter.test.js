import test from 'node:test'
import assert from 'node:assert/strict'
import * as feed from '../src/utils/whatsappFeed.js'

const now = '2026-11-20T04:00:00Z' // Thursday, November 19 at 22:00 Managua.
const row = (id, fields = {}) => ({ id, status: 'to_quote', ...fields })
const ids = (rows) => rows.map((thread) => thread.id)
const activityFields = [
  'last_customer_message_at',
  'last_our_message_at',
  'requested_at',
  'last_reviewed_at',
  'updated_at',
  'created_at',
]

for (const field of activityFields) {
  test(`activity considers ${field} and returns epoch milliseconds`, () => {
    const thread = Object.fromEntries(activityFields.map((key) => [key, null]))
    thread[field] = now
    assert.equal(feed.threadActivityAt(thread), Date.parse(now))
  })
}
test('activity selects the latest instant, ignores invalid/null values, and never mutates', () => {
  const thread = Object.freeze({
    last_customer_message_at: '2026-11-19T23:00:00-06:00',
    last_our_message_at: '2026-11-20T04:30:00Z',
    requested_at: null,
    last_reviewed_at: 'invalid',
    updated_at: '',
    created_at: '2025-01-01T00:00:00Z',
  })
  assert.equal(
    feed.threadActivityAt(thread),
    Date.parse('2026-11-20T05:00:00Z')
  )
  assert.equal(feed.threadActivityAt({}), null)
  assert.equal(
    feed.threadActivityAt({ updated_at: 'invalid', created_at: null }),
    null
  )
})
test('all returns the exact unchanged array, including missing activity', () => {
  const rows = Object.freeze([Object.freeze(row('missing'))])
  assert.equal(feed.filterThreadsByDate(rows, 'all', now), rows)
})
test('today uses the Managua day rather than UTC and keeps original row references/order', () => {
  const rows = Object.freeze([
    Object.freeze(row('yesterday', { created_at: '2026-11-19T05:59:59.999Z' })),
    Object.freeze(row('start', { updated_at: '2026-11-19T06:00:00Z' })),
    Object.freeze(row('after-utc-midnight', { last_reviewed_at: now })),
    Object.freeze(row('tomorrow', { created_at: '2026-11-20T06:00:00Z' })),
    Object.freeze(row('missing')),
  ])
  const result = feed.filterThreadsByDate(rows, 'today', now)
  assert.deepEqual(ids(result), ['start', 'after-utc-midnight'])
  assert.equal(result[0], rows[1])
  assert.equal(rows.length, 5)
})
test('today changes precisely at Managua midnight, not UTC midnight', () => {
  const rows = [
    row('previous-day', { created_at: '2026-11-20T05:59:59.999Z' }),
    row('new-day', { created_at: '2026-11-20T06:00:00Z' }),
  ]
  assert.deepEqual(
    ids(feed.filterThreadsByDate(rows, 'today', '2026-11-20T05:59:59.999Z')),
    ['previous-day']
  )
  assert.deepEqual(
    ids(feed.filterThreadsByDate(rows, 'today', '2026-11-20T06:00:00Z')),
    ['new-day']
  )
})
test('week starts Monday at Managua midnight and includes now but excludes future instants', () => {
  const rows = [
    row('sunday', { created_at: '2026-11-16T05:59:59.999Z' }),
    row('monday', { created_at: '2026-11-16T06:00:00Z' }),
    row('now', { created_at: now }),
    row('future', { created_at: '2026-11-20T04:00:00.001Z' }),
    row('missing'),
  ]
  assert.deepEqual(ids(feed.filterThreadsByDate(rows, 'week', now)), [
    'monday',
    'now',
  ])
})
test('UTC Monday is still Sunday in Managua until 06:00Z', () => {
  const rows = [
    row('previous-monday', { created_at: '2026-11-09T06:00:00Z' }),
    row('sunday', { created_at: '2026-11-16T05:59:59.999Z' }),
    row('new-monday', { created_at: '2026-11-16T06:00:00Z' }),
  ]
  assert.deepEqual(
    ids(feed.filterThreadsByDate(rows, 'week', '2026-11-16T05:59:59.999Z')),
    ['previous-monday', 'sunday']
  )
  assert.deepEqual(
    ids(feed.filterThreadsByDate(rows, 'week', '2026-11-16T06:00:00Z')),
    ['new-monday']
  )
})
test('Managua weeks cross year boundaries without assuming the host timezone', () => {
  const rows = [
    row('sunday', { created_at: '2025-12-29T05:59:59.999Z' }),
    row('monday', { created_at: '2025-12-29T06:00:00Z' }),
    row('new-year', { created_at: '2026-01-01T06:00:00Z' }),
  ]
  assert.deepEqual(
    ids(feed.filterThreadsByDate(rows, 'week', '2026-01-01T07:00:00Z')),
    ['monday', 'new-year']
  )
})
for (const range of ['today', 'week']) {
  for (const field of ['promised_date', 'follow_up_date']) {
    test(`${range} always retains ${field} today/overdue, even without activity or on closed rows`, () => {
      const rows = [
        row('today', { [field]: '2026-11-19' }),
        row('overdue', {
          [field]: '2025-01-01',
          created_at: '2025-01-01T12:00:00Z',
        }),
        row('closed', { status: 'done', [field]: '2026-11-18' }),
        row('future', { [field]: '2026-11-20' }),
        row('invalid', { [field]: '2026-02-30' }),
        row('garbage', { [field]: 'not-a-date' }),
      ]
      assert.deepEqual(ids(feed.filterThreadsByDate(rows, range, now)), [
        'today',
        'overdue',
        'closed',
      ])
    })
  }
}
test('either due field bypasses filtering; timestamp due dates use the Managua calendar', () => {
  const rows = [
    row('follow-up', {
      promised_date: '2027-01-01',
      follow_up_date: '2026-11-19',
    }),
    row('promise', {
      promised_date: '2026-11-19',
      follow_up_date: '2027-01-01',
    }),
    row('late-today', { promised_date: '2026-11-20T05:59:59Z' }),
    row('tomorrow', { follow_up_date: '2026-11-20T06:00:00Z' }),
  ]
  assert.deepEqual(ids(feed.filterThreadsByDate(rows, 'today', now)), [
    'follow-up',
    'promise',
    'late-today',
  ])
})
test('filtered groups drive counts and default tab instead of stale higher-priority activity', () => {
  const rows = [
    row('old-reply', {
      awaiting_reply: true,
      created_at: '2025-01-01T12:00:00Z',
    }),
    row('new-payment', {
      status: 'follow_up',
      kind: 'payment',
      updated_at: now,
    }),
  ]
  const groups = feed.groupThreads(
    feed.filterThreadsByDate(rows, 'today', now),
    now
  )
  assert.equal(
    groups.find((group) => group.key === 'unanswered').threads.length,
    0
  )
  assert.equal(
    groups.find((group) => group.key === 'payments').threads.length,
    1
  )
  assert.equal(feed.defaultFeedTab(groups), 'payments')
  assert.equal(
    feed.defaultFeedTab(
      feed.groupThreads(
        feed.filterThreadsByDate(rows, 'today', '2027-01-01T12:00:00Z'),
        now
      )
    ),
    'today'
  )
})
test('date range preferences default to all and remain isolated per business', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }
  assert.equal(feed.loadFeedDateRange('a', storage), 'all')
  feed.saveFeedDateRange('a', 'today', storage)
  feed.saveFeedDateRange('b', 'week', storage)
  assert.equal(feed.loadFeedDateRange('a', storage), 'today')
  assert.equal(feed.loadFeedDateRange('b', storage), 'week')
  assert.equal(feed.loadFeedDateRange('c', storage), 'all')
  assert.equal(values.get('whatsapp.feedDateRange.a'), 'today')
})
test('date storage tolerates denied reads/writes, invalid preferences, and missing business', () => {
  const denied = {
    getItem() {
      throw Error('denied')
    },
    setItem() {
      throw Error('denied')
    },
  }
  assert.equal(feed.loadFeedDateRange('a', denied), 'all')
  assert.doesNotThrow(() => feed.saveFeedDateRange('a', 'today', denied))
  assert.equal(feed.loadFeedDateRange('a', { getItem: () => 'invalid' }), 'all')
  assert.equal(
    feed.loadFeedDateRange(null, {
      getItem() {
        assert.fail('unexpected read')
      },
    }),
    'all'
  )
  feed.saveFeedDateRange(null, 'today', {
    setItem() {
      assert.fail('unexpected write')
    },
  })
})
