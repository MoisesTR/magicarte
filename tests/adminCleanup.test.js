import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { moneyNIO } from '../src/utils/finance.js'
import * as feed from '../src/utils/whatsappFeed.js'
import { normalizeClientPhone } from '../src/utils/orderClientLink.js'

for (const [value, expected] of [
  ['+505 8421 6792', '84216792'],
  ['505-8421-6792', '84216792'],
  ['84216792', '84216792'],
  ['+506 7254 5734', '50672545734'],
  ['', ''],
  [null, ''],
  ['123-4567', '1234567'],
]) test(`shared phone normalization preserves ${JSON.stringify(value)}`, async () => {
  const { normalizePhone } = await import('../src/utils/phone.js')
  assert.equal(normalizePhone(value), expected)
  assert.equal(feed.normalizePhone, normalizePhone, 'legacy feed export is an alias, not another implementation')
  assert.equal(normalizeClientPhone, normalizePhone, 'legacy client export is an alias')
})

for (const [value, expected] of [
  ['84216792', '50584216792'],
  ['+505 8421 6792', '50584216792'],
  ['+506 7254 5734', '50672545734'],
  ['', ''],
  [null, ''],
]) test(`WhatsApp phone normalization preserves ${JSON.stringify(value)}`, async () => {
  const { toWhatsAppPhone } = await import('../src/utils/phone.js')
  assert.equal(toWhatsAppPhone(value), expected)
  assert.equal(feed.chatPhone({ customer_phone: value }), expected)
})

test('short equal numbers do not become inferred order matches after sharing normalization', () => {
  const common = { business_id: 1, created_at: '2026-11-20T12:00:00Z' }
  assert.equal(feed.matchThreadsToOrders([{ ...common, id: 't', chat_key: '1234567' }], [{ ...common, id: 'o', customer_phone: '1234567', status: 'pending' }]).size, 0)
})

for (const [file, field] of [
  ['src/pages/Orders.jsx', 'customer_phone'],
  ['src/pages/Orders.jsx', 'recipient_phone'],
  ['src/pages/Clients.jsx', 'phone'],
]) test(`${file} ${field} input accepts foreign phones and limits to 15 digits`, async () => {
  const source = await readFile(file, 'utf8')
  assert.match(source, /import \{ normalizePhone \} from ['"]\.\.\/utils\/phone/)
  const input = source.slice(source.indexOf(`value={formData.${field}}`)).split('/>')[0]
  const expression = input.match(new RegExp(`${field}: (normalizePhone\\((?:e|event)\\.target\\.value\\)\\.slice\\(0, ?15\\))`))?.[1]
  assert.ok(expression, 'actual onChange must use shared normalization capped at 15 digits')
  const normalizePhone = (await import('../src/utils/phone.js')).normalizePhone
  const onChangeValue = new Function('e', 'event', 'normalizePhone', `return ${expression}`)
  for (const [value, expected] of [['+506 7254 5734', '50672545734'], ['+505 8421 6792', '84216792'], ['1234567890123456', '123456789012345']]) {
    const event = { target: { value } }
    assert.equal(onChangeValue(event, event, normalizePhone), expected)
  }
  assert.doesNotMatch(input, /length !== 8|\/8</, 'foreign numbers are not shown as invalid local phones')
})

for (const [value, expected] of [
  [1400, 'C$ 1,400'],
  [1400.5, 'C$ 1,400.50'],
  [0, 'C$ 0'],
  [-1400.5, 'C$ -1,400.50'],
  [-1400, 'C$ -1,400'],
  [1400.567, 'C$ 1,400.57'],
]) test(`moneyNIO formats ${value} consistently`, () => assert.equal(moneyNIO(value), expected))

test('editing an order omits hidden follow-up/social fields rather than wiping them', async () => {
  const source = await readFile('src/pages/Orders.jsx', 'utf8')
  const expression = source.match(/const orderData = (\{[\s\S]*?\n      \})\n\n      let orderId/)?.[1]
  assert.ok(expression, 'inspect the actual payload shared by create and update')
  const formData = { customer_name: 'Ana', customer_phone: '50672545734', delivery_method: 'pickup', status: 'backlog', follow_up_reason: '', follow_up_date: '', customer_social_media: '' }
  const payload = new Function('formData', 'clientId', 'isInPerson', 'toNumber', 'calculateTotal', `return (${expression})`)(formData, 'client', false, Number, () => 0)
  for (const field of ['follow_up_date', 'follow_up_reason', 'customer_social_media']) assert.equal(Object.hasOwn(payload, field), false, field)
  assert.equal(payload.customer_phone, '50672545734')
  assert.equal(payload.status, 'backlog', 'database status keys remain unchanged')
  assert.match(source, /updateOrder\(editingOrder.id, orderData\)/)
})

test('Magic Arte no longer retains unreachable engraving and disabled reminder branches', async () => {
  const app = await readFile('src/App.jsx', 'utf8')
  assert.match(app, /const JoyeriaOrders = lazy\(\(\) => import\('\.\/pages\/joyeria\/Orders'\)\)/)
  assert.match(app, /'joyeria-trigueros': JoyeriaOrders/)
  const source = await readFile('src/pages/Orders.jsx', 'utf8')
  assert.doesNotMatch(source, /isInPerson|SHOW_SOCIAL_MEDIA|SHOW_WHATSAPP_REMINDER|openFollowUpWhatsApp|followUpReasonLabels|getFollowUpColor/)
})

test('admin copy uses formal QR wording and consistent WhatsApp labels', async () => {
  const orders = await readFile('src/pages/Orders.jsx', 'utf8')
  assert.match(orders, /Visítenos/)
  assert.doesNotMatch(orders, /Visitanos/)
  const source = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8')
  assert.match(source, /unanswered: 'Sin responder'/)
  assert.match(source, /waiting: 'Esperando al cliente'/)
  const groups = feed.groupThreads([], '2026-11-20')
  assert.ok(groups.some(group => group.title === 'Sin responder'))
  assert.ok(groups.some(group => group.title === 'Esperando al cliente'))
})

test('Magic Arte money displays use the shared formatter rather than rounding totals', async () => {
  for (const [file, helper] of [
    ['src/pages/Orders.jsx', 'moneyNIO'],
    ['src/pages/Clients.jsx', 'formatCurrency'],
    ['src/pages/Inventory.jsx', 'money'],
    ['src/pages/Finances.jsx', 'money'],
  ]) {
    const source = await readFile(file, 'utf8')
    assert.ok(source.includes(`${helper}(`), file)
    assert.doesNotMatch(source, /C\$ \{[^\n}]*\.toFixed\(/, file)
  }
})
