import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import * as photos from '../src/utils/productDesignPhotos.js'
import * as presentations from '../src/utils/productPresentations.js'
const require = createRequire(import.meta.url)

async function componentHarness(name, imports = {}) {
  const source = await readFile(
    new URL(`../src/${name}`, import.meta.url),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: name.endsWith('.jsx') ? 'jsx' : 'js',
    jsx: 'automatic',
    format: 'cjs',
  })
  let cursor = 0
  const state = []
  const refs = []
  const effects = []
  const pendingEffects = []
  const hooks = {
    useState(initial) {
      const i = cursor++
      if (!(i in state))
        state[i] = typeof initial === 'function' ? initial() : initial
      return [
        state[i],
        (value) => {
          state[i] = typeof value === 'function' ? value(state[i]) : value
        },
      ]
    },
    useRef(initial) {
      const i = cursor++
      return (refs[i] ||= { current: initial })
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (
        !effects[i] ||
        deps.some((value, index) => value !== effects[i].deps[index])
      )
        pendingEffects.push(() => {
          effects[i]?.cleanup?.()
          effects[i] = { deps, cleanup: fn() }
        })
    },
    useId() {
      cursor++
      return 'dialog-title'
    },
    useCallback(fn) {
      return fn
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (specifier) =>
      ({
        react: hooks,
        '../utils/productDesignPhotos.js': photos,
        '../utils/productPresentations.js': presentations,
        '../utils/productPresentations': presentations,
        ...imports,
      })[specifier] || require(specifier),
    module,
    module.exports
  )
  return {
    render(props) {
      cursor = 0
      return module.exports.default(props)
    },
    invoke(name, ...args) {
      cursor = 0
      return module.exports[name](...args)
    },
    flushEffects() {
      pendingEffects.splice(0).forEach((run) => run())
    },
    state,
    refs,
    exports: module.exports,
  }
}
const nodes = (tree) =>
  !tree || typeof tree !== 'object'
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(nodes)
      : [tree, ...nodes(tree.props?.children)]
const text = (tree) =>
  tree == null || typeof tree === 'boolean'
    ? ''
    : typeof tree === 'string' || typeof tree === 'number'
      ? String(tree)
      : Array.isArray(tree)
        ? tree.map(text).join('')
        : text(tree.props?.children)
const findButton = (tree, label) =>
  nodes(tree).find((row) => row.type === 'button' && text(row) === label)

async function editorHarness(
  detect = async () => [
    { name: 'Eevee', checked: true },
    { name: 'Squirtle', checked: true },
  ]
) {
  const calls = []
  const options = {
    available: true,
    loading: false,
    presentations: [],
    designs: [{ id: 'p', name: 'Pikachu' }],
    setOptions: (changes) => {
      calls.push(changes)
      Object.assign(options, changes)
    },
  }
  const h = await componentHarness('components/ProductOptionsEditor.jsx', {
    '../data/productPresentations': {
      fetchProductOptions: async () => ({ designs: [] }),
    },
    '../utils/uploadImage': {
      prepareFile: (value) => value,
      uploadCompressedImage: () => assert.fail('upload before product save'),
    },
    '../utils/getImageUrl': {
      getImageUrl: (value) => `https://test.invalid/${value}`,
    },
    '../utils/productDesignDetection.js': { detectProductDesigns: detect },
    '../utils/productGallery.js': {
      createGalleryPreview: () => ({
        ready: Promise.resolve(null),
        dispose() {},
      }),
    },
    '../config/supabaseClient': {
      supabase: { auth: { getSession: async () => ({ data: {} }) } },
    },
    'react-hot-toast': {
      __esModule: true,
      default: { error: (value) => calls.push(['error', value]), success() {} },
    },
  })
  const props = {
    options,
    mainImage: { url: 'https://test.invalid/group' },
    productName: 'Llaveros',
  }
  return {
    ...h,
    props,
    options,
    calls,
    tree() {
      return this.render(this.props)
    },
  }
}

test('editor requires a main image; existing and newly selected main photos enable detection', async () => {
  const h = await editorHarness()
  h.props.mainImage = null
  assert.equal(
    findButton(h.tree(), 'Detectar diseños en la foto').props.disabled,
    true
  )
  h.props.mainImage = { file: { name: 'new.heic' } }
  assert.equal(
    findButton(h.tree(), 'Detectar diseños en la foto').props.disabled,
    false
  )
  h.props.mainImage = { url: 'https://test.invalid/old' }
  assert.equal(
    findButton(h.tree(), 'Detectar diseños en la foto').props.disabled,
    false
  )
})

