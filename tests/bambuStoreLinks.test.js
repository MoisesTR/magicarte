import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as bambu from '../src/utils/bambuColors.js'
import * as colors from '../src/utils/filamentColors.js'

const white = {
  url: 'https://us.store.bambulab.com/products/pla-matte?id=40489681780872',
  image: 'https://store.bblcdn.com/s7/default/2ada3acd0e9b45d08469531d61a98bc8/PLA_Matte_white.jpg',
}

test('store catalog preserves the supplied bytes and all 110 exact variant links', async () => {
  const bytes = await readFile(new URL('../src/data/bambuStoreLinks.json', import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'e3fcd7a87aeb4b37b251bcfcc0f870c9e20e9db82f7dc9a44f35eae3dedabf6c')
  const catalog = JSON.parse(bytes)
  assert.equal(Object.keys(catalog).length, 110)
  for (const [code, link] of Object.entries(catalog)) {
    assert.deepEqual(bambu.storeLinkByCode(code), link)
    assert.match(link.url, /^https:\/\/us\.store\.bambulab\.com\/products\/[^?]+\?id=\d+$/)
    assert.match(link.image, /^https:\/\//)
  }
})

test('store lookup only accepts exact five-digit codes, including numbers', () => {
  assert.deepEqual(bambu.storeLinkByCode('11100'), white)
  assert.deepEqual(bambu.storeLinkByCode(11100), white)
  for (const code of ['', null, undefined, '1110', '111000', ' 11100', '11100 ', 'x11100', '99999', '60103', 'toString', '__proto__']) assert.equal(bambu.storeLinkByCode(code), undefined)
})

test('code autofill replaces both product fields without losing custom form data', () => {
  const form = { notes: 'Keep', quantity: '2', product_url: 'https://example.test/old', product_image_url: 'https://example.test/old.jpg' }
  const next = colors.applyBambuCode(form, '11100')
  assert.equal(next.product_url, white.url)
  assert.equal(next.product_image_url, white.image)
  assert.equal(next.notes, 'Keep')
  assert.equal(next.quantity, '2')
  assert.deepEqual(colors.applyBambuCode(next, '1110'), { ...next, bambu_code: '1110' })
  const noStoreLink = colors.applyBambuCode(next, '60103')
  assert.equal(noStoreLink.product_url, '')
  assert.equal(noStoreLink.product_image_url, '')
})

test('product fields accept valid HTTPS, normalize empty values and discard an orphan photo', () => {
  assert.deepEqual(colors.productFields({ product_url: ` ${white.url} `, product_image_url: white.image }), { product_url: white.url, product_image_url: white.image })
  for (const value of ['', ' ', null, undefined]) assert.deepEqual(colors.productFields({ product_url: value, product_image_url: white.image }), { product_url: null, product_image_url: null })
  assert.deepEqual(colors.productFields({ product_url: white.url }), { product_url: white.url, product_image_url: null })
})

test('product URL validation rejects unsafe protocols and malformed URLs in either field', () => {
  for (const url of ['http://example.test', 'javascript:alert(1)', '//example.test', 'example.test', 'https://', 'https:// bad', 'httpsx://example.test']) {
    assert.throws(() => colors.productFields({ product_url: url }), /https:\/\//)
    assert.throws(() => colors.productFields({ product_url: white.url, product_image_url: url }), /https:\/\//)
  }
})
