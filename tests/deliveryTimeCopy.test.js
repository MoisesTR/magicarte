import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('delivery time copy says 2 to 7 business days, subject to schedule and order size', async () => {
  const detail = await readFile(new URL('../src/pages/ProductDetail.jsx', import.meta.url), 'utf8')
  const policy = await readFile(new URL('../src/pages/ShippingPolicy.jsx', import.meta.url), 'utf8')
  for (const source of [detail, policy]) {
    assert.doesNotMatch(source, /7 a 15 días/)
    assert.match(source, /2 a 7 días hábiles/)
  }
  assert.match(detail, /Sujeto a nuestra agenda y a la complejidad y cantidad del pedido\./)
  assert.match(policy, /sujeto a nuestra agenda y a la complejidad y cantidad del pedido\./)
})
