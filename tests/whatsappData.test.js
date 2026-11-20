import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { addThreadPayment } from '../src/utils/whatsappFeed.js'
import { validateClassification } from '../api/_lib/whatsappClassification.js'
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
    'validateClassification',
    `${source};return {classifyWhatsAppThread,fetchWhatsAppFeed,fetchWhatsAppThread,createWhatsAppThread,updateWhatsAppThread,deleteWhatsAppThread,markWhatsAppThread,markNotCustomer,completeThreadConversion,registerWhatsAppPayment}`
  )(client, addThreadPayment, validateClassification)
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

test('markNotCustomer writes only its classification payload and scopes the existing update path', async () => {
  const thread = Object.freeze({
    id: 'unrelated',
    business_id: 2,
    status: 'sent',
    kind: 'quote',
    notes: 'Keep this note',
    quoted_amount: 450,
    paid_amount: 100,
    order_id: 'existing-order',
    reference_images: ['https://example.invalid/photo.jpg'],
  })
  const c = mock([{ data: { ...thread, status: 'done' }, error: null }])
  const api = await dataWith(c)
  const result = await api.markNotCustomer(thread, '  proveedor  ', 2)
  assert.equal(result.data.status, 'done')
  assert.equal(c.requests.length, 1)
  assert.equal(c.requests[0].table, 'whatsapp_threads')
  assert.deepEqual(c.requests[0].update, {
    status: 'done',
    kind: 'other',
    lost_reason: 'No es cliente: proveedor',
  })
  assert.deepEqual(c.requests[0].filters, [
    ['id', 'unrelated'],
    ['business_id', 2],
  ])
  assert.equal(thread.status, 'sent')
  assert.equal(thread.notes, 'Keep this note')
  assert.equal(thread.quoted_amount, 450)
})

test('markNotCustomer trims optional reasons and caps them at 80 characters', async () => {
  const c = mock()
  const api = await dataWith(c)
  for (const reason of [undefined, null, '', '   ']) {
    await api.markNotCustomer({ id: 't' }, reason, 2)
    assert.deepEqual(c.requests.at(-1).update, {
      status: 'done',
      kind: 'other',
      lost_reason: 'No es cliente',
    })
  }
  await api.markNotCustomer({ id: 't' }, `  ${'x'.repeat(90)}  `, 2)
  assert.equal(
    c.requests.at(-1).update.lost_reason,
    `No es cliente: ${'x'.repeat(80)}`
  )
  await api.markNotCustomer({ id: 't' }, `${'x'.repeat(79)} trailing`, 2)
  assert.equal(
    c.requests.at(-1).update.lost_reason,
    `No es cliente: ${'x'.repeat(79)}`
  )
})

