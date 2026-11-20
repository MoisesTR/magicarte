import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import * as helpers from '../src/utils/productPresentations.js'

const catalog = [
  { id: 'eight', label: 'Set de 8 Esferas', units: 8, price: 1200 },
]
const saved = {
  presentation_id: null,
  presentation_label: 'Diez especiales',
  units_per_presentation: 10,
  unit_price: 1450,
}

test('special pack builder trims labels and produces a numeric null-FK snapshot, including free packs', () => {
  assert.deepEqual(
    helpers.buildSpecialPresentation({
      label: '  Diez especiales  ',
      units: '10',
      price: '1450.50',
    }),
    {
      snapshot: { ...saved, unit_price: 1450.5 },
      errors: {},
    }
  )
  assert.equal(
    helpers.buildSpecialPresentation({ label: 'Gratis', units: 1, price: 0 })
      .snapshot.unit_price,
    0
  )
})

for (const [field, values] of Object.entries({
  label: ['', '   ', null],
  units: ['', ' ', 0, -1, 1.5, 'abc', Infinity, null],
  price: ['', ' ', -1, 'abc', Infinity, null],
})) {
  for (const value of values)
    test(`special pack rejects invalid ${field}: ${String(value)}`, () => {
      const result = helpers.buildSpecialPresentation({
        label: 'Especial',
        units: 10,
        price: 1400,
        [field]: value,
      })
      assert.equal(result.snapshot, null)
      assert.equal(typeof result.errors[field], 'string')
      assert.ok(result.errors[field].length > 0)
    })
}

test('special detection requires a label and a missing/null catalog ID, not changed catalog values', () => {
  assert.equal(helpers.isSpecialPresentation(saved, catalog), true)
  assert.equal(
    helpers.isSpecialPresentation(
      { ...saved, presentation_id: 'deleted' },
      catalog
    ),
    true
  )
  assert.equal(
    helpers.isSpecialPresentation(
      { ...saved, presentation_id: 'eight' },
      catalog
    ),
    false
  )
  assert.equal(helpers.isSpecialPresentation({}, catalog), false)
  assert.equal(
    helpers.isSpecialPresentation({ presentation_label: ' ' }, catalog),
    false
  )
})

test('selector decision keeps special packs admin-only and same-ID drift historical', () => {
  const selected = {
    id: null,
    label: saved.presentation_label,
    units: 10,
    price: 1450,
  }
  assert.equal(
    helpers.presentationSelectorModel(catalog, selected, { admin: true })
      .specialSelected,
    true
  )
  assert.equal(
    helpers.presentationSelectorModel(catalog, selected).specialSelected,
    false
  )
  const drift = helpers.presentationSelectorModel(
    catalog,
    { ...catalog[0], units: 10 },
    { admin: true }
  )
  assert.equal(drift.specialSelected, false)
  assert.equal(drift.hasSnapshot, true)
  assert.equal(drift.selectedCatalogId, null)
  assert.equal(
    helpers.presentationSelectorModel(catalog, catalog[0], { admin: true })
      .selectedCatalogId,
    'eight'
  )
})

test('default special names follow units only until manually edited', () => {
  assert.equal(helpers.defaultSpecialLabel(10), 'Paquete especial de 10')
  let draft = {
    label: helpers.defaultSpecialLabel(8),
    units: 8,
    price: 1200,
    nameEdited: false,
  }
  draft = helpers.updateSpecialPresentationDraft(draft, 'units', '10')
  assert.equal(draft.label, 'Paquete especial de 10')
  draft = helpers.updateSpecialPresentationDraft(draft, 'label', 'Cumpleaños')
  draft = helpers.updateSpecialPresentationDraft(draft, 'units', '12')
  assert.equal(draft.label, 'Cumpleaños')
  assert.equal(draft.nameEdited, true)
  draft = helpers.updateSpecialPresentationDraft(draft, 'label', '')
  assert.equal(
    helpers.updateSpecialPresentationDraft(draft, 'units', '20').label,
    ''
  )
})

const require = createRequire(import.meta.url)
const nodes = (tree) =>
  !tree || typeof tree !== 'object'
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(nodes)
      : [tree, ...nodes(tree.props?.children)]
const text = (tree) =>
  tree == null || typeof tree === 'boolean'
    ? ''
    : typeof tree !== 'object'
      ? String(tree)
      : Array.isArray(tree)
        ? tree.map(text).join('')
        : text(tree.props?.children)
