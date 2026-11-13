import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatorDataFromQuote,
  newOrderForm,
  newProductForm,
  orderFormFromQuote,
  productFormFromQuote,
} from '../src/utils/quoteForms.js'

const quote = {
  id: 'd82e0f54-a53b-4dd2-b31f-22848ed92201',
  name: 'Marco floral',
  client_name: '  JOSÉ pérez  ',
  quantity: 3,
  unit_price: 12.345,
  total_price: 37.035,
  unit_cost: 5.125,
  total_cost: 15.375,
  template_id: 'mdfFrame',
  state: { widthCm: '20', heightCm: 30 },
}

test('order maps the quote and preserves normal unpaid/pending defaults', () => {
  const form = orderFormFromQuote(quote, { orderDate: '2026-11-12' })
  assert.deepEqual(form, {
    ...newOrderForm('2026-11-12'),
    customer_name: quote.client_name,
    notes: 'Desde la cotización «Marco floral» de la calculadora.',
    items: [{
      product_id: null,
      product_query: '',
      product_open: false,
      product_active_index: -1,
      product_name: quote.name,
      product_description: 'Medida: 20 × 30 cm',
      quantity: 3,
      unit_price: 12.35,
      hours_needed: 0,
      rush_fee: 0,
      is_custom: true,
      material: '',
      engraving_minutes: '',
    }],
  })
})

test('order matches a business client ignoring accents, case and outer whitespace', () => {
  const client = {
    id: 'client-1', name: 'José Pérez', phone: '12345',
    social_media: '@jose', delivery_address: 'Managua',
  }
  const form = orderFormFromQuote(quote, { clients: [{ id: 'other', name: 'José' }, client] })
  assert.equal(form.client_id, client.id)
  assert.equal(form.customer_name, quote.client_name)
  assert.equal(form.customer_phone, client.phone)
  assert.equal(form.customer_social_media, client.social_media)
  assert.equal(form.delivery_address, client.delivery_address)
})

test('order leaves unmatched and blank clients unlinked with empty contact defaults', () => {
  for (const client_name of [quote.client_name, '', undefined]) {
    const form = orderFormFromQuote({ ...quote, client_name }, {
      clients: [{ id: 'other', name: 'Ana' }, { id: 'blank', name: '' }],
    })
    assert.equal(form.client_id, null)
    assert.equal(form.customer_phone, '')
    assert.equal(form.customer_social_media, '')
    assert.equal(form.delivery_address, '')
  }
})

test('order accepts only real, exactly formatted YYYY-MM-DD delivery dates', () => {
  for (const deliveryDate of ['2026-11-12', '2028-02-29', '2000-02-29']) {
    assert.equal(orderFormFromQuote(quote, { deliveryDate }).estimated_delivery_date, deliveryDate)
  }
  for (const deliveryDate of [undefined, '', '2026-2-01', '2026-02-29', '1900-02-29',
    '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01',
    '2026-01-01T00:00:00Z', '2026-01-01 extra']) {
    assert.equal(orderFormFromQuote(quote, { deliveryDate }).estimated_delivery_date, '')
  }
})

test('order omits dimension description unless both dimensions are positive numbers', () => {
  for (const state of [undefined, {}, { widthCm: 20 }, { widthCm: '', heightCm: 30 },
    { widthCm: 0, heightCm: 30 }, { widthCm: -1, heightCm: 30 },
    { widthCm: 'invalid', heightCm: 30 }, { widthCm: true, heightCm: 30 }]) {
    assert.equal(orderFormFromQuote({ ...quote, state }).items[0].product_description, '')
  }
})

test('order links the product without replacing the quoted name or price', () => {
  const form = orderFormFromQuote(quote, {
    linkedProduct: { id: 'product-1', name: 'Catalog name', price: 99 },
  })
  assert.equal(form.items[0].product_id, 'product-1')
  assert.equal(form.items[0].product_query, quote.name)
  assert.equal(form.items[0].product_name, quote.name)
  assert.equal(form.items[0].unit_price, 12.35)
  assert.equal(form.items[0].is_custom, false)
})

test('form prices round decimal ties and numeric strings to two decimals', () => {
  for (const [unit_price, expected] of [[1.005, 1.01], ['2.675', 2.68], [10.075, 10.08], [12.344, 12.34]]) {
    assert.equal(orderFormFromQuote({ ...quote, unit_price }).items[0].unit_price, expected)
    assert.equal(productFormFromQuote({ ...quote, unit_price }).price, expected)
  }
})

test('calculator metadata has the exact contract shape and unrounded numeric values', () => {
  assert.deepEqual(calculatorDataFromQuote({ ...quote, quantity: '3', unit_cost: '5.125' }), {
    source: 'magic-calculator', quoteId: quote.id, quoteName: quote.name,
    quantity: 3, unitPrice: 12.345, totalPrice: 37.035, unitCost: 5.125, totalCost: 15.375,
  })
})

test('product uses each contract template suggestion and keeps the default for custom/unknown', () => {
  const templates = {
    mdfFrame: 'Trabajo realizado en MDF (Fibrán) mediante corte láser.',
    acrylicPiece: 'Acrílico cortado con láser.',
    acrylicUv: 'Acrílico cortado con láser e impresión UV a todo color.',
    uvOnWood: 'Impresión UV a todo color sobre madera.',
    print3d: 'Pieza impresa en 3D.',
    print3dUv: 'Pieza impresa en 3D con detalles en impresión UV.',
  }
  for (const [template_id, expected] of Object.entries(templates)) {
    assert.equal(productFormFromQuote({ ...quote, template_id }).material_technique, expected)
  }
  for (const template_id of ['custom', 'unknown', undefined, 'toString']) {
    assert.equal(productFormFromQuote({ ...quote, template_id }).material_technique,
      newProductForm().material_technique)
  }
})

test('product is hidden, has empty description, normal defaults and no cost or calculator state', () => {
  assert.deepEqual(productFormFromQuote(quote), {
    ...newProductForm(), name: quote.name, price: 12.35, width: 20, length: 30,
    material_technique: 'Trabajo realizado en MDF (Fibrán) mediante corte láser.',
    is_visible: false,
  })
  const form = productFormFromQuote(quote)
  for (const field of ['unit_cost', 'total_cost', 'unitCost', 'totalCost', 'calculator_data', 'state']) {
    assert.equal(Object.hasOwn(form, field), false)
  }
})

test('product accepts each dimension independently only when numeric and positive', () => {
  for (const invalid of ['', ' ', undefined, null, 0, -2, 'bad', Infinity, true]) {
    const form = productFormFromQuote({ ...quote, state: { widthCm: invalid, heightCm: '12.5' } })
    assert.equal(form.width, '')
    assert.equal(form.length, 12.5)
  }
  assert.equal(productFormFromQuote({ ...quote, state: null }).length, '')
})

test('mappers are deterministic and do not mutate quote, clients or linked product', () => {
  const frozenQuote = Object.freeze({ ...quote, state: Object.freeze({ ...quote.state }) })
  const clients = Object.freeze([Object.freeze({ id: 'c', name: 'Jose Perez' })])
  const linkedProduct = Object.freeze({ id: 'p' })
  const options = Object.freeze({ clients, linkedProduct })
  assert.deepEqual(orderFormFromQuote(frozenQuote, options), orderFormFromQuote(frozenQuote, options))
  assert.deepEqual(productFormFromQuote(frozenQuote), productFormFromQuote(frozenQuote))
  assert.deepEqual(calculatorDataFromQuote(frozenQuote), calculatorDataFromQuote(frozenQuote))
})
