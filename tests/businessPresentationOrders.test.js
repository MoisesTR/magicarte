import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import * as helpers from '../src/utils/productPresentations.js'
const require = createRequire(import.meta.url)
async function engravingFormWithClient(calls) {
  const source = await readFile(
    new URL('../src/components/QuickEngravingForm.jsx', import.meta.url),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  })
  const module = { exports: {} }
  const mutation =
    (name) =>
    async (...args) => {
      calls.push([name, ...args])
      return name === 'createOrder'
        ? { data: [{ id: 'new-order' }], error: null }
        : { error: null }
    }
  const imports = {
    react: {
      useState: (initial) => [
        typeof initial === 'function' ? initial() : initial,
        () => {},
      ],
      useEffect() {},
    },
    'react-hot-toast': {
      __esModule: true,
      default: {
        error: (message) => calls.push(['error', message]),
        success: () => {},
      },
    },
    '../data/orders': Object.fromEntries(
      [
        'createOrder',
        'updateOrder',
        'deleteOrderItems',
        'insertOrderItems',
        'fetchOrderProducts',
      ].map((name) => [name, mutation(name)])
    ),
    '../data/payments': {
      addPayment: mutation('addPayment'),
      updatePayment: mutation('updatePayment'),
    },
    '../utils/constants': { ENGRAVING_MATERIALS: ['Acero inoxidable'] },
    '../utils/productPresentations': helpers,
    './OrderItemOptions': { __esModule: true, default: () => null },
  }
  new Function('require', 'module', 'exports', code)(
    (name) => imports[name] || require(name),
    module,
    module.exports
  )
  return module.exports.default
}
async function submit(Form, props) {
  const tree = Form(props)
  tree.props.children.props.onSubmit({ preventDefault() {} })
  await new Promise((resolve) => setImmediate(resolve))
}
test('Joyería save retains primary and additional presentation/design snapshots with business ownership', async () => {
  const calls = []
  const Form = await engravingFormWithClient(calls)
  const design = {
    id: 'child',
    order_item_id: 'old',
    design_id: null,
    design_name: 'Muñeco',
    quantity: 1,
    note: 'Ana',
  }
  const item = {
    id: 'old',
    order_id: 'order',
    product_id: 'p',
    product_name: 'Esferas',
    product_description: 'Nota',
    quantity: 2,
    unit_price: 690,
    subtotal: 1380,
    presentation_id: 'same',
    presentation_label: 'Paquete antiguo',
    units_per_presentation: 6,
    order_item_designs: [design],
    material: 'Acero inoxidable',
  }
  const extra = {
    ...item,
    id: 'extra',
    product_name: 'Segundo',
    quantity: 1,
    unit_price: 135,
    subtotal: 135,
    order_item_designs: [{ ...design, design_name: 'Árbol' }],
  }
  await submit(Form, {
    businessId: 3,
    editingOrder: {
      id: 'order',
      customer_name: 'Ana',
      total_amount: 1515,
      order_items: [item, extra],
      order_payments: [],
    },
  })
  assert.equal(
    calls.find(([name]) => name === 'error'),
    undefined
  )
  const [, rows, business] = calls.find(([name]) => name === 'insertOrderItems')
  assert.equal(business, 3)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].product_id, 'p')
  assert.equal(rows[0].presentation_label, 'Paquete antiguo')
  assert.equal(rows[0].units_per_presentation, 6)
  assert.equal(rows[0].unit_price, 690)
  assert.equal(rows[0].quantity, 2)
  assert.equal(rows[0].designs[0].note, 'Ana')
  assert.equal(rows[1].designs[0].design_name, 'Árbol')
  assert.equal(rows[1].id, undefined)
  assert.equal(
    rows.reduce((sum, row) => sum + row.subtotal, 0),
    1515
  )
})
test('Joyería legacy jobs keep original one-line payload without new optional columns', async () => {
  const calls = []
  const Form = await engravingFormWithClient(calls)
  await submit(Form, {
    businessId: 3,
    editingOrder: {
      id: 'order',
      customer_name: 'Ana',
      total_amount: 300,
      order_items: [{ product_description: 'Anillo', material: 'Plata' }],
      order_payments: [],
    },
  })
  const [, rows] = calls.find(([name]) => name === 'insertOrderItems')
  assert.deepEqual(rows, [
    {
      order_id: 'order',
      product_id: null,
      product_name: 'Ana',
      product_description: 'Anillo',
      quantity: 1,
      unit_price: 300,
      hours_needed: null,
      rush_fee: 0,
      subtotal: 300,
      material: 'Plata',
      engraving_minutes: null,
    },
  ])
})

