import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { COLUMNS, TABLE } from '../src/utils/constants.js'
import * as prices from '../src/utils/productPriceDisplay.js'
import * as presentations from '../src/utils/productPresentations.js'

const require = createRequire(import.meta.url)
const product = {
  id: 'frame',
  name: 'Marco floral',
  price: 1100,
  category_id: 'gifts',
  image_url: 'frame.webp',
}
const pack = {
  id: 'pack',
  product_id: 'frame',
  label: 'Paquete de 6',
  units: 6,
  price: 6600,
}

async function render(
  file,
  price_mode,
  {
    options = {
      presentations: [pack],
      designs: [{ id: 'flower', name: 'Flor' }],
    },
    related = [],
    catalog = [],
    packs = 2,
  } = {}
) {
  const source = await readFile(
    new URL(`../src/${file}`, import.meta.url),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (name === 'react')
        return {
          ...React,
          useEffect() {},
          useState(initial) {
            const value = typeof initial === 'function' ? initial() : initial
            return [value?.productId ? { ...value, packs } : value, () => {}]
          },
        }
      if (name === 'react-router-dom')
        return {
          useParams: () => ({ id: 'frame' }),
          useNavigate: () => () => {},
          Link: 'a',
        }
      if (name.endsWith('/BusinessContext'))
        return { useBusiness: () => ({ publicBusinessId: 2 }) }
      if (name.endsWith('/useProductOptions'))
        return {
          usePublicProductOptions: () => ({ data: options }),
          usePublicPresentations: () => ({ data: catalog }),
        }
      if (name.endsWith('/useSupabaseQuery'))
        return {
          useSupabaseQuery(table, query) {
            if (table === TABLE.CATEGORIES) return { data: [] }
            return {
              data: query.filters.some((row) => row.column === 'id')
                ? [{ ...product, price_mode }]
                : related,
            }
          },
        }
      if (name.endsWith('/getImageUrl'))
        return { getImageUrl: (value) => value || 'placeholder.webp' }
      if (name.endsWith('/generateWhatsappLink'))
        return { generateWhatsAppLinkForSingleProduct() {} }
      if (name.endsWith('/analytics'))
        return {
          trackGenerateLead() {},
          trackViewItem() {},
          trackSelectItem() {},
        }
      if (name.endsWith('/holidays'))
        return { getMothersDay: () => ({ isActive: false }) }
      if (name.includes('/utils/') || name.includes('/data/'))
        return require(
          `../src/${name.split('../').join('').replace(/\.js$/, '')}.js`
        )
      if (name.includes('/components/') || name.startsWith('./'))
        return { __esModule: true, default: () => null }
      return require(name)
    },
    module,
    module.exports
  )
  const tree = file.includes('ProductCard')
    ? module.exports.default({ product: { ...product, price_mode } })
    : module.exports.default()
  return renderToStaticMarkup(tree)
}

