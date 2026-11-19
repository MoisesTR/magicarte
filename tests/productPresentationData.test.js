import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as helpers from '../src/utils/productPresentations.js'
async function dataWithClient(client) {
  const source = (
    await readFile(
      new URL('../src/data/productPresentations.js', import.meta.url),
      'utf8'
    )
  )
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*;?$/gm, '')
    .replaceAll('export ', '')
  const keys = Object.keys(helpers)
  return new Function(
    'supabase',
    ...keys,
    `${source}; return { fetchProductOptions, fetchPublicProductOptions, fetchPublicPresentations, saveProductOptions, fetchOrderItemDesigns, insertOrderItemsWithDesigns }`
  )(client, ...Object.values(helpers))
}
function mockClient(results) {
  const requests = []
  return {
    requests,
    from(table) {
      const request = { table, filters: [] }
      requests.push(request)
      return {
        select(value = '*') {
          request.select = value
          return this
        },
        order() {
          return this
        },
        eq(...a) {
          request.filters.push(a)
          return this
        },
        in(...a) {
          request.filters.push(a)
          return this
        },
        insert(value) {
          request.insert = value
          return this
        },
        upsert(value) {
          request.upsert = value
          return this
        },
        update(value) {
          request.update = value
          return this
        },
        delete() {
          request.delete = true
          return this
        },
        then(resolve, reject) {
          return Promise.resolve(
            results[requests.indexOf(request)] ?? { data: [], error: null }
          ).then(resolve, reject)
        },
      }
    },
  }
}
for (const code of ['42P01', 'PGRST205'])
  test(`missing new tables fail soft (${code})`, async () => {
    const client = mockClient([
      {
        error: {
          code,
          message: "table 'product_presentations' does not exist",
        },
      },
      { data: [] },
    ])
    const api = await dataWithClient(client)
    assert.deepEqual(await api.fetchProductOptions('p', 2), {
      presentations: [],
      designs: [],
      available: false,
      error: null,
    })
  })
