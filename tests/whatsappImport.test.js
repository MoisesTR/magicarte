import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import { threadOrderPrefill } from '../src/utils/whatsappFeed.js'
const require = createRequire(import.meta.url),
  flush = () => new Promise((r) => setImmediate(r))
async function hook({
  enabled = true,
  businessId = 2,
  result = {
    data: {
      id: 't',
      business_id: 2,
      status: 'to_quote',
      summary: 'Un letrero',
      quoted_amount: 300,
    },
  },
  update = { data: { id: 't' } },
} = {}) {
  const effects = [],
    imports = [],
    writes = [],
    navigations = [],
    errors = []
  let state = null
  const source = await readFile(
      new URL('../src/hooks/useThreadOrderImport.js', import.meta.url),
      'utf8'
    ),
    { code } = await transform(source, { format: 'cjs' })
  const module = { exports: {} },
    deps = {
      react: {
        useState: () => [
          state,
          (value) => {
            state = value
          },
        ],
        useRef: (v) => ({ current: v }),
        useEffect: (fn) => effects.push(fn),
      },
      'react-router-dom': {
        useLocation: () => ({
          pathname: '/admin/hikari/orders',
          search: '?fromThread=t&keep=yes',
          hash: '#form',
        }),
        useNavigate:
          () =>
          (...args) =>
            navigations.push(args),
      },
      'react-hot-toast': {
        __esModule: true,
        default: { error: (m) => errors.push(m), success: () => {} },
      },
      '../utils/whatsappFeed': { threadOrderPrefill },
      '../data/whatsappThreads': {
        fetchWhatsAppThread: async () => result,
        completeThreadConversion: async (...args) => {
          writes.push(args)
          if (typeof update === 'function') return update()
          return update
        },
      },
    }
  new Function('require', 'module', 'exports', code)(
    (name) => deps[name] || require(name),
    module,
    module.exports
  )
  const api = module.exports.default(
    (value) => imports.push(value),
    businessId,
    enabled
  )
  const cleanups = effects.map((f) => f())
  await flush()
  return {
    api,
    imports,
    writes,
    navigations,
    errors,
    cleanup: () => cleanups.forEach((f) => f?.()),
  }
}
test('fromThread opens a prefilled form once authenticated, consuming only its parameter', async () => {
  const h = await hook()
  assert.equal(h.imports.length, 1)
  assert.equal(h.imports[0].items[0].unit_price, 300)
  assert.equal(h.writes.length, 0)
  assert.equal(h.navigations[0][0].search, 'keep=yes')
  await h.api.completeConversion('order')
  assert.deepEqual(h.writes, [['t', 'order', 2]])
})
test('thread is not marked won before save, on cancellation, or without authentication', async () => {
  const h = await hook()
  h.api.clearImport()
  await h.api.completeConversion('order')
  assert.equal(h.writes.length, 0)
  for (const options of [{ enabled: false }, { businessId: null }]) {
    const h = await hook(options)
    assert.equal(h.imports.length, 0)
    assert.equal(h.writes.length, 0)
  }
})
test('business mismatches, closed rows and read errors fail closed', async () => {
  for (const result of [
    { data: { id: 't', business_id: 3, status: 'to_quote' } },
    { data: { id: 't', business_id: 2, status: 'won' } },
    { error: Error('failed') },
  ]) {
    const h = await hook({ result })
    assert.equal(h.imports.length, 0)
    assert.equal(h.errors.length, 1)
  }
})
test('failed completion is surfaced separately after order save without creating another order', async () => {
  const h = await hook({ update: { error: Error('denied') } })
  const result = await h.api.completeConversion('order')
  assert.equal(result, false)
  assert.equal(h.writes.length, 1)
  assert.match(h.errors[0], /pedido.*guard|guard.*pedido/i)
})
test('all three Orders forms connect import and post-item-save completion', async () => {
  for (const file of [
    'src/pages/Orders.jsx',
    'src/pages/hikari/Orders.jsx',
    'src/pages/joyeria/Orders.jsx',
  ]) {
    const text = await readFile(file, 'utf8')
    assert.match(text, /useThreadOrderImport/)
    assert.match(text, /ThreadConversionNotice/)
  }
  for (const file of [
    'src/pages/Orders.jsx',
    'src/pages/hikari/Orders.jsx',
    'src/components/QuickEngravingForm.jsx',
  ]) {
    const text = await readFile(file, 'utf8')
    assert.ok(
      text.indexOf('completeConversion(orderId)') >
        text.indexOf('insertOrderItems(')
    )
  }
})

test('a thrown completion/network error never re-enters order creation', async () => {
  const h = await hook({
    update: () => {
      throw Error('network')
    },
  })
  assert.equal(await h.api.completeConversion('order'), false)
  assert.equal(h.writes.length, 1)
  assert.match(h.errors[0], /pedido.*guard|guard.*pedido/i)
})
