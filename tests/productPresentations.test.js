import test from 'node:test'
import assert from 'node:assert/strict'
import { productPriceDisplay } from '../src/utils/productPriceDisplay.js'
import {
  activeOptions,
  presentationPrice,
  unitPrice,
  formatPresentationMoney,
  presentationPriceLabel,
  selectionTotals,
  changeDesignQuantity,
  copyDesigns,
  moveOption,
  presentationSnapshot,
  orderItemOptions,
  designLines,
  presentationMessageLines,
  validateProductOptions,
} from '../src/utils/productPresentations.js'

const pack = {
  id: 'six',
  label: 'Paquete de 6',
  units: 6,
  price: '690',
  is_active: true,
}
test('active presentations sort without mutating and sync cheapest pack price, not piece price', () => {
  const rows = [
    pack,
    { id: 'one', units: 1, price: 135, sort_order: -1 },
    { price: 1, is_active: false },
  ]
  assert.equal(activeOptions(rows)[0].id, 'one')
  assert.equal(rows[0], pack)
  assert.equal(presentationPrice(rows, 99), 135)
  assert.equal(presentationPrice([], 99), 99)
  assert.equal(presentationPrice([{ ...pack, is_active: false }], 99), 99)
})
test('currency, unit and pack math retain cents', () => {
  assert.equal(unitPrice(pack), 115)
  assert.equal(unitPrice({ units: 3, price: 100 }), 33.33)
  assert.equal(formatPresentationMoney(1380), 'C$1,380')
  assert.equal(formatPresentationMoney(12.5), 'C$12.50')
  assert.equal(presentationPriceLabel([pack]), 'Desde C$690')
  assert.equal(presentationPriceLabel([], 135), 'C$135')
})
test('counts required pieces from packs and reports incomplete, complete and over selections', () => {
  assert.deepEqual(selectionTotals(2, 6, [{ quantity: 4 }]), {
    required: 12,
    chosen: 4,
    remaining: 8,
    over: 0,
  })
  assert.deepEqual(selectionTotals(1, 6, [{ quantity: 6 }]), {
    required: 6,
    chosen: 6,
    remaining: 0,
    over: 0,
  })
  assert.deepEqual(selectionTotals(1, 3, [{ quantity: 6 }, { quantity: -4 }]), {
    required: 3,
    chosen: 6,
    remaining: 0,
    over: 3,
  })
})
test('design counters clamp to required pieces and preserve notes; decrement removes selection', () => {
  const design = { id: 'p', name: 'Pikachu' }
  const first = changeDesignQuantity([], design, 1, 2)
  assert.deepEqual(first, [
    { design_id: 'p', design_name: 'Pikachu', quantity: 1, note: '' },
  ])
  first[0].note = 'Ana'
  const second = changeDesignQuantity(first, design, 5, 2)
  assert.equal(second[0].quantity, 2)
  assert.equal(second[0].note, 'Ana')
  assert.equal(first[0].quantity, 1)
  assert.deepEqual(changeDesignQuantity(first, design, -1, 2), [])
})
test('copy strips IDs/business and keeps names/images; reorder is immutable', () => {
  const source = [
    {
      id: 'p',
      business_id: 2,
      name: 'Árbol',
      image_url: 'https://example.test/a',
      is_active: false,
    },
  ]
  assert.deepEqual(copyDesigns(source), [
    {
      name: 'Árbol',
      image_url: 'https://example.test/a',
      is_active: false,
      sort_order: 0,
    },
  ])
  assert.deepEqual(moveOption(['a', 'b'], 0, 1), ['b', 'a'])
  assert.deepEqual(moveOption(['a', 'b'], 0, -1), ['a', 'b'])
})
test('snapshots persist historical labels, units, names and notes independently of current catalog', () => {
  assert.deepEqual(presentationSnapshot(pack), {
    presentation_id: 'six',
    presentation_label: 'Paquete de 6',
    units_per_presentation: 6,
    unit_price: 690,
  })
  const item = {
    presentation_id: null,
    presentation_label: 'Paquete antiguo',
    units_per_presentation: 6,
    order_item_designs: [
      { design_id: null, design_name: 'Muñeco', quantity: 1, note: 'Ana' },
    ],
  }
  assert.deepEqual(orderItemOptions(item), {
    presentation_id: null,
    presentation_label: 'Paquete antiguo',
    units_per_presentation: 6,
    designs: item.order_item_designs,
  })
  assert.deepEqual(orderItemOptions({}), {})
})
test('WhatsApp lines show pack total, chosen notes and incomplete count', () => {
  const designs = [
    { design_name: 'Pikachu', quantity: 2 },
    { design_name: 'Muñeco', quantity: 1, note: 'Ana' },
  ]
  assert.deepEqual(designLines(designs), ['• Pikachu ×2', '• Muñeco ×1 — Ana'])
  const lines = presentationMessageLines({ name: 'Esferas' }, pack, 2, designs)
  assert.equal(lines[1], '2 × Paquete de 6 (C$1,380)')
  assert.equal(lines.at(-1), '(faltan 9 por elegir)')
})
test('validates blank/duplicate names, integer units, nonnegative money and HTTPS images before saving', () => {
  assert.equal(
    validateProductOptions([pack], [{ name: 'Muñeco', image_url: null }]),
    null
  )
  for (const presentations of [
    [{ label: ' ', units: 1, price: 0 }],
    [{ label: 'Pack', units: 1.5, price: 2 }],
    [{ label: 'Pack', units: 1, price: -1 }],
  ])
    assert.ok(validateProductOptions(presentations, []))
  assert.ok(validateProductOptions([], [{ name: 'Pika' }, { name: 'pika' }]))
  assert.ok(
    validateProductOptions(
      [],
      [{ name: 'Pika', image_url: 'http://example.test/x' }]
    )
  )
})