async function selectorHarness() {
  const source = await readFile(
    new URL(
      '../src/components/ProductPresentationSelector.jsx',
      import.meta.url
    ),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  })
  const states = []
  let cursor = 0
  const react = {
    useId: () => 'special',
    useState(initial) {
      const index = cursor++
      if (!(index in states))
        states[index] = typeof initial === 'function' ? initial() : initial
      return [
        states[index],
        (next) => {
          states[index] =
            typeof next === 'function' ? next(states[index]) : next
        },
      ]
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) =>
      name === 'react'
        ? react
        : name === '../utils/productPresentations.js'
          ? helpers
          : require(name),
    module,
    module.exports
  )
  function expand(tree) {
    if (!tree || typeof tree !== 'object') return tree
    if (Array.isArray(tree)) return tree.map(expand)
    if (typeof tree.type === 'function') return expand(tree.type(tree.props))
    return {
      ...tree,
      props: { ...tree.props, children: expand(tree.props?.children) },
    }
  }
  return {
    render(props) {
      cursor = 0
      return expand(module.exports.default(props))
    },
  }
}
const button = (tree, label) =>
  nodes(tree).find((node) => node.type === 'button' && text(node) === label)
const input = (tree, label) =>
  nodes(
    nodes(tree).find(
      (node) => node.type === 'label' && text(node).startsWith(label)
    )
  ).find((node) => node.type === 'input')

test('public selector has no special option; admin option is last, inline and touch-sized', async () => {
  const harness = await selectorHarness()
  const props = { presentations: catalog, selected: catalog[0], onChange() {} }
  assert.equal(button(harness.render(props), 'Paquete especial'), undefined)
  let tree = harness.render({ ...props, admin: true })
  const option = button(tree, 'Paquete especial')
  assert.ok(option)
  assert.equal(
    nodes(tree)
      .filter((node) => node.type === 'button')
      .at(-1),
    option
  )
  assert.match(option.props.className, /min-h-10/)
  option.props.onClick()
  tree = harness.render({ ...props, admin: true })
  assert.equal(
    nodes(tree).filter(
      (node) => node.type === 'button' && node.props['aria-pressed']
    ).length,
    1
  )
  for (const label of ['Nombre', 'Unidades', 'Precio del paquete']) {
    assert.ok(input(tree, label))
    assert.match(input(tree, label).props.className, /min-h-10/)
    assert.match(input(tree, label).props.className, /min-w-0/)
  }
})

for (const id of [null, 'deleted'])
  test(`saved special ${id} reopens editable, validates inline, and applies exact snapshot`, async () => {
    const harness = await selectorHarness()
    let chosen
    const props = {
      admin: true,
      presentations: catalog,
      selected: { id, label: saved.presentation_label, units: 10, price: 1450 },
      onChange(row) {
        chosen = row
      },
    }
    let tree = harness.render(props)
    assert.equal(button(tree, 'Paquete especial').props['aria-pressed'], true)
    assert.equal(input(tree, 'Nombre').props.value, saved.presentation_label)
    assert.equal(input(tree, 'Unidades').props.value, 10)
    assert.equal(input(tree, 'Precio del paquete').props.value, 1450)
    input(tree, 'Nombre').props.onChange({ target: { value: '   ' } })
    tree = harness.render(props)
    button(tree, 'Aplicar paquete especial').props.onClick()
    tree = harness.render(props)
    assert.equal(chosen, undefined)
    assert.ok(nodes(tree).some((node) => node.props?.role === 'alert'))
    input(tree, 'Nombre').props.onChange({
      target: { value: '  Diez nuevos  ' },
    })
    tree = harness.render(props)
    button(tree, 'Aplicar paquete especial').props.onClick()
    assert.deepEqual(helpers.presentationSnapshot(chosen), {
      ...saved,
      presentation_label: 'Diez nuevos',
    })
    const catalogButton = nodes(tree).find(
      (node) => node.type === 'button' && text(node).includes('Set de 8')
    )
    catalogButton.props.onClick()
    tree = harness.render({ ...props, selected: chosen })
    assert.equal(chosen, catalog[0])
    assert.equal(button(tree, 'Paquete especial').props['aria-pressed'], false)
    assert.equal(input(tree, 'Nombre'), undefined)
  })

test('special pack application uses ten units times pack quantity and preserves incomplete designs as a warning', () => {
  const snapshot = helpers.buildSpecialPresentation({
    label: 'Diez',
    units: 10,
    price: 1450,
  }).snapshot
  const item = {
    ...snapshot,
    quantity: 2,
    designs: [{ design_name: 'Pikachu', quantity: 4 }],
  }
  assert.equal(
    helpers.selectionTotals(
      item.quantity,
      item.units_per_presentation,
      item.designs
    ).remaining,
    16
  )
  assert.deepEqual(helpers.orderItemOptions(item), {
    presentation_id: null,
    presentation_label: 'Diez',
    units_per_presentation: 10,
    designs: item.designs,
  })
  assert.equal(helpers.configuredOrderTotal(item), 2900)
})