function findElement(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findElement(child, predicate)
      if (found) return found
    }
    return null
  }
  if (predicate(tree)) return tree
  return findElement(tree.props?.children, predicate)
}
for (const presentationId of ['same', null, 'deleted']) test(`Hikari open-edit-save preserves pack ${presentationId}, incomplete designs and ownership`, async () => {
  const calls = []
  const item = {
    id: 'item',
    product_id: 'p',
    product_name: 'Esferas',
    quantity: 2,
    unit_price: 690,
    subtotal: 1380,
    presentation_id: presentationId,
    presentation_label: 'Paquete antiguo',
    units_per_presentation: 6,
    order_item_designs: [
      { design_id: null, design_name: 'Pikachu', quantity: 2, note: 'Ana' },
    ],
  }
  const order = {
    id: 'order',
    customer_name: 'Ana',
    order_date: '2026-11-19',
    status: 'pending',
    total_amount: 1380,
    order_items: [item],
  }
  const products = [
    {
      id: 'p',
      name: 'Esferas',
      price: 400,
      presentations: [
        { id: 'same', label: 'Nuevo pack', units: 3, price: 400 },
      ],
      designs: [],
    },
  ]
  const states = [{ id: 'user' }, false, [order], products, false, false, null]
  let cursor = 0
  const react = {
    useEffect() {},
    useMemo: (fn) => fn(),
    useState(initial) {
      const key = cursor++
      if (!(key in states))
        states[key] = typeof initial === 'function' ? initial() : initial
      return [
        states[key],
        (next) => {
          states[key] = typeof next === 'function' ? next(states[key]) : next
        },
      ]
    },
  }
  const mutation =
    (name) =>
    async (...args) => {
      calls.push([name, ...args])
      return name === 'fetchOrdersForBusiness'
        ? { data: [], error: null }
        : { error: null }
    }
  const source = await readFile(
    new URL('../src/pages/hikari/Orders.jsx', import.meta.url),
    'utf8'
  )
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  })
  const module = { exports: {} }
  const imports = {
    '../../hooks/useOrderDeepLink': { __esModule: true, default() {} },
    react,
    'react-hot-toast': {
      __esModule: true,
      default: {
        error: (message) => calls.push(['error', message]),
        success() {},
      },
    },
    '../../utils/productPresentations': helpers,
    '../../components/AdminLogin': { __esModule: true, default: () => null },
    '../../components/OrderItemOptions': {
      __esModule: true,
      default: () => null,
    },
    '../../context/BusinessContext': {
      useBusiness: () => ({
        currentBusinessId: 2,
        currentBusiness: { name: 'Hikari' },
      }),
    },
    '../../config/supabaseClient': {},
    '../../data/orders': Object.fromEntries(
      [
        'fetchOrdersForBusiness',
        'fetchOrderProducts',
        'createOrder',
        'updateOrder',
        'deleteOrder',
        'deleteOrderItems',
        'insertOrderItems',
      ].map((name) => [name, mutation(name)])
    ),
    '../../data/payments': {
      addPayment: mutation('addPayment'),
      deletePayment: mutation('deletePayment'),
    },
  }
  new Function('require', 'module', 'exports', code)(
    (name) => imports[name] || require(name),
    module,
    module.exports
  )
  const Page = module.exports.default
  const first = Page()
  findElement(
    first,
    (node) => node.type === 'button' && node.props.title === 'Editar'
  ).props.onClick()
  cursor = 0
  const edited = Page()
  await findElement(edited, (node) => node.type === 'form').props.onSubmit({
    preventDefault() {},
  })
  assert.equal(
    calls.find(([name]) => name === 'error'),
    undefined
  )
  const [, rows, business] = calls.find(([name]) => name === 'insertOrderItems')
  assert.equal(business, 2)
  assert.equal(rows[0].product_id, 'p')
  assert.equal(rows[0].presentation_id, presentationId)
  assert.equal(rows[0].presentation_label, 'Paquete antiguo')
  assert.equal(rows[0].units_per_presentation, 6)
  assert.equal(rows[0].unit_price, 690)
  assert.equal(rows[0].designs[0].design_name, 'Pikachu')
  assert.equal(rows[0].designs[0].note, 'Ana')
})