test('HTML snapshot detail escapes design notes and presentation labels for print', async () => {
  const { escapePresentationHtml, orderItemDetailLines } = await import(
    '../src/utils/productPresentations.js'
  )
  const lines = orderItemDetailLines({
    presentation_label: '<pack>',
    order_item_designs: [
      { design_name: '<img>', quantity: 1, note: '<script>"hi"</script>' },
    ],
  })
  assert.equal(lines[0], '<pack>')
  assert.equal(escapePresentationHtml(lines[0]), '&lt;pack&gt;')
  assert.ok(!escapePresentationHtml(lines[1]).includes('<'))
})

test('WhatsApp generator keeps legacy message exact and adds packs without losing tracking', async () => {
  const { readFile } = await import('node:fs/promises')
  const { presentationMessageLines } = await import(
    '../src/utils/productPresentations.js'
  )
  const source = (
    await readFile(
      new URL('../src/utils/generateWhatsappLink.js', import.meta.url),
      'utf8'
    )
  )
    .replace(/^import .*$/gm, '')
    .replaceAll('export ', '')
  const events = []
  const generate = new Function(
    'window',
    'CONTACT_PHONE',
    'trackWhatsAppContact',
    'presentationMessageLines',
    'productPriceDisplay',
    `${source}; return generateWhatsAppLinkForSingleProduct`
  )(
    {
      location: { origin: 'https://example.test' },
      fbq: () => events.push('contact'),
    },
    '123',
    () => events.push('analytics'),
    presentationMessageLines,
    productPriceDisplay
  )
  const product = { id: 'p', name: 'Esferas', price: 135 }
  const legacy = decodeURIComponent(generate(product).split('?text=')[1])
  assert.equal(
    legacy,
    'Hola! Me gustaría cotizar:\n\n- Esferas: C$135\nhttps://example.test/product/p\n\nGracias!'
  )
  const configured = decodeURIComponent(
    generate(product, '123', {
      presentation: pack,
      packs: 2,
      designs: [],
      hasDesigns: true,
    }).split('?text=')[1]
  )
  assert.match(configured, /2 × Paquete de 6 \(C\$1,380\)/)
  assert.match(configured, /faltan 12 por elegir/)
  assert.equal(events.length, 4)
})