for (const [field, label, value] of [
  ['units', 'Unidades', ''],
  ['units', 'Unidades', '0'],
  ['units', 'Unidades', '1.5'],
  ['price', 'Precio del paquete', ''],
  ['price', 'Precio del paquete', '-1'],
])
  test(`selector blocks invalid ${field} ${value} with an inline Spanish error`, async () => {
    const harness = await selectorHarness()
    let applied = false
    const props = {
      admin: true,
      presentations: catalog,
      selected: { id: null, label: 'Diez', units: 10, price: 1450 },
      onChange() {
        applied = true
      },
    }
    let tree = harness.render(props)
    input(tree, label).props.onChange({ target: { value } })
    tree = harness.render(props)
    button(tree, 'Aplicar paquete especial').props.onClick()
    tree = harness.render(props)
    assert.equal(applied, false)
    assert.equal(input(tree, label).props['aria-invalid'], true)
    assert.match(
      text(nodes(tree).find((node) => node.props?.role === 'alert')),
      field === 'units' ? /unidades.*entero/ : /precio.*0/
    )
  })

test('new special selector draft follows units until the user edits its name', async () => {
  const harness = await selectorHarness()
  const props = {
    admin: true,
    presentations: catalog,
    selected: catalog[0],
    onChange() {},
  }
  button(harness.render(props), 'Paquete especial').props.onClick()
  let tree = harness.render(props)
  assert.equal(input(tree, 'Nombre').props.value, 'Paquete especial de 8')
  input(tree, 'Unidades').props.onChange({ target: { value: '10' } })
  tree = harness.render(props)
  assert.equal(input(tree, 'Nombre').props.value, 'Paquete especial de 10')
  input(tree, 'Nombre').props.onChange({ target: { value: 'Cumpleaños' } })
  tree = harness.render(props)
  input(tree, 'Unidades').props.onChange({ target: { value: '12' } })
  tree = harness.render(props)
  assert.equal(input(tree, 'Nombre').props.value, 'Cumpleaños')
})

async function loadComponent(file, imports) {
  const source = await readFile(
    new URL(`../src/components/${file}.jsx`, import.meta.url),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => imports[name] || require(name),
    module,
    module.exports
  )
  return module.exports.default
}

test('order-only adapter exposes special packs for legacy products and forwards applied snapshot without changing packs/designs', async () => {
  const Selector = () => null
  const Picker = () => null
  const Options = await loadComponent('OrderItemOptions', {
    './ProductPresentationSelector': { __esModule: true, default: Selector },
    './ProductDesignPicker': { __esModule: true, default: Picker },
    '../utils/getImageUrl': { getImageUrl: (value) => value },
    '../utils/productPresentations': helpers,
  })
  let changes
  const designs = [{ design_name: 'Pikachu', quantity: 4 }]
  const item = { product_id: 'p', quantity: 2, unit_price: 135, designs }
  const product = { id: 'p', designs: [{ id: 'pika', name: 'Pikachu' }] }
  let tree = Options({
    item,
    product,
    onChange(value) {
      changes = value
    },
  })
  const selector = nodes(tree).find((node) => node.type === Selector)
  assert.equal(selector.props.admin, true)
  selector.props.onChange({ id: null, label: 'Diez', units: 10, price: 1450 })
  assert.deepEqual(changes, { ...saved, presentation_label: 'Diez' })
  const applied = { ...item, ...changes }
  tree = Options({ item: applied, product, onChange() {} })
  const picker = nodes(tree).find((node) => node.type === Picker)
  assert.equal(picker.props.units, 10)
  assert.equal(picker.props.packs, 2)
  assert.equal(picker.props.selections, designs)
  assert.equal(picker.props.admin, true)
  assert.equal(
    helpers.selectionTotals(
      picker.props.packs,
      picker.props.units,
      picker.props.selections
    ).remaining,
    16
  )
})

test('special packs keep the admin incomplete-design warning without a blocking control', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')
  const photos = await import('../src/utils/productDesignPhotos.js')
  const Picker = await loadComponent('ProductDesignPicker', {
    '../utils/productPresentations.js': helpers,
    '../utils/productDesignPhotos.js': photos,
  })
  const html = renderToStaticMarkup(
    createElement(Picker, {
      designs: [{ id: 'pika', name: 'Pikachu' }],
      selections: [{ design_name: 'Pikachu', quantity: 4 }],
      packs: 2,
      units: 10,
      admin: true,
      onChange() {},
    })
  )
  assert.match(html, /Faltan 16 por elegir/)
  assert.doesNotMatch(html, /required=/)
})
