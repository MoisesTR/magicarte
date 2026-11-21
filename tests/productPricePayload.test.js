import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  productPricePayload,
  productPriceModeFallback,
} from '../src/utils/productPricePayload.js'
import {
  newProductForm,
  productFormFromQuote,
} from '../src/utils/quoteForms.js'

for (const mode of ['fixed', 'from', 'quote']) {
  test(`admin pricing payload includes ${mode} and a numeric price`, () => {
    assert.deepEqual(
      productPricePayload({ price_mode: mode, price: '1100.25' }),
      { price_mode: mode, price: 1100.25 }
    )
    assert.deepEqual(
      productPricePayload({ price_mode: mode, price: '9999' }, 1100),
      { price_mode: mode, price: 1100 }
    )
  })
}

test('quote accepts an empty price as zero; fixed and from require a finite nonnegative price', () => {
  for (const price of ['', '  ', undefined, null]) {
    assert.deepEqual(productPricePayload({ price_mode: 'quote', price }), {
      price_mode: 'quote',
      price: 0,
    })
    for (const price_mode of ['fixed', 'from', undefined, 'invalid'])
      assert.throws(() => productPricePayload({ price_mode, price }), /precio/i)
  }
  for (const price of ['bad', -1, Infinity, NaN]) {
    for (const price_mode of ['fixed', 'from', 'quote'])
      assert.throws(() => productPricePayload({ price_mode, price }), /precio/i)
  }
  assert.deepEqual(productPricePayload({ price: 0 }), {
    price_mode: 'fixed',
    price: 0,
  })
})

test('new, photo-draft and calculator product forms start in fixed mode', () => {
  assert.equal(newProductForm().price_mode, 'fixed')
  assert.equal(
    productFormFromQuote({ name: 'Marco', unit_price: 100 }).price_mode,
    'fixed'
  )
})

for (const code of ['42703', 'PGRST204']) {
  test(`pure schema fallback removes only price_mode for ${code}`, () => {
    const payload = {
      name: 'Marco',
      price: 0,
      price_mode: 'quote',
      business_id: 2,
    }
    const error = {
      code,
      message:
        "Could not find the 'price_mode' column of 'products' in the schema cache",
    }
    assert.deepEqual(productPriceModeFallback(payload, error), {
      name: 'Marco',
      price: 0,
      business_id: 2,
    })
    assert.equal(payload.price_mode, 'quote')
    assert.equal(productPriceModeFallback({ price: 1 }, error), null)
    assert.deepEqual(
      productPriceModeFallback(payload, {
        code,
        details: 'column products.price_mode does not exist',
      }),
      { name: 'Marco', price: 0, business_id: 2 }
    )
  })
}

test('fallback refuses unrelated errors and other missing columns', () => {
  const payload = { price: 1, price_mode: 'from' }
  for (const error of [
    null,
    { code: '42501', message: 'price_mode denied' },
    { code: '23514', message: 'price_mode violates check' },
    { code: 'PGRST204', message: 'column calc_quote_id missing' },
    { code: '42703', message: 'price_model missing' },
  ])
    assert.equal(productPriceModeFallback(payload, error), null)
})

async function dataApi(results) {
  const requests = []
  const client = {
    from(table) {
      const request = { table, filters: [] }
      requests.push(request)
      return {
        insert(value) {
          request.insert = value
          return this
        },
        update(value) {
          request.update = value
          return this
        },
        select(value = '*') {
          request.select = value
          return this
        },
        eq(...args) {
          request.filters.push(args)
          return this
        },
        order() {
          return this
        },
        then(resolve, reject) {
          return Promise.resolve(
            results[requests.indexOf(request)] || { data: [], error: null }
          ).then(resolve, reject)
        },
      }
    },
  }
  const source = (
    await readFile(new URL('../src/data/products.js', import.meta.url), 'utf8')
  )
    .replace(/^import .*$/gm, '')
    .replaceAll('export ', '')
  const api = new Function(
    'supabase',
    'productPriceModeFallback',
    `${source}; return { createProduct, updateProduct, fetchProductsForBusiness }`
  )(client, productPriceModeFallback)
  return { api, requests }
}

for (const operation of ['create', 'update']) {
  test(`${operation} retries only once without an unapplied price_mode, retaining scope and inserted IDs`, async () => {
    const { api, requests } = await dataApi([
      { error: { code: 'PGRST204', message: "column 'price_mode' missing" } },
      { data: [{ id: 'saved' }], error: null },
    ])
    const payload = { name: 'Marco', price: 0, price_mode: 'quote' }
    const result =
      operation === 'create'
        ? await api.createProduct(payload, 2)
        : await api.updateProduct('saved', payload)
    assert.equal(result.error, null)
    assert.equal(result.data[0].id, 'saved')
    assert.equal(result.priceModeAvailable, false)
    assert.equal(requests.length, 2)
    const first =
      operation === 'create' ? requests[0].insert[0] : requests[0].update
    const retry =
      operation === 'create' ? requests[1].insert[0] : requests[1].update
    assert.equal(first.price_mode, 'quote')
    assert.equal(retry.price_mode, undefined)
    assert.equal(retry.price, 0)
    if (operation === 'create') {
      assert.equal(retry.business_id, 2)
      assert.equal(requests[1].select, '*')
    } else assert.deepEqual(requests[1].filters, [['id', 'saved']])
    assert.deepEqual(payload, { name: 'Marco', price: 0, price_mode: 'quote' })
  })

  test(`${operation} never retries an unrelated failure or a second failure`, async () => {
    for (const error of [
      { code: '42501', message: 'denied' },
      { code: '42703', message: 'column calc_quote_id missing' },
    ]) {
      const { api, requests } = await dataApi([{ error }])
      const result =
        operation === 'create'
          ? await api.createProduct({ price_mode: 'from' }, 2)
          : await api.updateProduct('saved', { price_mode: 'from' })
      assert.equal(result.error, error)
      assert.equal(requests.length, 1)
    }
    const error = { code: '42703', message: 'price_mode missing' }
    const { api, requests } = await dataApi([{ error }, { error }])
    const result =
      operation === 'create'
        ? await api.createProduct({ price_mode: 'quote' }, 2)
        : await api.updateProduct('saved', { price_mode: 'quote' })
    assert.equal(result.error, error)
    assert.equal(requests.length, 2)
  })

  test(`${operation} keeps Hikari/Joyería payloads without price_mode unchanged`, async () => {
    const { api, requests } = await dataApi([{ data: [], error: null }])
    const payload = { name: 'Anillo', price: 250 }
    if (operation === 'create') await api.createProduct(payload, 3)
    else await api.updateProduct('ring', payload)
    assert.equal(requests.length, 1)
    assert.equal(
      operation === 'create'
        ? requests[0].insert[0].price_mode
        : requests[0].update.price_mode,
      undefined
    )
  })
}
