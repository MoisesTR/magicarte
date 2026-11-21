import test from 'node:test'
import assert from 'node:assert/strict'
import { productPriceDisplay } from '../src/utils/productPriceDisplay.js'
import { presentationPriceLabel } from '../src/utils/productPresentations.js'

const product = { name: 'Marco floral', price: '1100.00' }
const presentations = [
  { id: 'inactive', price: 20, is_active: false },
  { id: 'large', price: '1600', is_active: true },
  { id: 'small', price: '1100', is_active: true },
]

for (const mode of ['fixed', undefined, 'unexpected', null]) {
  test(`fixed and legacy mode ${mode} preserve the exact raw price label`, () => {
    assert.deepEqual(productPriceDisplay({ ...product, price_mode: mode }), {
      mode: 'fixed',
      label: 'C$ 1100.00',
      note: null,
    })
    assert.deepEqual(
      productPriceDisplay({ ...product, price_mode: mode }, presentations),
      {
        mode: 'fixed',
        label: presentationPriceLabel(presentations, product.price),
        note: null,
      }
    )
  })
}

test('fixed keeps the legacy presentation fallback formatting when every presentation is inactive', () => {
  const rows = presentations.slice(0, 1)
  assert.equal(
    productPriceDisplay(product, rows).label,
    presentationPriceLabel(rows, product.price)
  )
  assert.equal(productPriceDisplay(product, []).label, 'C$ 1100.00')
})

test('from uses existing money rounding and a space after the currency', () => {
  assert.deepEqual(productPriceDisplay({ ...product, price_mode: 'from' }), {
    mode: 'from',
    label: 'Desde C$ 1,100',
    note: 'El precio final depende del tamaño y los detalles.',
  })
  assert.equal(
    productPriceDisplay({ price: 1100.256, price_mode: 'from' }).label,
    'Desde C$ 1,100.26'
  )
})

test('from uses the lowest active presentation without changing rows, or the base price if none are active', () => {
  const before = structuredClone(presentations)
  assert.equal(
    productPriceDisplay({ price: 9999, price_mode: 'from' }, presentations)
      .label,
    'Desde C$ 1,100'
  )
  assert.equal(
    productPriceDisplay(
      { ...product, price_mode: 'from' },
      presentations.slice(0, 1)
    ).label,
    'Desde C$ 1,100'
  )
  assert.deepEqual(presentations, before)
})

test('quote is numberless even with base price and presentations', () => {
  for (const rows of [undefined, [], presentations]) {
    const display = productPriceDisplay(
      { ...product, price_mode: 'quote' },
      rows
    )
    assert.deepEqual(display, {
      mode: 'quote',
      label: 'Precio según diseño',
      note: 'Cotice sin compromiso por WhatsApp.',
    })
    assert.doesNotMatch(JSON.stringify(display), /C\$|1100|1,100|1600/)
  }
})
