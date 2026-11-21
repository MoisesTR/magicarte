import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { unitPriceLabel } from '../src/utils/productPresentations.js'

test('unitPriceLabel shows exact per-unit prices as is', () => {
  assert.equal(unitPriceLabel({ price: 1080, units: 6 }), 'C$180')
  assert.equal(unitPriceLabel({ price: 1200, units: 8 }), 'C$150')
})

test('unitPriceLabel rounds inexact per-unit prices to whole córdobas with ≈', () => {
  assert.equal(unitPriceLabel({ price: 620, units: 3 }), '≈ C$207')
  assert.equal(unitPriceLabel({ price: 1000, units: 3 }), '≈ C$333')
})

test('presentation selector uses unitPriceLabel for c/u', async () => {
  const source = await readFile(new URL('../src/components/ProductPresentationSelector.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /formatPresentationMoney\(unitPrice\(/)
  assert.match(source, /unitPriceLabel\(/)
})