test('permission/network/unrelated missing errors are not hidden', async () => {
  for (const error of [
    { code: '42501', message: 'denied' },
    { code: '42P01', message: 'table unrelated does not exist' },
    { code: '500', message: 'network' },
  ]) {
    const client = mockClient([{ error }, { data: [] }])
    const api = await dataWithClient(client)
    assert.equal((await api.fetchProductOptions('p', 2)).error, error)
  }
})
test('public reads filter active options and scope product', async () => {
  const client = mockClient([{ data: [] }, { data: [] }])
  const api = await dataWithClient(client)
  await api.fetchPublicProductOptions('p')
  for (const request of client.requests) {
    assert.ok(request.filters.some(([k, v]) => k === 'product_id' && v === 'p'))
    assert.ok(request.filters.some(([k, v]) => k === 'is_active' && v === true))
  }
})
test('catalog presentations are fetched in one shared batch', async () => {
  const client = mockClient([{ data: [] }])
  const api = await dataWithClient(client)
  await api.fetchPublicPresentations(2)
  assert.equal(client.requests.length, 1)
  assert.deepEqual(client.requests[0].filters, [
    ['is_active', true],
    ['business_id', 2],
  ])
})
test('diff save upserts current rows, deletes removed IDs and stamps scope', async () => {
  const client = mockClient([])
  const api = await dataWithClient(client)
  const result = await api.saveProductOptions(
    'p',
    2,
    {
      presentations: [
        { id: 'one', label: 'Unidad', units: 1, price: 135, is_active: true },
      ],
      designs: [],
    },
    { presentations: [{ id: 'gone' }, { id: 'one' }], designs: [] }
  )
  assert.equal(result.error, null)
  assert.equal(client.requests.find((r) => r.upsert)?.upsert[0].business_id, 2)
  assert.ok(
    client.requests.some(
      (r) =>
        r.delete && r.filters.some(([k, v]) => k === 'id' && v.includes('gone'))
    )
  )
})
test('legacy order insert payload remains unchanged and does not query optional tables', async () => {
  const client = mockClient([{ data: null, error: null }])
  const api = await dataWithClient(client)
  const rows = [
    { order_id: 'o', product_name: 'Legacy', quantity: 1, unit_price: 99 },
  ]
  await api.insertOrderItemsWithDesigns(rows, 2)
  assert.deepEqual(client.requests[0].insert, rows)
  assert.equal(client.requests[0].select, undefined)
  assert.equal(client.requests.length, 1)
})
test('order design writes use returned IDs, preserve snapshots and business scope', async () => {
  const client = mockClient([{ data: [{ id: 'i' }] }, { data: [] }])
  const api = await dataWithClient(client)
  await api.insertOrderItemsWithDesigns(
    [
      {
        order_id: 'o',
        presentation_label: 'Old',
        units_per_presentation: 6,
        designs: [
          { design_id: null, design_name: 'Otro', quantity: 2, note: 'Ana' },
        ],
      },
    ],
    2
  )
  assert.equal(client.requests[0].insert[0].presentation_label, 'Old')
  assert.equal(client.requests[0].insert[0].designs, undefined)
  assert.deepEqual(client.requests[1].insert, [
    {
      business_id: 2,
      order_item_id: 'i',
      design_id: null,
      design_name: 'Otro',
      quantity: 2,
      note: 'Ana',
    },
  ])
})
for (const code of ['42703', 'PGRST204'])
  test(`unapplied order columns retry legacy payload once (${code})`, async () => {
    const client = mockClient([
      { error: { code, message: 'column presentation_id does not exist' } },
      { data: null, error: null },
    ])
    const api = await dataWithClient(client)
    const result = await api.insertOrderItemsWithDesigns(
      [
        {
          order_id: 'o',
          presentation_id: 'p',
          presentation_label: 'Pack',
          units_per_presentation: 3,
          designs: [],
        },
      ],
      2
    )
    assert.equal(result.error, null)
    assert.equal(client.requests.length, 2)
    assert.deepEqual(client.requests[1].insert, [{ order_id: 'o' }])
  })
test('missing order designs read hides feature but unrelated failures surface', async () => {
  const error = {
    code: 'PGRST205',
    message: "table 'order_item_designs' missing",
  }
  const client = mockClient([{ error }])
  const api = await dataWithClient(client)
  assert.deepEqual(await api.fetchOrderItemDesigns(['i'], 2), {
    data: [],
    error: null,
    available: false,
  })
})
test('bulk upserts retain generated defaults for mixed new and existing rows', async () => {
  const client = mockClient([])
  const api = await dataWithClient(client)
  await api.saveProductOptions('p', 2, {
    presentations: [
      { label: 'Unidad', units: 1, price: 135 },
      { id: 'old', label: 'Pack', units: 6, price: 690 },
    ],
    designs: [],
  })
  assert.ok(client.requests[0].upsert.every((row) => row.id))
})
test('normal order item insert errors are returned without retry or design writes', async () => {
  const error = { code: '42501', message: 'denied' }
  const client = mockClient([{ error }])
  const api = await dataWithClient(client)
  assert.equal(
    (await api.insertOrderItemsWithDesigns([{ presentation_id: 'p' }], 2))
      .error,
    error
  )
  assert.equal(client.requests.length, 1)
})
test('new option writes cannot swallow validation or database errors', async () => {
  const client = mockClient([])
  const api = await dataWithClient(client)
  assert.ok(
    (
      await api.saveProductOptions('p', 2, {
        presentations: [{ label: '', units: 0, price: -1 }],
        designs: [],
      })
    ).error
  )
  assert.equal(client.requests.length, 0)
  const error = { code: '42501', message: 'denied' }
  const failed = mockClient([{ error }])
  const failedApi = await dataWithClient(failed)
  assert.equal(
    (
      await failedApi.saveProductOptions('p', 2, {
        presentations: [{ label: 'One', units: 1, price: 1 }],
        designs: [],
      })
    ).error,
    error
  )
})
