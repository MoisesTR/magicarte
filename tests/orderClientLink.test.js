import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveOrderClient, normalizeClientPhone } from '../src/utils/orderClientLink.js'

function setup(formData = {}, overrides = {}) {
  const calls = [], errors = []
  return {
    calls, errors,
    args: {
      formData: { customer_name: ' Ana ', customer_phone: '+505 8421 6792', customer_social_media: '@ana', delivery_address: 'Estelí', ...formData },
      businessId: 'business',
      findClientByPhone: async (...args) => { calls.push(['find', ...args]); return { data: null, error: null } },
      createClientReturning: async (...args) => { calls.push(['create', ...args]); return { data: { id: 'new' }, error: null } },
      onError: error => errors.push(error),
      ...overrides,
    },
  }
}

test('already linked client is returned unchanged without lookup or create', async () => {
  const h = setup({ client_id: 'existing', customer_name: '' })
  assert.equal(await resolveOrderClient(h.args), 'existing')
  assert.deepEqual(h.calls, [])
})

test('blank customer name does nothing', async () => {
  for (const customer_name of ['', '  ', null, undefined]) {
    const h = setup({ customer_name })
    assert.equal(await resolveOrderClient(h.args), null)
    assert.deepEqual(h.calls, [])
  }
})

test('Nicaragua normalization compares international formatted order and local stored phone', async () => {
  const existing = { id: 'existing', name: 'Original name', phone: '84216792' }
  const h = setup({}, { findClientByPhone: async (phone, business) => {
    assert.equal(phone, normalizeClientPhone(existing.phone))
    assert.equal(business, 'business')
    return { data: existing, error: null }
  } })
  assert.equal(await resolveOrderClient(h.args), 'existing')
  assert.deepEqual(existing, { id: 'existing', name: 'Original name', phone: '84216792' })
  assert.deepEqual(h.calls, [])
})

test('create uses normalized local phone and client fields when none found', async () => {
  const h = setup()
  assert.equal(await resolveOrderClient(h.args), 'new')
  assert.deepEqual(h.calls, [
    ['find', '84216792', 'business'],
    ['create', { name: 'Ana', phone: '84216792', social_media: '@ana', delivery_address: 'Estelí', notes: 'Creado desde un pedido' }, 'business'],
  ])
})

test('Costa Rica and other international phones retain full digits', async () => {
  for (const [input, expected] of [['+506 8421 6792', '50684216792'], ['+1 (505) 842-1679', '15058421679']]) {
    const h = setup({ customer_phone: input })
    assert.equal(await resolveOrderClient(h.args), 'new')
    assert.equal(h.calls[0][1], expected)
    assert.equal(h.calls[1][1].phone, expected)
  }
})

test('phone normalization removes only a leading 505 on exactly eleven digits', () => {
  for (const input of ['84216792', '+505 8421 6792', '505-8421-6792']) assert.equal(normalizeClientPhone(input), '84216792')
  assert.equal(normalizeClientPhone('505842167'), '505842167')
  assert.equal(normalizeClientPhone('505842167920'), '505842167920')
  assert.equal(normalizeClientPhone(null), '')
})

test('no phone skips lookup and creates a named client with nullable fields', async () => {
  const h = setup({ customer_phone: ' -- ', customer_social_media: '', delivery_address: '' })
  assert.equal(await resolveOrderClient(h.args), 'new')
  assert.deepEqual(h.calls, [['create', { name: 'Ana', phone: null, social_media: null, delivery_address: null, notes: 'Creado desde un pedido' }, 'business']])
})

for (const operation of ['findClientByPhone', 'createClientReturning']) {
  for (const rejects of [false, true]) test(`${operation} ${rejects ? 'rejection' : 'returned error'} returns null without throwing`, async () => {
    const failure = Error('denied')
    const h = setup({}, { [operation]: async () => { if (rejects) throw failure; return { data: null, error: failure } } })
    assert.equal(await resolveOrderClient(h.args), null)
    assert.deepEqual(h.errors, [failure])
    assert.equal(h.calls.some(([name]) => name === 'create'), false)
  })
}

test('error reporting cannot throw out of the resolver', async () => {
  const h = setup({}, { findClientByPhone: async () => { throw Error('offline') }, onError: () => { throw Error('logger failed') } })
  assert.equal(await resolveOrderClient(h.args), null)
})

test('missing created row is a non-blocking failure', async () => {
  const h = setup({}, { createClientReturning: async () => ({ data: null, error: null }) })
  assert.equal(await resolveOrderClient(h.args), null)
  assert.equal(h.errors.length, 1)
})

test('missing matched client id is reported as a non-blocking failure', async () => {
  const h = setup({}, { findClientByPhone: async () => ({ data: {}, error: null }) })
  assert.equal(await resolveOrderClient(h.args), null)
  assert.equal(h.errors.length, 1)
})

test('no phone links an existing client with the same name instead of creating a duplicate', async () => {
  const h = setup({ customer_phone: '' }, {
    findClientByName: async (...args) => { h.calls.push(['findName', ...args]); return { data: { id: 'ana-existing' }, error: null } },
  })
  assert.equal(await resolveOrderClient(h.args), 'ana-existing')
  assert.deepEqual(h.calls, [['findName', 'Ana', 'business']])
})

test('no phone and no same-name client still creates one', async () => {
  const h = setup({ customer_phone: '' }, {
    findClientByName: async (...args) => { h.calls.push(['findName', ...args]); return { data: null, error: null } },
  })
  assert.equal(await resolveOrderClient(h.args), 'new')
  assert.deepEqual(h.calls.map(([name]) => name), ['findName', 'create'])
})
