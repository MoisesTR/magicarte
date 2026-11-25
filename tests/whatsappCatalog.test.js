import test from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogSlug,
  catalogFilenames,
  catalogPriceLine,
  catalogSizeLine,
  wrapCatalogText,
  chunkCatalogFiles,
  chooseCatalogDelivery,
  toggleCatalogSelection,
  selectVisibleProducts,
} from '../src/utils/whatsappCatalog.js'

const packs = [
  { label: 'Set de 6', price: 800, sort_order: 2, is_active: true },
  { label: 'Inactivo', price: 1, sort_order: 0, is_active: false },
  { label: 'Set de 3', price: 420, sort_order: 1, is_active: true },
]
test('catalog slugs remove accents, symbols and unsafe path characters', () => {
  assert.equal(
    catalogSlug(' Esféra Pokémon / estilo ¡vitral! 🎨 '),
    'esfera-pokemon-estilo-vitral'
  )
  assert.equal(catalogSlug('áéíóú ñ ü & ?'), 'aeiou-n-u')
  assert.equal(catalogSlug('🎨 /'), 'producto')
})
test('catalog filenames preserve order, pad and stay unique for duplicate names', () => {
  const names = catalogFilenames([
    { name: 'Esféra Pokémon estilo vitral' },
    { name: 'Esféra Pokémon estilo vitral' },
    { name: '../' },
  ])
  assert.deepEqual(names, [
    '01-esfera-pokemon-estilo-vitral.jpg',
    '02-esfera-pokemon-estilo-vitral.jpg',
    '03-producto.jpg',
  ])
  assert.equal(new Set(names).size, 3)
  const many = catalogFilenames(
    Array.from({ length: 101 }, () => ({ name: 'a'.repeat(300) }))
  )
  assert.match(many[0], /^001-/)
  assert.match(many[100], /^101-/)
  assert.ok(many.every((name) => name.length < 180))
})
test('active presentation price lines are sorted without mutating input', () => {
  assert.equal(
    catalogPriceLine({ price: 300 }, packs),
    'Set de 3: C$420 · Set de 6: C$800'
  )
  assert.equal(packs[0].sort_order, 2)
})
test('single prices reuse money formatting, including legacy and unknown modes', () => {
  assert.equal(catalogPriceLine({ price: 300 }), 'C$300')
  assert.equal(
    catalogPriceLine({ price: '1234.5', price_mode: 'unknown' }),
    'C$1,234.50'
  )
  assert.equal(catalogPriceLine({ price: 0 }, [packs[1]]), 'C$0')
})
test('quote and from modes mirror storefront wording instead of fixed pack offers', () => {
  assert.equal(
    catalogPriceLine({ price: 300, price_mode: 'quote' }, packs),
    'Precio según diseño'
  )
  assert.equal(
    catalogPriceLine({ price: 300, price_mode: 'from' }),
    'Desde C$ 300'
  )
  assert.equal(
    catalogPriceLine({ price: 300, price_mode: 'from' }, packs),
    'Desde C$ 420'
  )
})
test('including price off removes every price mode and presentation line', () => {
  for (const price_mode of ['fixed', 'from', 'quote'])
    assert.equal(catalogPriceLine({ price: 300, price_mode }, packs, false), '')
})
test('size line formats both dimensions, decimals and integer strings', () => {
  assert.equal(
    catalogSizeLine({ width: 8.9, length: '8.9' }),
    'Medidas: 8.9 × 8.9 cm'
  )
  assert.equal(
    catalogSizeLine({ width: '8.0', length: 9 }),
    'Medidas: 8 × 9 cm'
  )
})
test('size line does not invent missing or invalid dimensions', () => {
  for (const product of [
    {},
    { width: 8 },
    { length: 8 },
    { width: '', length: 8 },
    { width: -1, length: 8 },
    { width: 'bad', length: 8 },
  ])
    assert.equal(catalogSizeLine(product), '')
})
const measure = (text) => ({ width: text.length * 10 })
test('text wraps to two measured lines with ellipsis', () => {
  const lines = wrapCatalogText(
    'Esfera pokemon con flores azules y blancas',
    150,
    measure,
    2
  )
  assert.equal(lines.length, 2)
  assert.ok(lines[1].endsWith('…'))
  assert.ok(lines.every((line) => measure(line).width <= 150))
})
test('wrap preserves short text and safely truncates long unbroken names', () => {
  assert.deepEqual(wrapCatalogText('Esfera', 150, measure, 2), ['Esfera'])
  const lines = wrapCatalogText('A'.repeat(90), 150, measure, 2)
  assert.equal(lines.length, 2)
  assert.ok(lines[1].endsWith('…'))
  assert.ok(lines.every((line) => measure(line).width <= 150))
  assert.deepEqual(wrapCatalogText('', 150, measure, 2), [])
})
test('23 files chunk into exact ordered ranges without mutation', () => {
  const files = Array.from({ length: 23 }, (_, i) => i)
  const chunks = chunkCatalogFiles(files, 10)
  assert.deepEqual(
    chunks.map((chunk) => chunk.label),
    ['1–10', '11–20', '21–23']
  )
  assert.deepEqual(
    chunks.flatMap((chunk) => chunk.files),
    files
  )
  assert.deepEqual(chunkCatalogFiles([], 10), [])
  assert.throws(() => chunkCatalogFiles(files, 0), /chunk/i)
})
test('delivery prefers sharing the actual full JPEG batch', () => {
  const files = [{ name: 'one.jpg' }]
  const plan = chooseCatalogDelivery(files, {
    canShare: (data) => data.files === files,
    share() {},
    showDirectoryPicker() {},
  })
  assert.equal(plan.kind, 'share')
  assert.equal(plan.chunks[0].files, files)
})
test('delivery splits unsupported large batches only when all chunks can share', () => {
  const files = Array.from({ length: 23 }, (_, i) => i)
  const plan = chooseCatalogDelivery(files, {
    canShare: ({ files }) => files.length <= 10,
    share() {},
  })
  assert.equal(plan.kind, 'share')
  assert.deepEqual(
    plan.chunks.map((chunk) => chunk.label),
    ['1–10', '11–20', '21–23']
  )
})
test('delivery falls back to folder when share is absent, throws or rejects a chunk', () => {
  for (const caps of [
    {},
    {
      canShare() {
        throw new Error('not supported')
      },
      share() {},
    },
    { canShare: () => false, share() {} },
    { canShare: () => true },
  ]) {
    assert.equal(
      chooseCatalogDelivery([{}], { ...caps, showDirectoryPicker() {} }).kind,
      'folder'
    )
  }
})
test('delivery uses downloads when no other API is available', () => {
  assert.equal(chooseCatalogDelivery([{}], {}).kind, 'downloads')
  assert.equal(
    chooseCatalogDelivery([], { canShare: () => true, share() {} }).kind,
    'downloads'
  )
})
test('selection toggles immutable IDs and select all adds only current filtered products', () => {
  const selected = ['hidden']
  assert.deepEqual(toggleCatalogSelection(selected, 'a'), ['hidden', 'a'])
  assert.deepEqual(toggleCatalogSelection(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(
    selectVisibleProducts(selected, [{ id: 'a' }, { id: 'a' }]),
    ['hidden', 'a']
  )
  assert.deepEqual(selected, ['hidden'])
})

test('delivery can reduce chunks further when a browser accepts fewer than ten files', () => {
  const files = Array.from({ length: 23 }, (_, i) => i)
  const plan = chooseCatalogDelivery(files, {
    canShare: ({ files }) => files.length <= 4,
    share() {},
  })
  assert.equal(plan.kind, 'share')
  assert.deepEqual(
    plan.chunks.flatMap((chunk) => chunk.files),
    files
  )
  assert.ok(plan.chunks.every((chunk) => chunk.files.length <= 4))
})
test('delivery can force chunking after an optimistic full-batch share fails', () => {
  const files = Array.from({ length: 23 }, (_, i) => i)
  const plan = chooseCatalogDelivery(
    files,
    { canShare: () => true, share() {} },
    10
  )
  assert.equal(plan.kind, 'share')
  assert.deepEqual(
    plan.chunks.map((chunk) => chunk.label),
    ['1–10', '11–20', '21–23']
  )
})
