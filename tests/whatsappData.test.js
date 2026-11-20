import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { addThreadPayment } from '../src/utils/whatsappFeed.js'
async function dataWith(client) {
  const source = (
    await readFile(
      new URL('../src/data/whatsappThreads.js', import.meta.url),
      'utf8'
    )
  )
    .replace(/^import .*$/gm, '')
    .replaceAll('export ', '')
  return new Function(
    'supabase',
    'addThreadPayment',
    `${source};return {fetchWhatsAppFeed,fetchWhatsAppThread,createWhatsAppThread,updateWhatsAppThread,deleteWhatsAppThread,markWhatsAppThread,completeThreadConversion,registerWhatsAppPayment}`
  )(client, addThreadPayment)
}
function mock(results = []) {
  const requests = []
  return {
    requests,
    from(table) {
      const request = { table, filters: [] }
      requests.push(request)
      const q = {
        select(value) {
          request.select = value
          return q
        },
        eq(k, v) {
          request.filters.push([k, v])
          return q
        },
        gte(k, v) {
          request.gte = [k, v]
          return q
        },
        order() {
          return q
        },
        limit() {
          return q
        },
        range(a, b) {
          request.range = [a, b]
          return q
        },
        single() {
          return q
        },
        maybeSingle() {
          return q
        },
        insert(v) {
          request.insert = v
          return q
        },
        update(v) {
          request.update = v
          return q
        },
        delete() {
          request.delete = true
          return q
        },
        then(resolve, reject) {
          return Promise.resolve(
            results[requests.indexOf(request)] || { data: [], error: null }
          ).then(resolve, reject)
        },
      }
      return q
    },
  }
}
test('feed requires business; paginates scoped threads and reads only latest scoped review', async () => {
  const c = mock([
      { data: [{ id: 't' }], error: null },
      { data: [{ chats_seen: 42 }], error: null },
    ]),
    api = await dataWith(c)
  const result = await api.fetchWhatsAppFeed(2)
  assert.equal(result.threads[0].id, 't')
  assert.equal(result.lastReview.chats_seen, 42)
  assert.equal(result.available, true)
  assert.deepEqual(
    c.requests.map((r) => r.filters),
    [[['business_id', 2]], [['business_id', 2]]]
  )
  await assert.rejects(() => api.fetchWhatsAppFeed(null), /business/i)
})
for (const code of ['42P01', 'PGRST205'])
  test(`missing table ${code} soft-fails feed and writes`, async () => {
    const c = mock([
        { data: null, error: { code, message: 'whatsapp_threads missing' } },
        { data: null, error: { code, message: 'whatsapp_reviews missing' } },
        { data: null, error: { code, message: 'whatsapp_threads missing' } },
      ]),
      api = await dataWith(c)
    const result = await api.fetchWhatsAppFeed(2)
    assert.equal(result.available, false)
    assert.match(result.notice, /Falta activar la sección WhatsApp/)
    assert.deepEqual(result.threads, [])
    const write = await api.createWhatsAppThread({ summary: 'a' }, 2)
    assert.equal(write.available, false)
    assert.match(write.error.message, /Falta activar/)
  })
test('missing reviews preserves actionable threads but permission errors are not masked', async () => {
  const c = mock([
      { data: [{ id: 't' }] },
      { error: { code: 'PGRST205', message: 'whatsapp_reviews' } },
    ]),
    api = await dataWith(c)
  const result = await api.fetchWhatsAppFeed(2)
  assert.equal(result.threads.length, 1)
  assert.equal(result.available, true)
  assert.match(result.notice, /Falta activar/)
  await assert.rejects(
    () =>
      dataWith(
        mock([{ error: { code: '42501', message: 'denied' } }, { data: [] }])
      ).then((api) => api.fetchWhatsAppFeed(2)),
    /denied/
  )
})
test('create stamps tenant; update allowlists editable fields and every mutation scopes business', async () => {
  const c = mock(
      Array.from({ length: 6 }, () => ({ data: { id: 't' }, error: null }))
    ),
    api = await dataWith(c)
  await api.createWhatsAppThread(
    { summary: 'a', business_id: 99, id: 'injected' },
    2
  )
  assert.equal(c.requests[0].insert[0].business_id, 2)
  assert.equal(c.requests[0].insert[0].id, undefined)
  await api.updateWhatsAppThread(
    't',
    { summary: 'b', business_id: 99, created_by: 'injected' },
    2
  )
  assert.deepEqual(c.requests[1].update, { summary: 'b' })
  await api.deleteWhatsAppThread('t', 2)
  await api.markWhatsAppThread('t', 'lost', 2, 'No aceptó')
  assert.equal(c.requests[3].update.lost_reason, 'No aceptó')
  await api.completeThreadConversion('t', 'order', 2)
  assert.deepEqual(c.requests[4].update, { status: 'won', order_id: 'order' })
  for (const r of c.requests.slice(1))
    assert.deepEqual(r.filters, [
      ['id', 't'],
      ['business_id', 2],
    ])
  assert.ok((await api.markWhatsAppThread('t', 'invalid', 2)).error)
  assert.ok((await api.completeThreadConversion('t', null, 2)).error)
})
test('detail read is scoped and missing conversion target never writes', async () => {
  const c = mock([{ data: { id: 't', business_id: 2 } }]),
    api = await dataWith(c)
  assert.equal((await api.fetchWhatsAppThread('t', 2)).data.id, 't')
  assert.deepEqual(c.requests[0].filters, [
    ['id', 't'],
    ['business_id', 2],
  ])
  assert.ok((await api.updateWhatsAppThread('t', {}, null)).error)
  assert.equal(c.requests.length, 1)
})