test('markNotCustomer rejects missing scope and preserves update failures', async () => {
  const error = { code: '42501', message: 'denied' }
  const c = mock([{ data: null, error }])
  const api = await dataWith(c)
  assert.ok((await api.markNotCustomer({ id: 't' }, '', null)).error)
  assert.ok((await api.markNotCustomer({}, '', 2)).error)
  assert.ok((await api.markNotCustomer(null, '', 2)).error)
  assert.ok((await api.markNotCustomer(undefined, '', 2)).error)
  assert.equal(c.requests.length, 0)
  assert.equal((await api.markNotCustomer({ id: 't' }, '', 2)).error, error)
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

test('AI fields survive scoped creates and updates; reads normalize absent columns to null', async () => {
  const fields = {
    ai_tag: 'follow_up',
    ai_tag_reason: 'Solo se planea volver a escribir.',
    ai_tagged_at: '2026-11-19T20:00:00.000Z',
  }
  const c = mock([
    { data: { id: 't', ...fields } },
    { data: { id: 't', ...fields } },
    { data: [{ id: 'legacy' }] },
    { data: [] },
    { data: { id: 'legacy' } },
  ])
  const api = await dataWith(c)
  assert.equal(
    (await api.createWhatsAppThread(fields, 2)).data.ai_tag,
    fields.ai_tag
  )
  assert.deepEqual(c.requests[0].insert[0], { ...fields, business_id: 2 })
  await api.updateWhatsAppThread('t', fields, 2)
  assert.deepEqual(c.requests[1].update, fields)
  const feed = await api.fetchWhatsAppFeed(2)
  assert.equal(feed.available, true)
  assert.equal(feed.threads[0].ai_tag, null)
  assert.equal(feed.threads[0].ai_tag_reason, null)
  assert.equal(feed.threads[0].ai_tagged_at, null)
  assert.equal((await api.fetchWhatsAppThread('legacy', 2)).data.ai_tag, null)
})
for (const error of [
  {
    code: '42703',
    message: 'column "ai_tag" of relation "whatsapp_threads" does not exist',
  },
  {
    code: 'PGRST204',
    message:
      "Could not find the 'ai_tag_reason' column of 'whatsapp_threads' in the schema cache",
  },
])
  test(`missing AI column ${error.code} retries mixed writes once without tag fields, maintaining tenant scope`, async () => {
    const fields = {
      summary: 'Keep me',
      ai_tag: 'follow_up',
      ai_tag_reason: 'Razón.',
      ai_tagged_at: '2026-11-19T20:00:00Z',
    }
    const c = mock([
      { error },
      { data: { id: 't', summary: 'Keep me' } },
      { error },
      { data: { id: 't', summary: 'Keep me' } },
    ])
    const api = await dataWith(c)
    const created = await api.createWhatsAppThread(fields, 2)
    assert.equal(created.error, undefined)
    assert.equal(created.aiTagsAvailable, false)
    assert.deepEqual(c.requests[1].insert[0], {
      summary: 'Keep me',
      business_id: 2,
    })
    const updated = await api.updateWhatsAppThread('t', fields, 2)
    assert.equal(updated.aiTagsAvailable, false)
    assert.deepEqual(c.requests[3].update, { summary: 'Keep me' })
    assert.deepEqual(c.requests[3].filters, [
      ['id', 't'],
      ['business_id', 2],
    ])
  })
test('tag-only writes fail softly before migration without blank updates; unrelated errors are never masked', async () => {
  const missing = {
    code: 'PGRST204',
    message: "Could not find 'ai_tag' column of 'whatsapp_threads'",
  }
  const c = mock([{ error: missing }]),
    api = await dataWith(c)
  const result = await api.updateWhatsAppThread('t', { ai_tag: 'follow_up' }, 2)
  assert.equal(result.aiTagsAvailable, false)
  assert.match(result.error.message, /migración/i)
  assert.equal(c.requests.length, 1)
  for (const error of [
    { code: '42501', message: 'ai_tag denied' },
    { code: '42703', message: 'column summary missing' },
    { code: 'PGRST204', message: 'ai_tag column in other_table missing' },
  ]) {
    const c = mock([{ error }]),
      api = await dataWith(c)
    assert.equal(
      (
        await api.updateWhatsAppThread(
          't',
          { summary: 'a', ai_tag: 'follow_up' },
          2
        )
      ).error,
      error
    )
    assert.equal(c.requests.length, 1)
  }
})

test('classifier uses session auth, saves only three AI fields with tenant scope and supplied timestamp', async () => {
  const thread = {
    id: 't',
    summary: 'Follow up',
    status: 'sent',
    kind: 'quote',
  }
  const fields = {
    ai_tag: 'follow_up',
    ai_tag_reason: 'Dar seguimiento al cliente.',
    ai_tagged_at: '2026-11-20T12:00:00.000Z',
  }
  const c = mock([{ data: { ...thread, ...fields } }])
  c.auth = {
    getSession: async () => ({ data: { session: { access_token: 'token' } } }),
  }
  const api = await dataWith(c)
  const result = await api.classifyWhatsAppThread(thread, 2, {
    now: () => new Date('2026-11-20T12:00:00Z'),
    requestClassification: async (value, { getSession }) => {
      assert.equal(value, thread)
      assert.equal((await getSession()).data.session.access_token, 'token')
      return { tag: 'follow_up', reason: ' Dar seguimiento al cliente. ' }
    },
  })
  assert.equal(result.data.ai_tag, fields.ai_tag)
  assert.deepEqual(c.requests[0].update, fields)
  assert.deepEqual(c.requests[0].filters, [
    ['id', 't'],
    ['business_id', 2],
  ])
  assert.equal(thread.ai_tag, undefined)
})
test('classifier skips already tagged rows, rejects missing scope and invalid AI, and preserves failed saves', async () => {
  const c = mock(),
    api = await dataWith(c)
  const requestClassification = () => assert.fail('AI must not run')
  assert.ok(
    (
      await api.classifyWhatsAppThread({ id: 't' }, null, {
        requestClassification,
      })
    ).error
  )
  assert.ok(
    (await api.classifyWhatsAppThread({}, 2, { requestClassification })).error
  )
  assert.equal(
    (
      await api.classifyWhatsAppThread({ id: 't', ai_tag: 'paid' }, 2, {
        requestClassification,
      })
    ).data.ai_tag,
    'paid'
  )
  for (const result of [
    { tag: 'toString', reason: 'bad' },
    { tag: 'paid', reason: '' },
  ])
    assert.ok(
      (
        await api.classifyWhatsAppThread({ id: 't' }, 2, {
          requestClassification: async () => result,
        })
      ).error
    )
  assert.equal(c.requests.length, 0)
  const missing = mock([
    {
      error: {
        code: '42703',
        message: 'column ai_tag of whatsapp_threads does not exist',
      },
    },
  ])
  const failed = await (
    await dataWith(missing)
  ).classifyWhatsAppThread({ id: 't' }, 2, {
    requestClassification: async () => ({
      tag: 'follow_up',
      reason: 'Volver a escribir.',
    }),
  })
  assert.equal(failed.aiTagsAvailable, false)
  assert.match(failed.error.message, /migración/)
  assert.equal(missing.requests.length, 1)
})

test('structured fields roundtrip and absent columns normalize to null without changing feed availability', async () => {
  const fields = { order_lines: [{ name: 'Vitral', quantity: 18, unit_price: 300, detail: 'Navidad' }], delivery_address: 'Estelí', recipient_name: 'Ana', recipient_phone: '88887777' }
  const c = mock([{ data: { id: 't', ...fields } }, { data: { id: 't', ...fields } }, { data: [{ id: 'legacy' }] }, { data: [] }])
  const api = await dataWith(c)
  await api.createWhatsAppThread(fields, 2)
  assert.deepEqual(c.requests[0].insert[0], { ...fields, business_id: 2 })
  assert.deepEqual((await api.updateWhatsAppThread('t', fields, 2)).data.order_lines, fields.order_lines)
  const feed = await api.fetchWhatsAppFeed(2)
  for (const field of Object.keys(fields)) assert.equal(feed.threads[0][field], null)
  assert.equal(feed.available, true)
})

for (const code of ['42703', 'PGRST204']) test(`structured optional columns ${code} retry mixed writes without erasing unrelated AI fields`, async () => {
  const error = { code, message: "column 'order_lines' of 'whatsapp_threads' does not exist" }
  const fields = { summary: 'Keep', ai_tag: 'paid', order_lines: [], delivery_address: 'Estelí', recipient_name: 'Ana', recipient_phone: '88887777' }
  const c = mock([{ error }, { data: { id: 't', summary: 'Keep' } }, { error }, { data: { id: 't', summary: 'Keep' } }])
  const api = await dataWith(c)
  assert.equal((await api.createWhatsAppThread(fields, 2)).orderDetailsAvailable, false)
  assert.deepEqual(c.requests[1].insert[0], { summary: 'Keep', ai_tag: 'paid', business_id: 2 })
  assert.equal((await api.updateWhatsAppThread('t', fields, 2)).orderDetailsAvailable, false)
  assert.deepEqual(c.requests[3].update, { summary: 'Keep', ai_tag: 'paid' })
  assert.deepEqual(c.requests[3].filters, [['id', 't'], ['business_id', 2]])
})

test('optional-only details never retry empty updates; unrelated column errors remain visible', async () => {
  const error = { code: 'PGRST204', message: "column 'recipient_name' of 'whatsapp_threads' does not exist" }
  const c = mock([{ error }])
  const result = await (await dataWith(c)).updateWhatsAppThread('t', { recipient_name: 'Ana' }, 2)
  assert.match(result.error.message, /migración/i)
  assert.equal(result.orderDetailsAvailable, false)
  assert.equal(c.requests.length, 1)
  const denied = { code: '42501', message: 'order_lines denied' }
  const d = mock([{ error: denied }])
  assert.equal((await (await dataWith(d)).updateWhatsAppThread('t', { summary: 'Keep', order_lines: [] }, 2)).error, denied)
  assert.equal(d.requests.length, 1)
})

test('independently unapplied optional migrations each fall back once in either order', async () => {
  const ai = { code: '42703', message: 'column ai_tag of whatsapp_threads does not exist' }
  const details = { code: 'PGRST204', message: "column 'delivery_address' of 'whatsapp_threads' does not exist" }
  for (const errors of [[ai, details], [details, ai]]) {
    const c = mock([...errors.map(error => ({ error })), { data: { id: 't', summary: 'Keep' } }])
    const result = await (await dataWith(c)).updateWhatsAppThread('t', { summary: 'Keep', ai_tag: 'paid', delivery_address: 'Estelí' }, 2)
    assert.equal(result.aiTagsAvailable, false)
    assert.equal(result.orderDetailsAvailable, false)
    assert.equal(c.requests.length, 3)
    assert.deepEqual(c.requests[2].update, { summary: 'Keep' })
    assert.deepEqual(c.requests[2].filters, [['id', 't'], ['business_id', 2]])
  }
})