test('detection UI checks suggestions by default, edits/unchecks, and appends pending rows only on confirmation', async () => {
  let input
  const h = await editorHarness(async (value) => {
    input = value
    return [
      { name: 'Eevee', checked: true },
      { name: 'Squirtle', checked: true },
    ]
  })
  await findButton(h.tree(), 'Detectar diseños en la foto').props.onClick()
  assert.deepEqual(input.existingNames, ['Pikachu'])
  assert.equal(input.productName, 'Llaveros')
  assert.equal(h.options.designs.length, 1)
  let tree = h.tree()
  const checks = nodes(tree).filter(
    (row) =>
      row.type === 'input' &&
      row.props['aria-label']?.startsWith('Seleccionar sugerencia')
  )
  assert.equal(checks.length, 2)
  assert.ok(checks.every((row) => row.props.checked))
  checks[1].props.onChange({ target: { checked: false } })
  tree = h.tree()
  nodes(tree)
    .find(
      (row) =>
        row.type === 'input' && row.props['aria-label'] === 'Nombre sugerido 1'
    )
    .props.onChange({ target: { value: ' Eevee feliz ' } })
  findButton(h.tree(), 'Agregar seleccionados').props.onClick()
  assert.deepEqual(
    h.options.designs.map((row) => row.name),
    ['Pikachu', 'Eevee feliz']
  )
  assert.equal(h.options.designs[1].image_url, null)
  assert.equal(findButton(h.tree(), 'Agregar seleccionados'), undefined)
})

test('failed detection shows a Spanish toast without changing design rows', async () => {
  const h = await editorHarness(async () => {
    throw new Error('La IA alcanzó su cuota')
  })
  const before = h.options.designs
  await findButton(h.tree(), 'Detectar diseños en la foto').props.onClick()
  assert.equal(h.options.designs, before)
  assert.deepEqual(h.calls.find(Array.isArray), [
    'error',
    'La IA alcanzó su cuota',
  ])
  assert.equal(h.options.uploading, false)
})

test('bulk file picker shows summary without uploads, then applies pending photos and new rows', async () => {
  const h = await editorHarness()
  const files = [
    { name: '01-pikachu.HEIC', type: 'image/heic' },
    { name: '02-muñeco_rojo.png', type: 'image/png' },
  ]
  const input = nodes(h.tree()).find(
    (row) => row.type === 'input' && row.props.multiple
  )
  assert.match(input.props.accept, /image\/\*/)
  input.props.onChange({ target: { files, value: 'files' } })
  assert.equal(h.options.designs.length, 1)
  assert.match(text(h.tree()), /1 asignada, 1 nueva/)
  findButton(h.tree(), 'Aplicar fotos').props.onClick()
  assert.equal(h.options.designs[0].imageFile, files[0])
  assert.equal(h.options.designs[1].name, 'Muñeco Rojo')
  assert.equal(h.options.designs[1].imageFile, files[1])
  assert.equal(findButton(h.tree(), 'Aplicar fotos'), undefined)
})

test('picker thumbnail opens native accessible modal; close button closes and mixed tiles omit group hint', async () => {
  const h = await componentHarness('components/ProductDesignPicker.jsx')
  const props = {
    designs: [{ id: 'p', name: 'Pikachu' }],
    mainImageUrl: 'https://test.invalid/group',
    onChange() {},
  }
  let tree = h.render(props)
  assert.match(text(tree), /Elige tus diseños de la foto principal/)
  const dialog = nodes(tree).find((row) => row.type === 'dialog')
  assert.ok(dialog.props['aria-labelledby'])
  assert.equal(nodes(tree).filter((row) => row.type === 'img').length, 2)
  let opened = false
  dialog.ref.current = {
    showModal() {
      opened = true
    },
    close() {
      opened = false
    },
  }
  findButton(tree, 'Ver foto principal').props.onClick()
  assert.equal(opened, true)
  findButton(tree, 'Cerrar foto principal').props.onClick()
  assert.equal(opened, false)
  tree = h.render({
    ...props,
    designs: [
      { id: 'p', name: 'Pikachu', image_url: 'https://test.invalid/p' },
      { id: 'e', name: 'Eevee' },
    ],
  })
  assert.doesNotMatch(text(tree), /Elige tus diseños de la foto principal/)
  assert.match(text(tree), /2 · Eevee/)
})

