import test from 'node:test'
import assert from 'node:assert/strict'
import { threadOrderPrefill } from '../src/utils/whatsappFeed.js'

for (const [thread, name, phone] of [
  [{ customer_phone: '+505 8421 6792' }, '', '84216792'],
  [{ customer_name: '  Alma Medina  ', customer_phone: '+505 8326-1278' }, 'Alma Medina', '83261278'],
  [{ chat_key: '50584216792' }, '', '84216792'],
  [{ customer_phone: '50672545734' }, '', '50672545734'],
  [{ chat_key: 'name:alma' }, '', ''],
  [{}, '', ''],
]) test(`prefill keeps names separate from normalized phone: ${JSON.stringify(thread)}`, () => {
  const form = threadOrderPrefill(thread)
  assert.equal(form.customer_name, name)
  assert.equal(form.customer_phone, phone)
})

test('prefill extracts per-piece quantity and price without dropping personalization', () => {
  const summary = '18 decoraciones estilo vitral a C$300 c/u = C$5,400; grabados «Alma Medina», «Angelo Moreno», Feliz Navidad'
  const form = threadOrderPrefill({ summary, quoted_amount: 5400 })
  assert.equal(form.items[0].quantity, 18)
  assert.equal(form.items[0].unit_price, 300)
  assert.ok(form.items[0].product_name.length <= 60)
  assert.equal(form.items[0].product_description, summary)
  assert.equal(threadOrderPrefill({ summary: 'Esfera Pokémon, personalizada', quoted_amount: 450 }).items[0].product_name, 'Esfera Pokémon')
  assert.equal(threadOrderPrefill({ quoted_amount: 450 }).items[0].unit_price, 450)
  assert.equal(threadOrderPrefill({}).items[0].quantity, 1)
})

for (const method of ['envío por Cargotrans a Estelí', 'delivery', 'motorizado', 'encomienda', 'envío a León']) test(`prefill preserves delivery information: ${method}`, () => {
  const form = threadOrderPrefill({ delivery_method: method })
  assert.equal(form.delivery_method, 'delivery')
  assert.match(form.delivery_address, new RegExp(method))
})
for (const method of ['Retiro en El Edén', 'Lo recoge']) test(`prefill recognizes pickup: ${method}`, () => {
  assert.equal(threadOrderPrefill({ delivery_method: method }).delivery_method, 'pickup')
})
test('prefill retains paid chat amount as a verification note, never an actual payment', () => {
  const form = threadOrderPrefill({ summary: 'Vitral', notes: 'Azul', paid_amount: 2700 })
  assert.match(form.notes, /Anticipo recibido por WhatsApp: C\$2700 \(verificar comprobante\)/)
  assert.equal(form.payment_status, 'unpaid')
  assert.equal(Object.hasOwn(form, 'paid_amount'), false)
})

test('blank phone falls back to numeric chat key without interpreting named chats as phones', () => {
  assert.equal(threadOrderPrefill({ customer_phone: '   ', chat_key: '50584216792' }).customer_phone, '84216792')
  assert.equal(threadOrderPrefill({ customer_phone: '', chat_key: 'name:83261278' }).customer_phone, '')
})

test('short product label keeps thousands separators and drops quantity/price text', () => {
  const julissa = threadOrderPrefill({
    summary:
      '18 decoraciones estilo vitral a C$300 c/u = C$5,400 (16 «Feliz Navidad»). Pagó el 50%.',
    quoted_amount: 5400,
  }).items[0]
  assert.equal(julissa.product_name, 'Decoraciones estilo vitral')
  assert.equal(julissa.quantity, 18)
  assert.equal(julissa.unit_price, 300)
  const spheres = threadOrderPrefill({
    summary: '10 esferas Pokémon (1 de cada una) por C$1,400. Hoy mandó el comprobante.',
    quoted_amount: 1400,
  }).items[0]
  assert.equal(spheres.product_name, 'Esferas Pokémon (1 de cada una)')
  assert.equal(spheres.quantity, 10)
  assert.equal(spheres.unit_price, 140)
  const uneven = threadOrderPrefill({
    summary: '3 llaveros por C$1,000.',
    quoted_amount: 1000,
  }).items[0]
  assert.equal(uneven.quantity, 1)
  assert.equal(uneven.unit_price, 1000)
})
