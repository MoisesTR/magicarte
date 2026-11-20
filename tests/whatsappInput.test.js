import test from 'node:test'
import assert from 'node:assert/strict'
import { buildThreadPayload, chatPhone } from '../src/utils/whatsappFeed.js'
const base = () => ({
  summary: '  20 llaveros  ',
  customer_name: '  María López ',
  customer_phone: '',
  chat_key: '',
  quoted_amount: '',
  unread_count: 0,
  reference_images: [],
  labels: [],
  promised_date: '',
  follow_up_date: '',
  requested_at: '',
  last_customer_message_at: '',
  last_our_message_at: '',
  last_reviewed_at: '',
  client_id: '',
  order_id: '',
})
test('manual payload normalizes identity and nullable numeric/date fields', () => {
  const value = buildThreadPayload({
    ...base(),
    customer_phone: '+505 8288-8070',
    quoted_amount: '450.50',
    labels: [' Pago pendiente ', ''],
  })
  assert.equal(value.chat_key, '50582888070')
  assert.equal(value.customer_phone, '50582888070')
  assert.equal(value.quoted_amount, 450.5)
  assert.equal(value.summary, '20 llaveros')
  assert.equal(value.customer_name, 'María López')
  assert.equal(value.client_id, null)
  assert.equal(value.promised_date, null)
  assert.deepEqual(value.labels, ['Pago pendiente'])
  assert.equal(buildThreadPayload(base()).chat_key, 'name:maría lópez')
  assert.equal(
    buildThreadPayload({ ...base(), chat_key: 'NAME: MARÍA LÓPEZ' }).chat_key,
    'name:maría lópez'
  )
  assert.equal(chatPhone({ customer_phone: '8288 8070' }), '50582888070')
  assert.equal(chatPhone({ chat_key: '50582888070' }), '50582888070')
  assert.equal(chatPhone({ chat_key: 'name:cliente' }), '')
})
for (const [changes, pattern] of [
  [{ summary: ' ' }, /resumen/i],
  [{ customer_name: '' }, /cliente/i],
  [{ quoted_amount: '-1' }, /monto/i],
  [{ quoted_amount: 'NaN' }, /monto/i],
  [{ unread_count: 1.5 }, /mensajes/i],
  [{ unread_count: -1 }, /mensajes/i],
  [{ reference_images: ['http://x.test/a'] }, /HTTPS/],
  [{ reference_images: ['https://'] }, /HTTPS/],
  [{ promised_date: '2026-11-31' }, /fecha/i],
  [{ requested_at: '2026-11-19T21:30:00' }, /zona|ISO/i],
  [{ chat_key: 'unscoped' }, /identificador/i],
])
  test(`manual input rejects ${JSON.stringify(changes)}`, () =>
    assert.throws(() => buildThreadPayload({ ...base(), ...changes }), pattern))
test('timestamp payload accepts explicit Managua zone and canonicalizes to UTC', () =>
  assert.equal(
    buildThreadPayload({ ...base(), requested_at: '2026-11-19T21:30:00-06:00' })
      .requested_at,
    '2026-11-20T03:30:00.000Z'
  ))
