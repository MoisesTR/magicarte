import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const ordersSource = () => readFile(new URL('../src/pages/Orders.jsx', import.meta.url), 'utf8')

async function component(source) {
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  return module.exports.default
}

const panelComponent = async () => component(await readFile(new URL('../src/components/PiecesToProducePanel.jsx', import.meta.url), 'utf8'))

async function panel(summary, props = {}) {
  const Panel = await panelComponent()
  return renderToStaticMarkup(React.createElement(Panel, { summary, ...props }))
}

function findButtons(node, found = []) {
  if (Array.isArray(node)) node.forEach(child => findButtons(child, found))
  else if (node && typeof node === 'object' && node.props) {
    if (node.type === 'button') found.push(node)
    findButtons(node.props.children, found)
  }
  return found
}

test('production toggle and panel are only in the board branch and summarize the same filtered orders', async () => {
  const source = await ordersSource()
  const start = source.indexOf('/* Kanban Board */')
  const end = source.indexOf("<div className='space-y-4'>", start)
  const board = source.slice(start, end)
  assert.match(source.slice(start - 70, start), /viewMode === 'board'/)
  assert.equal(source.split('Piezas por producir').length - 1, 1)
  assert.match(board, /Piezas por producir/)
  assert.match(board, /productionSummary\.totalPieces/)
  assert.match(board, /aria-expanded=\{showPiecesToProduce\}/)
  assert.match(board, /aria-controls='pieces-to-produce-panel'/)
  assert.match(board, /showPiecesToProduce && <PiecesToProducePanel summary=\{productionSummary\}/)
  assert.match(source, /summarizePiecesToProduce\(filteredOrders\)/)
})

test('toggle defaults closed, persists its state, and survives localStorage failures', async () => {
  const source = await ordersSource()
  const initializer = source.match(/const \[showPiecesToProduce, setShowPiecesToProduce\] = useState\(\(\) => \{([\s\S]*?)\n  \}\)/)?.[1]
  assert.ok(initializer, 'guarded lazy state initializer exists')
  const initial = new Function('localStorage', initializer)
  assert.equal(initial({ getItem: () => null }), false)
  assert.equal(initial({ getItem: () => 'true' }), true)
  assert.equal(initial({ getItem: () => 'false' }), false)
  assert.equal(initial({ getItem() { throw new Error('denied') } }), false)
  const toggle = source.match(/const togglePiecesToProduce = \(\) => \{([\s\S]*?)\n  \}/)?.[1]
  assert.ok(toggle)
  for (const open of [false, true]) {
    let state
    const saved = []
    const run = new Function('showPiecesToProduce', 'setShowPiecesToProduce', 'localStorage', 'setSelectedPieceKey', toggle)
    const cleared = []
    run(open, value => { state = value }, { setItem: (...args) => saved.push(args) }, value => cleared.push(value))
    assert.equal(state, !open)
    assert.deepEqual(saved, [['ordersPiecesToProduceOpen', String(!open)]])
    assert.deepEqual(cleared, open ? [null] : [], 'closing the panel clears the board product filter')
    assert.doesNotThrow(() => run(open, value => { state = value }, { setItem() { throw new Error('denied') } }, () => {}))
    assert.equal(state, !open)
  }
})