test('cards and main/related detail prices use the helper; storefront selects price_mode', async () => {
  for (const file of [
    'components/ProductCard.jsx',
    'pages/ProductDetail.jsx',
  ]) {
    const source = await readFile(
      new URL(`../src/${file}`, import.meta.url),
      'utf8'
    )
    assert.match(source, /import.*productPriceDisplay.*from/)
    assert.match(source, /productPriceDisplay\(/)
    assert.doesNotMatch(source, /`C\$ \$\{(?:product|relatedProduct)/)
  }
  assert.match(COLUMNS[TABLE.PRODUCT], /\bprice_mode\b/)
})

for (const price_mode of ['from', 'quote']) {
  test(`${price_mode}: card and mobile/desktop detail show label/note, no fixed-price pack configuration`, async () => {
    const label =
      price_mode === 'from' ? 'Desde C$ 1,100' : 'Precio según diseño'
    const note =
      price_mode === 'from'
        ? 'El precio final depende del tamaño y los detalles.'
        : 'Cotice sin compromiso por WhatsApp.'
    const card = await render('components/ProductCard.jsx', price_mode)
    assert.ok(card.includes(label))
    assert.ok(card.includes(note))
    const detail = await render('pages/ProductDetail.jsx', price_mode, {
      options: {
        presentations: [{ ...pack, price: 1100 }],
        designs: [{ id: 'flower', name: 'Flor' }],
      },
    })
    assert.equal(detail.split(label).length - 1, 3)
    assert.equal(detail.split(note).length - 1, 2)
    assert.match(detail, /Cotizar por WhatsApp/)
    assert.doesNotMatch(
      detail,
      /Cantidad de paquetes|Quitar un paquete|Agregar un paquete|2,200|13,200/
    )
    if (price_mode === 'quote') assert.doesNotMatch(detail + card, /C\$/)
    assert.match(detail, /flex-col/)
  })
}

test('fixed/legacy cards and detail preserve raw unit prices and selected pack total', async () => {
  const card = await render('components/ProductCard.jsx', undefined)
  assert.match(card, /C\$ 1100/)
  const detail = await render('pages/ProductDetail.jsx', 'fixed')
  assert.equal(detail.split('C$13,200').length - 1, 3)
  assert.match(detail, /Cantidad de paquetes/)
  const unitDetail = await render('pages/ProductDetail.jsx', undefined, {
    options: { presentations: [], designs: [] },
  })
  assert.equal(unitDetail.split('C$ 1100').length - 1, 3)
})

test('related products apply their own modes and active presentation minimums', async () => {
  const related = [
    { id: 'quote', name: 'Diseño especial', price_mode: 'quote', price: 9876 },
    { id: 'from', name: 'Otro marco', price_mode: 'from', price: 9999 },
  ]
  const html = await render('pages/ProductDetail.jsx', 'fixed', {
    related,
    catalog: [
      { product_id: 'from', price: 1500 },
      { product_id: 'from', price: 1, is_active: false },
    ],
  })
  assert.match(html, /Precio según diseño/)
  assert.match(html, /Desde C\$ 1,500/)
  assert.doesNotMatch(html, /9876|9999/)
})

test('admin offers formal Spanish mode selection, loads legacy as fixed, and uses the pure pricing payload', async () => {
  const source = await readFile(
    new URL('../src/pages/Admin.jsx', import.meta.url),
    'utf8'
  )
  for (const copy of [
    'Cómo mostrar el precio',
    'Precio fijo',
    'Desde (precio base)',
    'A cotizar',
  ])
    assert.ok(source.includes(copy))
  assert.match(source, /price_mode:\s*productPriceDisplay\(product\)\.mode/)
  assert.match(source, /productPricePayload\(formData,/)
  assert.match(source, /required=\{formData.price_mode !== 'quote'\}/)
  assert.match(source, /priceModeAvailable/)
})

async function whatsappApi() {
  const source = (
    await readFile(
      new URL('../src/utils/generateWhatsappLink.js', import.meta.url),
      'utf8'
    )
  )
    .replace(/^import .*$/gm, '')
    .replaceAll('export ', '')
  return new Function(
    'window',
    'CONTACT_PHONE',
    'trackWhatsAppContact',
    'presentationMessageLines',
    'productPriceDisplay',
    `${source}; return { generateWhatsAppLinkForProducts, generateWhatsAppLinkForSingleProduct }`
  )(
    { location: { origin: 'https://example.test' } },
    '50587795222',
    () => {},
    presentations.presentationMessageLines,
    prices.productPriceDisplay
  )
}

for (const price_mode of ['from', 'quote']) {
  test(`${price_mode}: single and batch WhatsApp messages never state a fixed price, even with stale configuration`, async () => {
    const api = await whatsappApi()
    const row = { ...product, price_mode }
    for (const link of [
      api.generateWhatsAppLinkForSingleProduct(row),
      api.generateWhatsAppLinkForSingleProduct(row, undefined, {
        presentation: pack,
        packs: 2,
        designs: [],
      }),
      api.generateWhatsAppLinkForProducts([row]),
    ]) {
      const message = new URL(link).searchParams.get('text')
      assert.match(message, /Me interesa cotizar: Marco floral/)
      assert.doesNotMatch(message, /C\$|1100|6600|13,200/)
    }
  })
}

test('fixed WhatsApp messages preserve legacy unit/pack prices in a mixed batch', async () => {
  const api = await whatsappApi()
  assert.match(
    new URL(api.generateWhatsAppLinkForSingleProduct(product)).searchParams.get(
      'text'
    ),
    /- Marco floral: C\$1100/
  )
  assert.match(
    new URL(
      api.generateWhatsAppLinkForSingleProduct(product, undefined, {
        presentation: pack,
        packs: 2,
        designs: [],
        hasDesigns: false,
      })
    ).searchParams.get('text'),
    /2 × Paquete de 6 \(C\$13,200\)/
  )
  const mixed = new URL(
    api.generateWhatsAppLinkForProducts([
      product,
      { ...product, name: 'Especial', price_mode: 'quote' },
    ])
  ).searchParams.get('text')
  assert.match(mixed, /Marco floral: C\$1100/)
  assert.match(mixed, /Me interesa cotizar: Especial/)
})

test('one additive migration follows the previous latest timestamp and defaults existing rows to fixed', async () => {
  const files = await readdir(
    new URL('../supabase/migrations/', import.meta.url)
  )
  const matching = files.filter((file) =>
    file.endsWith('_add_product_price_mode.sql')
  )
  assert.equal(matching.length, 1)
  assert.ok(matching[0] > '20261120220256_add_whatsapp_order_details.sql')
  const sql = await readFile(
    new URL(`../supabase/migrations/${matching[0]}`, import.meta.url),
    'utf8'
  )
  assert.equal(
    sql.trim(),
    "alter table public.products add column price_mode text not null default 'fixed' check (price_mode in ('fixed','from','quote'));"
  )
})
