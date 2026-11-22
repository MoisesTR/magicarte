import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'

// Minimal hook lifecycle harness: no DOM library, timers, network or new dependencies.
async function setup(options = {}) {
  const React = await import('react')
  const utils = await import('../src/utils/zoomPan.js')
  const gallery = await import('../src/utils/storefrontGallery.js')
  const require = createRequire(import.meta.url)
  const slots = [], pending = [], listeners = new Map()
  let cursor = 0, result, hookOptions = { enabled: true, resetKey: 'a', onSwipe: () => {}, ...options }
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const mock = { ...React,
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
    useState(value) { const i = cursor++; slots[i] ??= typeof value === 'function' ? value() : value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { pending.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() } }); } },
  }
  const source = await readFile(new URL('../src/hooks/useZoomPan.js', import.meta.url), 'utf8')
  const { code } = await transform(source, { format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? mock : name.endsWith('/zoomPan.js') ? utils : name.endsWith('/storefrontGallery.js') ? gallery : require(name), module, module.exports)
  const viewport = { clientWidth: 300, clientHeight: 300, getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }), setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {}, addEventListener: (name, fn, config) => listeners.set(name, { fn, config }), removeEventListener: name => listeners.delete(name) }
  const image = { offsetWidth: 300, offsetHeight: 300 }
  const oldWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }) }
  function render(next = {}) {
    hookOptions = { ...hookOptions, ...next }; cursor = 0
    result = module.exports.default(hookOptions)
    result.viewportRef.current = viewport; result.imageRef.current = image
    while (pending.length) pending.shift()()
    return result
  }
  render(); render()
  const event = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', button: 0, timeStamp: 100, currentTarget: viewport, target: image, preventDefault() {}, stopPropagation() {}, ...extra })
  return { render, event, viewport, image, listeners, get zoom() { return render() }, cleanup() { for (const slot of slots) slot?.cleanup?.(); globalThis.window = oldWindow } }
}

test('touch double tap zooms at tap point; single taps never navigate', async () => {
  const swipes = []; const h = await setup({ onSwipe: direction => swipes.push(direction) })
  try {
    for (const time of [100, 250]) {
      h.zoom.bind.onPointerDown(h.event(180, 150, { timeStamp: time }))
      h.zoom.bind.onPointerUp(h.event(180, 150, { timeStamp: time + 20 }))
    }
    assert.deepEqual(h.zoom.state, { scale: 2.5, x: -45, y: 0 })
    assert.deepEqual(swipes, [])
  } finally { h.cleanup() }
})
test('pinch tracks midpoint movement; lifting to one finger pans without swipe or tap', async () => {
  const swipes = []; const h = await setup({ onSwipe: direction => swipes.push(direction) })
  try {
    h.zoom.bind.onPointerDown(h.event(100, 150))
    h.zoom.bind.onPointerDown(h.event(200, 150, { pointerId: 2 }))
    h.zoom.bind.onPointerMove(h.event(50, 150))
    h.zoom.bind.onPointerMove(h.event(250, 150, { pointerId: 2 }))
    assert.equal(h.zoom.state.scale, 2)
    assert.equal(h.zoom.state.x, 0)
    h.zoom.bind.onPointerUp(h.event(250, 150, { pointerId: 2 }))
    h.zoom.bind.onPointerMove(h.event(90, 150))
    assert.equal(h.zoom.state.x, 40)
    h.zoom.bind.onPointerUp(h.event(90, 150))
    assert.deepEqual(swipes, [])
  } finally { h.cleanup() }
})
test('1x swipes navigate; zoomed pan never navigates and cancellation cannot become a tap', async () => {
  const swipes = []; const h = await setup({ onSwipe: direction => swipes.push(direction) })
  try {
    h.zoom.bind.onPointerDown(h.event(220, 150)); h.zoom.bind.onPointerMove(h.event(100, 150)); h.zoom.bind.onPointerUp(h.event(100, 150))
    assert.deepEqual(swipes, [1])
    h.zoom.handleKeyDown({ key: '+', preventDefault() {} })
    h.zoom.bind.onPointerDown(h.event(220, 150)); h.zoom.bind.onPointerMove(h.event(0, 150)); h.zoom.bind.onPointerUp(h.event(0, 150))
    assert.deepEqual(swipes, [1]); assert.equal(h.zoom.state.x, -75)
    h.zoom.bind.onPointerDown(h.event(150, 150)); h.zoom.bind.onPointerCancel(h.event(150, 150))
    h.zoom.bind.onPointerUp(h.event(150, 150))
    assert.equal(h.zoom.state.scale, 1.5)
  } finally { h.cleanup() }
})
test('desktop click toggles zoom, mouse drag does not toggle and native wheel prevents page zoom', async () => {
  const h = await setup()
  try {
    h.zoom.bind.onPointerDown(h.event(180, 150, { pointerType: 'mouse' }))
    h.zoom.bind.onPointerUp(h.event(180, 150, { pointerType: 'mouse' }))
    h.zoom.bind.onClick(h.event(180, 150, { pointerType: 'mouse' }))
    assert.equal(h.zoom.state.scale, 2.5)
    h.zoom.bind.onPointerDown(h.event(180, 150, { pointerType: 'mouse' }))
    h.zoom.bind.onPointerMove(h.event(220, 150, { pointerType: 'mouse' }))
    h.zoom.bind.onPointerUp(h.event(220, 150, { pointerType: 'mouse' }))
    h.zoom.bind.onClick(h.event(220, 150, { pointerType: 'mouse' }))
    assert.equal(h.zoom.state.scale, 2.5)
    assert.equal(h.listeners.get('wheel').config.passive, false)
    let prevented = false
    h.listeners.get('wheel').fn(h.event(150, 150, { deltaY: -5000, deltaMode: 0, ctrlKey: true, preventDefault() { prevented = true } }))
    assert.equal(prevented, true); assert.equal(h.zoom.state.scale, 4)
  } finally { h.cleanup() }
})
test('keyboard and lifecycle reset; Escape at 1x falls through to gallery close', async () => {
  const h = await setup()
  try {
    assert.equal(h.zoom.handleKeyDown({ key: 'Escape', preventDefault() {} }), false)
    assert.equal(h.zoom.handleKeyDown({ key: '+', preventDefault() {} }), true)
    assert.equal(h.zoom.state.scale, 1.5)
    assert.equal(h.zoom.handleKeyDown({ key: 'Escape', preventDefault() {} }), true)
    assert.equal(h.zoom.state.scale, 1)
    h.zoom.handleKeyDown({ key: '+', preventDefault() {} }); h.render({ resetKey: 'b' }); assert.equal(h.zoom.state.scale, 1)
    h.zoom.handleKeyDown({ key: '+', preventDefault() {} }); h.render({ enabled: false }); assert.equal(h.zoom.state.scale, 1)
    assert.equal(h.zoom.handleKeyDown({ key: '+', preventDefault() {} }), false)
  } finally { h.cleanup() }
})