test('panel renders compact wrapping rows, unlinked marker, order numbers and totals in Spanish', async () => {
  const html = await panel({ rows: [
    { key: 'product:sphere', name: 'Esfera Pokémon', pieces: 38, orderNumbers: [97, 98, 103], linked: true },
    { key: 'name:manual', name: 'Producto manual', pieces: 2, orderNumbers: [104], linked: false },
  ], totalPieces: 40, orderCount: 4 })
  assert.match(html, /Esfera Pokémon/)
  assert.match(html, /<strong[^>]*>38 piezas<\/strong>/)
  assert.match(html, /#97, #98, #103/)
  assert.equal((html.match(/sin vincular/g) || []).length, 1)
  assert.match(html, /Total: 40 piezas en 4 pedidos/)
  assert.match(html, /id="pieces-to-produce-panel"/)
  assert.match(html, /flex-wrap/)
  assert.match(html, /min-w-0/)
  assert.match(html, /\[overflow-wrap:anywhere\]/)
  assert.doesNotMatch(html, /No hay piezas pendientes/)
})

test('empty panel renders the requested empty state', async () => {
  const html = await panel({ rows: [], totalPieces: 0, orderCount: 0 })
  assert.match(html, /No hay piezas pendientes de producir\./)
  assert.match(html, /Total: 0 piezas en 0 pedidos/)
})

test('board card renders pieces between product count and price only when they differ', async () => {
  const source = await ordersSource()
  assert.match(source, /const orderPieces = \(order\.order_items \|\| \[\]\)\.reduce\(\(sum, item\) => sum \+ piecesForItem\(item\), 0\)/)
  const card = source.match(/<div className='text-xs text-gray-400 mb-2[^']*'>[\s\S]*?<\/div>/)?.[0]
  assert.ok(card)
  const Card = await component(`export default function Card({ order, orderPieces }) { const moneyNIO = () => 'C$3,640'; return (${card}) }`)
  for (const [items, orderPieces, expected] of [[1, 26, true], [1, 1, false], [2, 2, false], [0, 0, false]]) {
    const html = renderToStaticMarkup(React.createElement(Card, { order: { order_items: Array(items).fill({}), total_amount: 3640 }, orderPieces }))
    assert.equal(html.includes('piezas'), expected)
    if (expected) assert.ok(html.indexOf('producto') < html.indexOf('26 piezas') && html.indexOf('26 piezas') < html.indexOf('C$3,640'))
    assert.match(html, /truncate/)
  }
})

test('board cards show the order number next to the client name', async () => {
  const source = await ordersSource()
  const start = source.indexOf('/* Kanban Board */')
  const end = source.indexOf("<div className='space-y-4'>", start)
  const board = source.slice(start, end)
  assert.match(board, /#\{order\.order_number\}[\s\S]{0,200}\{displayName\(order\)\}/)
})

const selectionSummary = { rows: [
  { key: 'product:sphere', name: 'Esfera Pokémon', pieces: 38, orderNumbers: [97, 98], linked: true },
  { key: 'name:manual', name: 'Producto manual', pieces: 2, orderNumbers: [104], linked: false },
], totalPieces: 40, orderCount: 3 }

test('panel rows are full-width touch buttons with aria-pressed reflecting the selection', async () => {
  const html = await panel(selectionSummary, { selectedKey: 'name:manual', onSelect() {} })
  const buttons = html.match(/<button[^>]*>/g) || []
  assert.equal(buttons.length, 2)
  for (const button of buttons) {
    assert.match(button, /type="button"/)
    assert.match(button, /w-full/)
    assert.match(button, /min-h-11/)
  }
  assert.match(buttons[0], /aria-pressed="false"/)
  assert.match(buttons[1], /aria-pressed="true"/)
  assert.match(buttons[1], /bg-green-50/)
  assert.doesNotMatch(buttons[0], /bg-green-50/)
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<(?:p|div)[\s>]/, 'buttons only contain phrasing content')
})

test('tapping a row selects it and tapping the selected row clears the selection', async () => {
  const Panel = await panelComponent()
  const calls = []
  const [first, second] = findButtons(Panel({ summary: selectionSummary, selectedKey: 'product:sphere', onSelect: key => calls.push(key) }))
  first.props.onClick()
  second.props.onClick()
  assert.deepEqual(calls, [null, 'name:manual'])
  assert.doesNotThrow(() => findButtons(Panel({ summary: selectionSummary }))[0].props.onClick())
})

test('board filters every column by the selected product and shows the filter bar and per-card pieces', async () => {
  const source = await ordersSource()
  const start = source.indexOf('/* Kanban Board */')
  const end = source.indexOf("<div className='space-y-4'>", start)
  const board = source.slice(start, end)
  assert.match(source, /const \[selectedPieceKey, setSelectedPieceKey\] = useState\(null\)/)
  assert.match(board, /selectedKey=\{selectedPieceKey\}/)
  assert.match(board, /onSelect=\{setSelectedPieceKey\}/)
  assert.match(board, /o\.status === col\.key && \(!selectedPieceKey \|\| orderHasPieceKey\(o, selectedPieceKey\)\)/)
  assert.match(board, /Mostrando pedidos con:/)
  assert.match(board, /Quitar filtro/)
  assert.match(board, /onClick=\{\(\) => setSelectedPieceKey\(null\)\}/)
  assert.match(board, /piecesInOrderForKey\(order, selectedPieceKey\)/)
  assert.match(board, /piezas de este producto/)
  const list = source.slice(end)
  assert.doesNotMatch(list, /selectedPieceKey/, 'list view is unchanged')
})
