import test from 'node:test'
import assert from 'node:assert/strict'
import { groupThreads } from '../src/utils/whatsappFeed.js'
const load = async (...args) =>
  (
    await import('../src/utils/whatsappOrderLinking.js')
  ).loadWhatsAppFeedWithOrders(...args)
const thread = (id, fields = {}) => ({
  id,
  business_id: 2,
  chat_key: '50588841808',
  status: 'sent',
  created_at: '2026-11-20T12:00:00Z',
  ...fields,
})
const order = {
  id: 'order',
  business_id: 2,
  customer_phone: '88841808',
  status: 'confirmed',
  created_at: '2026-11-20T12:00:00Z',
  order_number: 42,
}
function layer(threads) {
  const state = {
    threads: structuredClone(threads),
    calls: [],
    reads: 0,
    warnings: [],
  }
  return Object.assign(state, {
    async fetchFeed(businessId) {
      assert.equal(businessId, 2)
      state.reads++
      return { threads: structuredClone(state.threads), available: true }
    },
    async fetchOrders(businessId) {
      assert.equal(businessId, 2)
      return [order]
    },
    async completeConversion(id, orderId, businessId) {
      state.calls.push([id, orderId, businessId])
      state.threads = state.threads.map((t) =>
        t.id === id
          ? {
              ...t,
              order_id: orderId,
              status: 'won',
              status_changed_at: '2026-11-20T12:01:00Z',
            }
          : t
      )
      return { data: state.threads.find((t) => t.id === id), error: null }
    },
    logger: {
      warn(...args) {
        state.warnings.push(args)
      },
    },
  })
}
test('only open unlinked matching threads are linked, once each, using existing conversion completion and one refresh', async () => {
  const api = layer([
    ...['to_quote', 'sent', 'follow_up', 'won', 'lost', 'done'].map((status) =>
      thread(status, { status })
    ),
    thread('linked', { order_id: 'order' }),
    thread('no-match', { chat_key: '50577777777' }),
    thread('wrong-business', { business_id: 3 }),
    thread('sent'),
  ])
  const before = structuredClone(api.threads)
  const result = await load(2, api)
  assert.deepEqual(api.calls, [
    ['to_quote', 'order', 2],
    ['sent', 'order', 2],
    ['follow_up', 'order', 2],
  ])
  assert.equal(api.reads, 2)
  assert.deepEqual(result.autoLinkedThreadIds, [
    'to_quote',
    'sent',
    'follow_up',
  ])
  assert.equal(result.orderMatches.get('sent').id, 'order')
  const groups = groupThreads(result.threads, '2026-11-20T18:00:00Z')
  assert.ok(
    groups.find((g) => g.key === 'closed').threads.some((t) => t.id === 'sent')
  )
  assert.ok(
    groups
      .filter((g) => g.key !== 'closed')
      .every((g) => !g.threads.some((t) => t.id === 'sent'))
  )
  assert.equal(before.find((t) => t.id === 'sent').order_id, undefined)
})
test('updates run sequentially; returned and thrown failures do not prevent later links or retry within load', async () => {
  const api = layer([
    thread('failed'),
    thread('thrown'),
    thread('success'),
    thread('failed'),
  ])
  const complete = api.completeConversion
  let active = 0,
    maxActive = 0
  api.completeConversion = async (id, ...args) => {
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setImmediate(resolve))
    active--
    if (id === 'failed') {
      api.calls.push([id, ...args])
      return { error: new Error('denied') }
    }
    if (id === 'thrown') {
      api.calls.push([id, ...args])
      throw new Error('offline')
    }
    return complete(id, ...args)
  }
  const result = await load(2, api)
  assert.equal(maxActive, 1)
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['failed', 'thrown', 'success']
  )
  assert.equal(api.warnings.length, 2)
  assert.deepEqual(result.autoLinkedThreadIds, ['success'])
  assert.equal(api.reads, 2)
})
test('orders query failure soft-fails and no match means no writes or refresh', async () => {
  const api = layer([thread('open')])
  api.fetchOrders = async () => {
    throw new Error('denied')
  }
  const result = await load(2, api)
  assert.equal(result.threads[0].id, 'open')
  assert.deepEqual(result.orders, [])
  assert.equal(api.calls.length, 0)
  assert.equal(api.reads, 1)
  assert.equal(api.warnings.length, 1)
})
test('session note survives later refreshes but existing links are never labeled as auto-linked', async () => {
  const api = layer([
    thread('new'),
    thread('existing', { order_id: 'order', status: 'won' }),
  ])
  const session = new Set()
  const initial = await load(2, api, session)
  const later = await load(2, api, session)
  assert.deepEqual(initial.autoLinkedThreadIds, ['new'])
  assert.deepEqual(later.autoLinkedThreadIds, ['new'])
  assert.equal(api.calls.length, 1)
})
test('refresh failures preserve successful links without re-running linking', async () => {
  const api = layer([thread('new')]),
    fetch = api.fetchFeed
  api.fetchFeed = async (...args) => {
    if (api.reads) {
      api.reads++
      throw new Error('refresh failed')
    }
    return fetch(...args)
  }
  const result = await load(2, api)
  assert.equal(result.threads[0].status, 'won')
  assert.equal(result.threads[0].order_id, 'order')
  assert.deepEqual(result.autoLinkedThreadIds, ['new'])
  assert.equal(api.calls.length, 1)
  assert.equal(api.reads, 2)
})
