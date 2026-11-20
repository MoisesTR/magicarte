import test from 'node:test'
import assert from 'node:assert/strict'
import * as feed from '../src/utils/whatsappFeed.js'

const line = (overrides = {}) => ({ name: 'Decoración estilo vitral', quantity: 18, unit_price: 300, detail: 'Feliz Navidad', ...overrides })

test('buildOrderLines coerces editor numerics, trims text and returns null for no lines without mutation', () => {
  const form = { order_lines: [line({ name: ' Vitral ', quantity: '18', unit_price: '0', detail: '  ' })] }
  const before = structuredClone(form)
  assert.deepEqual(feed.buildOrderLines(form), [{ name: 'Vitral', quantity: 18, unit_price: 0, detail: null }])
  assert.deepEqual(form, before)
  for (const order_lines of [undefined, null, []]) assert.equal(feed.buildOrderLines({ order_lines }), null)
})

test('buildOrderLines reports indexed inline field errors and never drops incomplete lines', () => {
  for (const [field, values] of Object.entries({ name: ['', ' ', null, 12], quantity: ['', ' ', 0, -1, 1.2, Infinity, true, null], unit_price: ['', ' ', -1, Infinity, NaN, true, null], detail: [1, {}] })) {
    for (const value of values) assert.throws(() => feed.buildOrderLines({ order_lines: [line({ [field]: value })] }), error => Boolean(error.errors?.[0]?.[field]), `${field}: ${value}`)
  }
  for (const order_lines of [{}, [null], ['invalid']]) assert.throws(() => feed.buildOrderLines({ order_lines }))
})

test('persisted order lines require the complete typed shape and a non-empty valid array', () => {
  assert.equal(feed.hasOrderLines({ order_lines: [line(), line({ detail: null, unit_price: 0 })] }), true)
  for (const order_lines of [undefined, null, [], {}, [null], [line({ name: ' ' })], [line({ quantity: '18' })], [line({ quantity: 0 })], [line({ quantity: 1.5 })], [line({ unit_price: '300' })], [line({ unit_price: Infinity })], [line({ detail: 4 })], [{ name: 'Incomplete', quantity: 1, unit_price: 2 }]]) assert.equal(feed.hasOrderLines({ order_lines }), false)
})

test('structured prefill preserves every line and explicit delivery facts, matching only exact catalog names', () => {
  const thread = { summary: 'Wrong inferred free text a C$999 c/u', quoted_amount: 999, delivery_method: 'delivery', delivery_address: '  Casa azul, Estelí  ', recipient_name: '  Alma Medina ', recipient_phone: '+505 8326-1278', order_lines: [line(), line({ name: 'Otro', quantity: 2, unit_price: 0, detail: null })] }
  const before = structuredClone(thread)
  const products = [{ id: 'p', name: 'DECORACIÓN ESTILO VITRAL', price: 999 }, { id: 'other', name: 'Otro parecido' }]
  const form = feed.threadOrderPrefill(thread, '2026-11-20', products)
  assert.equal(form.items.length, 2)
  assert.deepEqual(form.items.map(({ product_id, product_name, quantity, unit_price, product_description, is_custom }) => ({ product_id, product_name, quantity, unit_price, product_description, is_custom })), [
    { product_id: 'p', product_name: 'Decoración estilo vitral', quantity: 18, unit_price: 300, product_description: 'Feliz Navidad', is_custom: false },
    { product_id: null, product_name: 'Otro', quantity: 2, unit_price: 0, product_description: '', is_custom: true },
  ])
  assert.equal(form.delivery_address, 'Casa azul, Estelí')
  assert.equal(form.recipient_name, 'Alma Medina')
  assert.equal(form.recipient_phone, '83261278')
  assert.equal(feed.threadOrderPrefill(thread).items[0].is_custom, true)
  assert.deepEqual(thread, before)
})

test('explicit shipping address implies delivery when no free-text method is available; empty lines retain legacy parsing', () => {
  const form = feed.threadOrderPrefill({ delivery_address: 'Estelí', recipient_name: 'Ana', recipient_phone: '50588887777', order_lines: [line()] })
  assert.equal(form.delivery_method, 'delivery')
  assert.equal(form.delivery_address, 'Estelí')
  assert.equal(form.recipient_phone, '88887777')
  for (const order_lines of [null, []]) {
    const legacy = feed.threadOrderPrefill({ summary: '18 vitrales a C$300 c/u', order_lines })
    assert.equal(legacy.items[0].quantity, 18)
    assert.equal(legacy.items[0].unit_price, 300)
  }
})

test('invalid nonempty persisted lines fail visibly instead of replacing facts with a text guess', () => {
  assert.throws(() => feed.threadOrderPrefill({ order_lines: [line({ quantity: 0 })] }), /detalle del pedido/i)
})
