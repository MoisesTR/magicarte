import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import * as feed from '../src/utils/whatsappFeed.js'
const require = createRequire(import.meta.url)
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]

async function editor() {
  const source = await readFile('src/components/whatsapp/ThreadEditor.jsx', 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const slots = [], saved = [], module = { exports: {} }
  let cursor = 0
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], update => { slots[i] = typeof update === 'function' ? update(slots[i]) : update }] },
    useRef(current) { const i = cursor++; if (!(i in slots)) slots[i] = { current }; return slots[i] },
    useEffect() {},
  }
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react
    if (name.endsWith('/whatsappFeed')) return feed
    if (name === 'react-hot-toast') return { __esModule: true, default: { error(message) { assert.fail(message) } } }
    if (name.includes('/utils/') || name.includes('/data/')) return {}
    return require(name)
  }, module, module.exports)
  const render = () => { cursor = 0; return module.exports.default({ thread: { customer_name: 'Ana', summary: 'Vitral' }, businessId: 2, onSave: async payload => { saved.push(payload) } }) }
  const button = text => nodes(render()).find(node => node.type === 'button' && node.props.children === text)
  const field = text => {
    const label = nodes(render()).find(node => node.type === 'label' && Array.isArray(node.props.children) && node.props.children[0] === text)
    return nodes(label).find(node => node.type === 'input')
  }
  return { render, saved, button, field }
}

test('real editor starts collapsed, adds/removes lines, blocks invalid rows inline and saves normalized details', async () => {
  const h = await editor()
  const details = nodes(h.render()).find(node => node.type === 'details' && nodes(node).some(child => child.type === 'summary' && child.props.children === 'Detalle del pedido'))
  assert.equal(details.props.open, undefined)
  h.button('Agregar línea').props.onClick()
  await nodes(h.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(h.saved.length, 0)
  assert.equal(h.field('Nombre').props['aria-invalid'], true)
  assert.ok(nodes(h.render()).some(node => node.props?.role === 'alert'))
  for (const [name, value] of [['Nombre', '  Vitral  '], ['Cantidad', '18'], ['Precio c/u (C$)', '0'], ['Detalle (grabado, diseño o personalización)', ' Feliz Navidad '], ['Dirección de entrega', ' Estelí '], ['Quién recibe', ' Alma '], ['Teléfono de quien recibe', '+505 8888-7777']]) h.field(name).props.onChange({ target: { value } })
  await nodes(h.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.deepEqual(h.saved[0].order_lines, [{ name: 'Vitral', quantity: 18, unit_price: 0, detail: 'Feliz Navidad' }])
  assert.equal(h.saved[0].delivery_address, 'Estelí')
  assert.equal(h.saved[0].recipient_name, 'Alma')
  h.button('Quitar línea').props.onClick()
  assert.equal(h.button('Quitar línea'), undefined)
})
