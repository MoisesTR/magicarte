import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import * as helpers from '../src/utils/productPresentations.js'
import * as clientLink from '../src/utils/orderClientLink.js'
import * as finance from '../src/utils/finance.js'
import * as itemSave from '../src/utils/orderItemsSave.js'
const clients = {
  findClientByNormalizedPhone: async () => ({ data: null, error: null }),
  createClientReturning: async () => ({ data: { id: 'client' }, error: null }),
}
const require = createRequire(import.meta.url)
async function engravingFormWithClient(calls, overrides = {}) {
  let stateSlot = 0
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
      useState: (initial) => {
        const slot = stateSlot++
        const override = slot === 2 ? overrides.description : slot === 3 ? overrides.total : undefined
        return [override === undefined ? (typeof initial === 'function' ? initial() : initial) : override, () => {}]
      },
      useEffect() {},
    },
    'react-hot-toast': {
      __esModule: true,
      default: {
        error: (message) => calls.push(['error', message]),
        success: () => {},
      },
    },
    '../utils/orderClientLink': clientLink,
    '../utils/finance': finance,
    '../utils/orderItemsSave': itemSave,
    '../data/clients': clients,
    '../data/orders': Object.fromEntries(
      [
        'createOrder',
        'updateOrder',
        'deleteOrderItemsByIds',
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
    '../hooks/useThreadOrderDraft': { __esModule: true, default: initial => ({ formData: typeof initial === 'function' ? initial() : initial, setFormData() {}, begin() {}, clear() {}, cancelPending() {}, status: 'idle' }) },
    '../utils/orderDraftFromThread': require('../src/utils/orderDraftFromThread.js'),
    './ThreadOrderDeliveryFields': { __esModule: true, default: () => null },
    './ThreadOrderDraftNotice': { __esModule: true, default: () => null },
    '../config/supabaseClient': {},
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
    product_description: 'Alma Medina',
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
  const states = [{ id: 'user' }, false, [order], products, null, false, false, null]
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
    '../../hooks/useThreadOrderDraft': { __esModule: true, default(initial) { const [formData, setFormData] = react.useState(initial); return { formData, setFormData, begin() {}, clear() {}, cancelPending() {}, status: 'idle' } } },
    '../../utils/orderDraftFromThread': require('../src/utils/orderDraftFromThread.js'),
    '../../components/ThreadOrderDeliveryFields': { __esModule: true, default: () => null },
    '../../components/ThreadOrderDraftNotice': { __esModule: true, default: () => null },
    '../../hooks/useOrderDeepLink': { __esModule: true, default() {} },
    '../../hooks/useThreadOrderImport': { __esModule: true, default: () => ({ clearImport() {}, completeConversion: async () => true }) },
    '../../components/ThreadConversionNotice': { __esModule: true, default: () => null },
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
    '../../utils/orderClientLink': clientLink,
    '../../utils/finance': finance,
    '../../utils/orderItemsSave': itemSave,
    '../../data/clients': clients,
    '../../data/orders': Object.fromEntries(
      [
        'fetchOrdersForBusiness',
        'fetchOrderProducts',
        'createOrder',
        'updateOrder',
        'deleteOrder',
        'deleteOrderItemsByIds',
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
  assert.equal(rows[0].product_description, 'Alma Medina')
  assert.equal(rows[0].product_id, 'p')
  assert.equal(rows[0].presentation_id, presentationId)
  assert.equal(rows[0].presentation_label, 'Paquete antiguo')
  assert.equal(rows[0].units_per_presentation, 6)
  assert.equal(rows[0].unit_price, 690)
  assert.equal(rows[0].designs[0].design_name, 'Pikachu')
  assert.equal(rows[0].designs[0].note, 'Ana')
})

 test('Joyería WhatsApp import creates a pending unpaid custom order and completes only after items', async () => {
  const calls = [], Form = await engravingFormWithClient(calls)
  await submit(Form, {
    businessId: 3,
    initialThreadForm: {customer_name:'Carlos',customer_phone:'82888070',client_id:'client',notes:'Placa\n\nAzul',order_date:'2026-11-19',items:[{product_name:'Placa personalizada',product_description:'Placa personalizada',unit_price:450}]},
    threadConversion: {completeConversion: async id => { calls.push(['completeConversion',id]); return true }},
  })
  assert.equal(calls.find(([name]) => name === 'error'), undefined)
  const [,order,business] = calls.find(([name]) => name === 'createOrder')
  assert.equal(business,3); assert.equal(order.status,'pending'); assert.equal(order.payment_status,'unpaid'); assert.equal(order.completed_at,null)
  assert.equal(order.customer_name,'Carlos'); assert.equal(order.customer_phone,'82888070'); assert.equal(order.client_id,'client'); assert.equal(order.notes,'Placa\n\nAzul')
  assert.equal(calls.some(([name]) => name === 'addPayment'),false)
  const [,items] = calls.find(([name]) => name === 'insertOrderItems')
  assert.equal(items[0].product_name,'Placa personalizada'); assert.equal(items[0].product_id,null); assert.equal(items[0].unit_price,450)
  assert.ok(calls.findIndex(([name]) => name === 'completeConversion') > calls.findIndex(([name]) => name === 'insertOrderItems'))
 })

const convertedEngravingOrder = (fields = {}) => ({
  id: 'converted-order',
  customer_name: 'Carlos',
  customer_phone: '82888070',
  client_id: 'client',
  notes: 'Placa\n\nAzul',
  order_date: '2026-11-19',
  status: 'pending',
  payment_status: 'unpaid',
  completed_at: null,
  total_amount: 450,
  order_items: [{
    product_id: null,
    product_name: 'Placa personalizada',
    product_description: 'Placa personalizada',
    quantity: 1,
    unit_price: 450,
    subtotal: 450,
    material: 'Acero inoxidable',
  }],
  order_payments: [],
  ...fields,
})

test('reopening an unpaid pending WhatsApp order never invents a payment', async () => {
  const calls = [], Form = await engravingFormWithClient(calls)
  await submit(Form, { businessId: 3, editingOrder: convertedEngravingOrder() })
  assert.equal(calls.some(([name]) => name === 'error'), false)
  assert.equal(calls.some(([name]) => ['addPayment', 'updatePayment'].includes(name)), false)
  const [, id, patch] = calls.find(([name]) => name === 'updateOrder')
  assert.equal(id, 'converted-order')
  assert.equal(patch.status, undefined)
  assert.equal(patch.payment_status, undefined)
  assert.equal(patch.completed_at, undefined)
  assert.equal(patch.total_amount, 450)
  assert.equal(calls.some(([name]) => name === 'createOrder'), false)
})

test('reopening a converted custom order preserves its product name separately from the customer', async () => {
  const calls = [], Form = await engravingFormWithClient(calls)
  await submit(Form, { businessId: 3, editingOrder: convertedEngravingOrder() })
  const [, rows] = calls.find(([name]) => name === 'insertOrderItems')
  assert.equal(rows[0].product_name, 'Placa personalizada')
  assert.equal(rows[0].product_description, 'Placa personalizada')
  assert.equal(rows[0].product_id, null)
  assert.equal(rows[0].unit_price, 450)
})

test('editing a partially paid imported order preserves the existing actual receipt', async () => {
  const calls = [], Form = await engravingFormWithClient(calls)
  await submit(Form, { businessId: 3, editingOrder: convertedEngravingOrder({
    status: 'in_progress', payment_status: 'partial',
    order_payments: [{ id: 'deposit', amount: 100, method: 'transferencia', paid_at: '2026-11-19' }],
  }) })
  assert.equal(calls.some(([name]) => ['addPayment', 'updatePayment'].includes(name)), false)
})

test('legacy quick-job creation still records a completed paid job and its receipt', async () => {
  const calls = []
  // The harness keeps all actual form logic and supplies a filled legacy total.
  const Form = await engravingFormWithClient(calls, { total: '450', description: 'Grabado' })
  await submit(Form, { businessId: 3 })
  const [, order] = calls.find(([name]) => name === 'createOrder')
  assert.equal(order.status, 'completed')
  assert.equal(order.payment_status, 'paid')
  assert.ok(order.completed_at)
  assert.equal(calls.find(([name]) => name === 'addPayment')[1].amount, 450)
})

test('Joyería imported drafts preserve quantity/unit price, additional personalization and deposit notes without recording payment', async () => {
  const calls = []
  const Form = await engravingFormWithClient(calls)
  await submit(Form, {
    businessId: 3,
    initialThreadForm: {
      customer_name: 'Alma', customer_phone: '84216792', order_date: '2026-11-20', notes: 'Anticipo recibido por WhatsApp: C$2700 (verificar comprobante)',
      items: [
        { product_id: null, product_name: 'Vitral', product_description: 'Alma Medina', quantity: 17, unit_price: 300 },
        { product_id: 'vitral', product_name: 'Vitral', product_description: 'Angelo Moreno', quantity: 1, unit_price: 300, _key: 'local-only' },
      ],
    },
  })
  const [, rows] = calls.find(([name]) => name === 'insertOrderItems')
  assert.equal(rows[0].quantity, 17)
  assert.equal(rows[0].unit_price, 300)
  assert.equal(rows[1].product_description, 'Angelo Moreno')
  assert.equal(rows[1]._key, undefined)
  assert.equal(calls.find(([name]) => name === 'createOrder')[1].total_amount, 5400)
  assert.match(calls.find(([name]) => name === 'createOrder')[1].notes, /Anticipo recibido/)
  assert.equal(calls.some(([name]) => name === 'addPayment'), false)
})

test('Joyería imported shipping facts remain in the create payload', async () => {
  const calls = [], Form = await engravingFormWithClient(calls)
  await submit(Form, { businessId: 3, initialThreadForm: {
    customer_name: 'Cliente', customer_phone: '84216792', order_date: '2026-11-20', notes: '',
    delivery_method: 'delivery', delivery_address: 'Cargotrans a Estelí', recipient_name: 'Alma Medina', estimated_delivery_date: '2026-11-25', delivery_fee: 100,
    items: [{ product_id: null, product_name: 'Vitral', product_description: 'Alma Medina', quantity: 18, unit_price: 300 }],
  } })
  const saved = calls.find(([name]) => name === 'createOrder')[1]
  assert.equal(saved.delivery_method, 'delivery')
  assert.equal(saved.delivery_address, 'Cargotrans a Estelí')
  assert.equal(saved.recipient_name, 'Alma Medina')
  assert.equal(saved.estimated_delivery_date, '2026-11-25')
  assert.equal(saved.delivery_fee, 100)
})