test('delivery fields survive scoped create/update and readback', async () => {
  const fields = {
    delivery_date: '2026-11-22',
    delivery_method: 'Retiro El Edén',
    paid_amount: 700,
  }
  const c = mock([
    { data: { id: 't', ...fields } },
    { data: { id: 't', ...fields } },
  ])
  const api = await dataWith(c)
  await api.createWhatsAppThread(fields, 2)
  assert.deepEqual(c.requests[0].insert[0], { ...fields, business_id: 2 })
  assert.equal(
    (await api.updateWhatsAppThread('t', fields, 2)).data.paid_amount,
    700
  )
  assert.deepEqual(c.requests[1].update, fields)
})

test('quick payment reads fresh amount and uses tenant-scoped compare-and-swap to avoid lost additions', async () => {
  const c = mock([
    { data: { id: 't', status: 'sent', paid_amount: '700.10' } },
    { data: { id: 't', paid_amount: 700.3 } },
  ])
  const api = await dataWith(c)
  const result = await api.registerWhatsAppPayment('t', '0.20', 2)
  assert.equal(result.data.paid_amount, 700.3)
  assert.deepEqual(c.requests[1].update, { paid_amount: 700.3 })
  assert.deepEqual(c.requests[1].filters, [
    ['id', 't'],
    ['business_id', 2],
    ['paid_amount', '700.10'],
    ['status', 'sent'],
  ])
  const denied = mock([{ error: { message: 'denied' } }])
  assert.ok(
    (await (await dataWith(denied)).registerWhatsAppPayment('t', 10, 2)).error
  )
  assert.equal(denied.requests.length, 1)
  const closed = mock([{ data: { status: 'won', paid_amount: 20 } }])
  assert.ok(
    (await (await dataWith(closed)).registerWhatsAppPayment('t', 10, 2)).error
  )
  assert.equal(closed.requests.length, 1)
  const invalid = mock()
  assert.ok(
    (await (await dataWith(invalid)).registerWhatsAppPayment('t', -1, 2)).error
  )
  assert.equal(invalid.requests.length, 0)
  const conflict = mock([
    { data: { status: 'sent', paid_amount: 20 } },
    { error: { code: 'PGRST116', message: 'No rows' } },
  ])
  assert.ok(
    (await (await dataWith(conflict)).registerWhatsAppPayment('t', 10, 2)).error
  )
  assert.equal(conflict.requests.length, 2)
})

async function matchingDataWith(client) {
  const source = (await readFile('src/data/whatsappThreads.js', 'utf8'))
    .replace(/^import .*$/gm, '')
    .replaceAll('export ', '')
  return new Function(
    'supabase',
    'addThreadPayment',
    `${source};return {fetchWhatsAppOrders}`
  )(client, addThreadPayment)
}
test('matching orders are business-scoped, projected, limited to 90 days, and paginated beyond API cap', async () => {
  const first = Array.from({ length: 500 }, (_, id) => ({ id }))
  const c = mock([{ data: first }, { data: [{ id: 500 }] }]),
    api = await matchingDataWith(c)
  const rows = await api.fetchWhatsAppOrders(
    2,
    new Date('2026-11-20T12:00:00Z')
  )
  assert.equal(rows.length, 501)
  assert.equal(c.requests[0].table, 'orders')
  for (const r of c.requests) {
    assert.deepEqual(r.filters, [['business_id', 2]])
    assert.deepEqual(r.gte, ['created_at', '2026-08-22T12:00:00.000Z'])
    for (const field of [
      'id',
      'business_id',
      'order_number',
      'customer_name',
      'customer_phone',
      'status',
      'created_at',
      'estimated_delivery_date',
    ])
      assert.ok(r.select.split(/,\s*/).includes(field), field)
  }
  assert.deepEqual(
    c.requests.map((r) => r.range),
    [
      [0, 499],
      [500, 999],
    ]
  )
  await assert.rejects(() => api.fetchWhatsAppOrders(null), /business/i)
})
test('matching orders soft-fail returned and thrown query errors without partial matches', async () => {
  const c = mock([{ data: null, error: { message: 'denied' } }]),
    api = await matchingDataWith(c)
  assert.deepEqual(await api.fetchWhatsAppOrders(2), [])
  const thrown = await matchingDataWith({
    from() {
      throw new Error('offline')
    },
  })
  assert.deepEqual(await thrown.fetchWhatsAppOrders(2), [])
  const partial = await matchingDataWith(
    mock([
      { data: Array.from({ length: 500 }, (_, id) => ({ id })) },
      { error: { message: 'page failed' } },
    ])
  )
  assert.deepEqual(await partial.fetchWhatsAppOrders(2), [])
})