test('every product form supplies current main photo/name and public/admin pickers receive the product main image', async () => {
  for (const path of [
    'Admin.jsx',
    'hikari/Products.jsx',
    'joyeria/Products.jsx',
  ]) {
    const source = await readFile(
      new URL(`../src/pages/${path}`, import.meta.url),
      'utf8'
    )
    assert.match(source, /<ProductOptionsEditor[^>]*mainImage=/)
    assert.match(
      source,
      /<ProductOptionsEditor[^>]*productName=\{formData.name\}/
    )
  }
  const order = await readFile(
    new URL('../src/components/OrderItemOptions.jsx', import.meta.url),
    'utf8'
  )
  const publicPage = await readFile(
    new URL('../src/pages/ProductDetail.jsx', import.meta.url),
    'utf8'
  )
  assert.match(order, /mainImageUrl=/)
  assert.match(publicPage, /<ProductDesignPicker[^>]*mainImageUrl=/)
})

test('changing the main image discards stale suggestions and releases the product-save busy guard', async () => {
  let complete
  const h = await editorHarness(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  h.tree()
  h.flushEffects()
  const pending = findButton(
    h.tree(),
    'Detectar diseños en la foto'
  ).props.onClick()
  assert.equal(h.options.uploading, true)
  h.props.mainImage = { file: { name: 'other.jpg' } }
  h.tree()
  h.flushEffects()
  assert.equal(h.options.uploading, false)
  complete([{ name: 'Stale', checked: true }])
  await pending
  assert.equal(findButton(h.tree(), 'Agregar seleccionados'), undefined)
})

async function saveHookHarness({ uploadError, saveError } = {}) {
  const calls = []
  const file = { name: 'Pikachu.heic' }
  const h = await componentHarness('hooks/useProductOptions.js', {
    '@tanstack/react-query': {
      useQueryClient: () => ({
        invalidateQueries: async (value) => calls.push(['invalidate', value]),
      }),
    },
    '../data/productPresentations': {
      saveProductOptions: async (...args) => {
        calls.push(['save', ...args])
        return { error: saveError }
      },
    },
    '../utils/uploadImage': {
      uploadCompressedImage: async (...args) => {
        calls.push(['upload', ...args])
        if (uploadError) throw uploadError
        return 'products/designs/p.webp'
      },
    },
    '../utils/getImageUrl': {
      getImageUrl: (value) => `https://test.invalid/${value}`,
    },
  })
  h.invoke('useProductOptionsEditor', 'product', 2, true)
  h.state[0] = {
    available: true,
    loading: false,
    presentations: [],
    designs: [{ id: 'p', name: 'Pikachu', imageFile: file }],
  }
  return {
    ...h,
    file,
    calls,
    options() {
      return this.invoke('useProductOptionsEditor', 'product', 2, true)
    },
  }
}

test('shared save hook uploads local photos before saving design URLs and never leaks Files to persistence', async () => {
  const h = await saveHookHarness()
  assert.equal(h.calls.length, 0)
  await h.options().save('product')
  assert.deepEqual(h.calls[0], ['upload', h.file, 'products/designs'])
  const saved = h.calls[1]
  assert.equal(saved[0], 'save')
  assert.equal(saved[1], 'product')
  assert.equal(saved[2], 2)
  assert.equal(saved[3].designs[0].imageFile, undefined)
  assert.equal(
    saved[3].designs[0].image_url,
    'https://test.invalid/products/designs/p.webp'
  )
  assert.equal(h.options().designs[0].imageFile, undefined)
  assert.equal(h.calls.filter((row) => row[0] === 'invalidate').length, 2)
})

test('failed photo upload leaves local drafts intact and prevents persistence; DB retries reuse uploaded photos', async () => {
  const h = await saveHookHarness({ uploadError: new Error('upload failed') })
  await assert.rejects(h.options().save('product'), /upload failed/)
  assert.equal(
    h.calls.some((row) => row[0] === 'save'),
    false
  )
  assert.equal(h.options().designs[0].imageFile, h.file)
  const retry = await saveHookHarness({ saveError: new Error('DB failed') })
  await assert.rejects(retry.options().save('product'), /DB failed/)
  await assert.rejects(retry.options().save('product'), /DB failed/)
  assert.equal(retry.calls.filter((row) => row[0] === 'upload').length, 1)
})
