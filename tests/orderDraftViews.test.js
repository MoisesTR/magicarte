import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
const require = createRequire(import.meta.url)

test('draft notice provides Spanish accessible loading, completion/original and nonblocking error states', async () => {
  const source = await readFile('src/components/ThreadOrderDraftNotice.jsx', 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  const render = status => renderToStaticMarkup(createElement(module.exports.default, { draft: { status, error: 'Puede continuar manualmente.', restoreOriginal() {} } }))
  assert.match(render('loading'), /Completando con IA…/)
  assert.match(render('loading'), /role="status"/)
  assert.match(render('completed'), /Pedido completado con IA — revise antes de guardar/)
  assert.match(render('completed'), /Usar versión original/)
  assert.match(render('completed'), /type="button"/)
  assert.match(render('error'), /Puede continuar manualmente/)
  assert.equal(render('idle'), '')
})

test('all thread-import form paths wire the shared draft and keep personalization visible/persisted', async () => {
  for (const file of ['src/pages/Orders.jsx', 'src/pages/hikari/Orders.jsx', 'src/components/QuickEngravingForm.jsx']) {
    const source = await readFile(file, 'utf8')
    assert.match(source, /useThreadOrderDraft/)
    assert.match(source, /ThreadOrderDraftNotice/)
    assert.match(source, /catalogBusinessId/)
    assert.match(source, /product_description/)
  }
  assert.match(await readFile('src/pages/joyeria/Orders.jsx', 'utf8'), /initialThread=/)
  const hikari = await readFile('src/pages/hikari/Orders.jsx', 'utf8')
  assert.match(hikari, /product_description: it.product_description/)
})

test('lightweight imported delivery fields expose editable shipping facts with touch/dark-compatible classes', async () => {
  const source = await readFile('src/components/ThreadOrderDeliveryFields.jsx', 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  const changes = []
  const props = { form: { delivery_method: 'delivery', delivery_address: 'Cargotrans a Estelí', recipient_name: 'Alma Medina', estimated_delivery_date: '2026-11-25' }, onChange: value => changes.push(value) }
  const html = renderToStaticMarkup(createElement(module.exports.default, props))
  for (const text of ['Entrega acordada por WhatsApp', 'Cargotrans a Estelí', 'Alma Medina', '2026-11-25', 'min-h-10', 'min-w-0', 'bg-gray-50', 'text-gray-700']) assert.ok(html.includes(text), text)
  const tree = module.exports.default(props)
  const findControl = (node, predicate) => {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) return node.map(child => findControl(child, predicate)).find(Boolean)
    return predicate(node) ? node : findControl(node.props?.children, predicate)
  }
  findControl(tree, node => node.type === 'textarea').props.onChange({ target: { value: 'Encomienda a León' } })
  assert.deepEqual(changes, [{ delivery_address: 'Encomienda a León' }])
})