test('captured mouse click still zooms photo; captured touch and drag clicks cannot close backdrop', async () => {
  const h = await setup()
  try {
    h.zoom.bind.onPointerDown(h.event(150, 150, { pointerType: 'mouse' }))
    h.zoom.bind.onPointerUp(h.event(150, 150, { pointerType: 'mouse' }))
    assert.equal(h.zoom.bind.onClick(h.event(150, 150, { target: h.viewport, pointerType: 'mouse' })), true)
    assert.equal(h.zoom.state.scale, 2.5)
    h.zoom.handleKeyDown({ key: '0', preventDefault() {} })
    h.zoom.bind.onPointerDown(h.event(150, 150)); h.zoom.bind.onPointerUp(h.event(150, 150))
    assert.equal(h.zoom.bind.onClick(h.event(150, 150, { target: h.viewport })), true)
    assert.equal(h.zoom.state.scale, 1)
    h.zoom.bind.onPointerDown(h.event(10, 10, { target: h.viewport, pointerType: 'mouse' }))
    h.zoom.bind.onPointerUp(h.event(10, 10, { target: h.viewport, pointerType: 'mouse' }))
    assert.equal(h.zoom.bind.onClick(h.event(10, 10, { target: h.viewport, pointerType: 'mouse' })), false)
  } finally { h.cleanup() }
})

test('keyboard clamps, zero resets, lost capture cancels, and image remeasurement clamps pan', async () => {
  const h = await setup()
  try {
    for (let i = 0; i < 12; i++) h.zoom.handleKeyDown({ key: '+', preventDefault() {} })
    assert.equal(h.zoom.state.scale, 4)
    h.zoom.bind.onPointerDown(h.event(150, 150)); h.zoom.bind.onPointerMove(h.event(450, 150))
    assert.equal(h.zoom.state.x, 300)
    h.image.offsetWidth = 100; h.zoom.onImageLoad()
    assert.equal(h.zoom.state.x, 50)
    h.zoom.bind.onLostPointerCapture(h.event(450, 150))
    h.zoom.bind.onPointerUp(h.event(450, 150))
    assert.equal(h.zoom.bind.onClick(h.event(450, 150, { target: h.viewport })), true)
    h.zoom.handleKeyDown({ key: '0', preventDefault() {} })
    assert.deepEqual(h.zoom.state, { scale: 1, x: 0, y: 0 })
    for (let i = 0; i < 12; i++) h.zoom.handleKeyDown({ key: '-', preventDefault() {} })
    assert.equal(h.zoom.state.scale, 1)
  } finally { h.cleanup() }
})

test('plain backdrop tap remains unconsumed at 1x', async () => {
  const h = await setup()
  try {
    h.zoom.bind.onPointerDown(h.event(10, 10, { target: h.viewport }))
    h.zoom.bind.onPointerUp(h.event(10, 10, { target: h.viewport }))
    assert.equal(h.zoom.bind.onClick(h.event(10, 10, { target: h.viewport })), false)
  } finally { h.cleanup() }
})
