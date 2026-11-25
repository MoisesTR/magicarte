import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const read = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
async function loadComponent(file, stubs = {}) {
  const { code } = await transform(await read(`components/${file}.jsx`), { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => stubs[id] || require(id), module, module.exports)
  return module.exports.default
}
async function profitLine(order, quotesByProductId = {}) {
  const utils = await import('../src/utils/orderProfit.js')
  const Line = await loadComponent('OrderProfitLine', { '../utils/orderProfit.js': utils })
  return renderToStaticMarkup(React.createElement(Line, { order, quotesByProductId }))
}
test('profit line renders known profit, approximation and missing costs in Spanish', async () => {
  const html = await profitLine({ order_items: [
    { product_id: 'a', quantity: 1, unit_price: 3640 },
    { product_name: 'Manual', quantity: 1, unit_price: 500 },
    { product_name: 'Otro', quantity: 1, unit_price: 200 },
  ] }, { a: { summary: { unitCost: 1000 } } })
  assert.match(html, /Ganancia estimada: ~C\$2,640 \(73%\) · Costo ~C\$1,000/)
  assert.match(html, /2 productos sin costo/)
  assert.match(html, /title="Estimado con el costo por pieza de la cotización"/)
  assert.match(html, /text-xs/)
  assert.match(html, /break-words/)
})
test('uncosted and exact profit lines have distinct states', async () => {
  const empty = await profitLine({ order_items: [{ quantity: 1, unit_price: 100 }] })
  assert.match(empty, /Ganancia estimada: sin costo vinculado/)
  assert.match(empty, /Vincule una cotización en el producto/)
  const exact = await profitLine({ order_items: [{ product_id: 'a', quantity: 1, unit_price: 100 }] }, { a: { summary: { costModel: { fixedPerOrder: 10, variablePerPiece: 20 } } } })
  assert.match(exact, /Ganancia estimada: C\$70 \(70%\) · Costo C\$30/)
  assert.doesNotMatch(exact, /~|title=/)
})
test('product cost field shows unlink, searchable quote labels, date and model hint', async () => {
  const Field = await loadComponent('ProductCostQuoteField', { '../utils/orderProfit.js': await import('../src/utils/orderProfit.js'), '../data/calcQuotes': { fetchCostQuotes() { throw Error('No network in render tests') } } })
  const quote = { id: 'q', name: 'Esfera', updated_at: '2026-11-20T12:00:00Z', summary: { unitCost: 66, costModel: { fixedPerOrder: 95, variablePerPiece: 57.7 } } }
  const html = renderToStaticMarkup(React.createElement(Field, { businessId: 'b', value: 'q', initialQuote: quote, onChange() {} }))
  assert.match(html, /Cotización de costo/)
  assert.match(html, /Sin cotización/)
  assert.match(html, /type="search"/)
  assert.match(html, /Esfera · 20\/11\/2026 · C\$66 por pieza/)
  assert.match(html, /Se usa para estimar la ganancia de los pedidos\./)
  assert.match(html, /Costo fijo C\$95 por pedido \+ C\$57.70 por pieza/)
  const legacy = renderToStaticMarkup(React.createElement(Field, { businessId: 'b', value: 'q', initialQuote: { ...quote, summary: { unitCost: 66 } }, onChange() {} }))
  assert.match(legacy, /C\$66 por pieza \(aprox\.\)/)
})
test('Admin saves selected link including null without overriding unlink from a source quote', async () => {
  const admin = await read('pages/Admin.jsx')
  assert.match(admin, /<ProductCostQuoteField/)
  assert.match(admin, /currentBusiness.slug === 'magicarte'[\s\S]{0,80}<ProductCostQuoteField/)
  assert.match(admin, /value=\{formData.calc_quote_id\}/)
  assert.match(admin, /calc_quote_id: product.calc_quote_id \|\| null/)
  assert.match(admin, /calc_quote_id: formData.calc_quote_id \|\| null/)
  assert.doesNotMatch(admin, /if \(sourceQuote\) productData.calc_quote_id = sourceQuote.id/)
})
test('profit appears only in list cards and editor totals, never board or external output', async () => {
  const orders = await read('pages/Orders.jsx')
  const boardStart = orders.indexOf('/* Kanban Board */')
  const listStart = orders.indexOf("<div className='space-y-4'>", boardStart)
  const modalStart = orders.indexOf("<div className='admin-modal-backdrop'>", listStart)
  assert.ok(boardStart > 0 && listStart > boardStart && modalStart > listStart)
  assert.doesNotMatch(orders.slice(boardStart, listStart), /OrderProfitLine|Ganancia estimada/)
  assert.match(orders.slice(listStart, modalStart), /<OrderProfitLine order=\{order\}/)
  assert.match(orders.slice(modalStart), /<OrderProfitLine order=\{\{ order_items: formData.items \}\}/)
  assert.equal((orders.match(/<OrderProfitLine/g) || []).length, 2)
  assert.doesNotMatch(orders.slice(0, boardStart), /Ganancia estimada|<OrderProfitLine/)
})