test('draft identities are stable for existing rows and unique for newly copied options', async () => {
  const { identifyOptions } = await import(
    '../src/utils/productPresentations.js'
  )
  let count = 0
  const rows = [{ id: 'old', name: 'Old' }, { name: 'New' }]
  const identified = identifyOptions(rows, () => `new-${++count}`)
  assert.equal(identified[0].id, 'old')
  assert.equal(identified[1].id, 'new-1')
  assert.equal(rows[1].id, undefined)
  assert.deepEqual(
    identifyOptions(identified, () => {
      throw Error('unnecessary id')
    }),
    identified
  )
})

test('catalog selection sets pack snapshot without leaking old design choices; manual choice clears options', async () => {
  const { catalogOrderItem } = await import(
    '../src/utils/productPresentations.js'
  )
  const existing = {
    material: 'PLA',
    quantity: 2,
    product_id: 'old',
    designs: [{ design_name: 'Old', quantity: 1 }],
    presentation_label: 'Old pack',
  }
  const selected = catalogOrderItem(
    { id: 'p', name: 'Esferas', price: 135, presentations: [pack] },
    existing
  )
  assert.equal(selected.product_id, 'p')
  assert.equal(selected.product_name, 'Esferas')
  assert.equal(selected.quantity, 2)
  assert.equal(selected.unit_price, 690)
  assert.equal(selected.presentation_label, 'Paquete de 6')
  assert.equal(selected.units_per_presentation, 6)
  assert.deepEqual(selected.designs, [])
  assert.equal(selected.material, 'PLA')
  const manual = catalogOrderItem(null, selected)
  assert.equal(manual.product_id, null)
  assert.equal(manual.presentation_label, null)
  assert.equal(manual.units_per_presentation, null)
  assert.deepEqual(manual.designs, [])
  assert.equal(existing.product_id, 'old')
})
test('legacy catalog selection uses the original single price and no snapshot values', async () => {
  const { catalogOrderItem } = await import(
    '../src/utils/productPresentations.js'
  )
  const item = catalogOrderItem({ id: 'legacy', name: 'Legacy', price: 135 })
  assert.equal(item.unit_price, 135)
  assert.equal(item.presentation_label, null)
})

test('business order totals count packs and retain additional historical item subtotals', async () => {
  const { configuredOrderTotal, orderItemInsertSnapshot } = await import(
    '../src/utils/productPresentations.js'
  )
  assert.equal(
    configuredOrderTotal({ quantity: 2, unit_price: 690, rush_fee: 20 }, [
      { subtotal: 100 },
    ]),
    1500
  )
  const source = {
    id: 'old',
    order_id: 'old-order',
    product_id: 'p',
    product_name: 'P',
    quantity: 2,
    unit_price: 690,
    subtotal: 1380,
    presentation_id: null,
    presentation_label: 'Old pack',
    units_per_presentation: 6,
    created_at: 'yesterday',
    products: { name: 'Current' },
    order_item_designs: [
      { design_id: null, design_name: 'Muñeco', quantity: 1, note: 'Ana' },
    ],
  }
  const row = orderItemInsertSnapshot(source, 'new-order')
  assert.equal(row.id, undefined)
  assert.equal(row.created_at, undefined)
  assert.equal(row.products, undefined)
  assert.equal(row.order_item_designs, undefined)
  assert.equal(row.order_id, 'new-order')
  assert.equal(row.presentation_label, 'Old pack')
  assert.equal(row.unit_price, 690)
  assert.deepEqual(row.designs, [
    { design_id: null, design_name: 'Muñeco', quantity: 1, note: 'Ana' },
  ])
  assert.equal(source.order_id, 'old-order')
})
