import test from 'node:test'
import assert from 'node:assert/strict'
import {
  designPickerModel,
  matchDesignPhotos,
  applyDesignPhotos,
  appendDetectedDesigns,
  uploadDesignPhotos,
} from '../src/utils/productDesignPhotos.js'

test('photo-free active designs use numbered tiles sorted by sort_order and group-photo hint', () => {
  const designs = [
    { id: 'b', name: 'Eevee', sort_order: 8 },
    {
      id: 'off',
      name: 'Hidden',
      image_url: 'https://test.invalid/hidden',
      is_active: false,
    },
    { id: 'a', name: 'Pikachu', sort_order: 2 },
  ]
  const result = designPickerModel(designs)
  assert.equal(result.showGroupHint, true)
  assert.deepEqual(
    result.tiles.map(({ name, number, showPhoto }) => ({
      name,
      number,
      showPhoto,
    })),
    [
      { name: 'Pikachu', number: 1, showPhoto: false },
      { name: 'Eevee', number: 2, showPhoto: false },
    ]
  )
  assert.equal(designs[0].id, 'b')
})

test('mixed picker uses photos where present and number badges elsewhere; snapshots do not affect the hint', () => {
  const result = designPickerModel(
    [
      { id: 'a', name: 'Pikachu', image_url: 'https://test.invalid/a' },
      { id: 'b', name: 'Eevee' },
    ],
    [{ design_id: 'removed', design_name: 'Anterior' }]
  )
  assert.equal(result.showGroupHint, false)
  assert.deepEqual(
    result.tiles.map((row) => row.showPhoto),
    [true, false, false]
  )
  assert.deepEqual(
    result.tiles.map((row) => row.number),
    [1, 2, null]
  )
  assert.equal(designPickerModel([]).showGroupHint, false)
})

test('bulk matching ignores accents, case, spaces, dashes, underscores, extensions and leading numbers', () => {
  const designs = [
    { id: 'a', name: 'Pokémon Azul', image_url: 'old' },
    { id: 'b', name: 'Pikachu' },
    { id: 'c', name: 'Eevee' },
  ]
  const files = [
    { name: '03-POKEMON_azul.HEIC' },
    { name: '02 pikachu.jpeg' },
    { name: 'eevee.png' },
    { name: '04-muñeco_con-bufanda.webp' },
  ]
  const plan = matchDesignPhotos(files, designs)
  assert.equal(plan.assigned, 3)
  assert.equal(plan.created, 1)
  assert.equal(designs[0].image_url, 'old')
  assert.deepEqual(
    plan.items.map((row) => row.designIndex),
    [0, 1, 2, null]
  )
  const applied = applyDesignPhotos(designs, plan)
  assert.equal(applied[0].imageFile, files[0])
  assert.equal(applied[3].name, 'Muñeco Con Bufanda')
  assert.equal(applied[3].is_active, true)
  assert.equal(applied[3].imageFile, files[3])
  assert.equal(designs.length, 3)
})

test('bulk duplicate names are deterministic, do not create duplicate rows, and last photo wins', () => {
  const files = [{ name: '01-pikachu.jpg' }, { name: '02_PIKACHU.png' }]
  const plan = matchDesignPhotos(files, [])
  const applied = applyDesignPhotos([], plan)
  assert.equal(plan.created, 1)
  assert.equal(plan.assigned, 1)
  assert.equal(applied.length, 1)
  assert.equal(applied[0].imageFile, files[1])
})

test('numeric filenames have nonempty fallback names and nonimages fail before changing rows', () => {
  assert.equal(
    applyDesignPhotos(
      [],
      matchDesignPhotos([{ name: '03.jpg', type: 'image/jpeg' }], [])
    )[0].name,
    'Diseño 03'
  )
  assert.throws(
    () => matchDesignPhotos([{ name: 'bad.txt', type: 'text/plain' }], []),
    /foto|imagen/i
  )
})

test('edited checklist appends only checked unique names and leaves existing rows unchanged', () => {
  const original = [{ id: 'a', name: 'Pikachu' }]
  const result = appendDetectedDesigns(original, [
    { name: ' pikachu ', checked: true },
    { name: 'Eevee', checked: false },
    { name: ' Muñeco ', checked: true },
    { name: 'MUÑECO', checked: true },
  ])
  assert.equal(original.length, 1)
  assert.equal(result.length, 2)
  assert.equal(result[1].name, 'Muñeco')
  assert.equal(result[1].image_url, null)
  assert.equal(result[1].is_active, true)
})

test('design photos upload only through explicit save, sequentially with the existing compression helper', async () => {
  const file = { name: 'a.heic' }
  const original = [
    {
      id: 'a',
      name: 'Pikachu',
      imageFile: file,
      image_url: 'https://test.invalid/old',
    },
    { id: 'b', name: 'Eevee', image_url: null },
  ]
  const calls = []
  const result = await uploadDesignPhotos(original, {
    upload: async (...args) => {
      calls.push(args)
      return 'products/designs/a.webp'
    },
    resolveUrl: (path) => `https://test.invalid/${path}`,
  })
  assert.deepEqual(calls, [[file, 'products/designs']])
  assert.equal(
    result[0].image_url,
    'https://test.invalid/products/designs/a.webp'
  )
  assert.equal(result[0].imageFile, undefined)
  assert.equal(original[0].imageFile, file)
  assert.equal(result[1], original[1])
  await assert.rejects(
    uploadDesignPhotos(original, {
      upload: async () => {
        throw new Error('upload failed')
      },
    }),
    /upload failed/
  )
  assert.equal(original[0].imageFile, file)
})

test('long bulk filenames cannot create duplicate persisted 60-character design names', () => {
  const prefix = 'a'.repeat(65)
  const files = [{ name: `${prefix}-red.jpg` }, { name: `${prefix}-blue.jpg` }]
  const result = applyDesignPhotos([], matchDesignPhotos(files, []))
  assert.equal(result.length, 1)
  assert.equal(result[0].name.length, 60)
  assert.equal(result[0].imageFile, files[1])
})

test('filename prefixes require a separator so character names beginning with digits remain intact', () => {
  const result = applyDesignPhotos(
    [],
    matchDesignPhotos([{ name: '3D-robot.png' }], [])
  )
  assert.equal(result[0].name, '3d Robot')
})
