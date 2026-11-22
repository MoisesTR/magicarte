import test from 'node:test'
import assert from 'node:assert/strict'
import { clampScale, zoomAround, clampPan, doubleTapTarget, isDoubleTap, resetZoom } from '../src/utils/zoomPan.js'

const identity = { scale: 1, x: 0, y: 0 }

test('zoom scale is clamped to 1..4', () => {
  for (const [value, expected] of [[-2, 1], [0.5, 1], [1, 1], [2.5, 2.5], [4, 4], [20, 4]]) assert.equal(clampScale(value), expected)
})
test('zoom around a center-relative point keeps its image coordinate fixed', () => {
  const point = { x: 100, y: -60 }
  const state = { scale: 2, x: -20, y: 30 }
  const next = zoomAround(point, state, 3.5)
  assert.equal((point.x - next.x) / next.scale, (point.x - state.x) / state.scale)
  assert.equal((point.y - next.y) / next.scale, (point.y - state.y) / state.scale)
  assert.equal(zoomAround(point, state, 20).scale, 4)
  assert.deepEqual(zoomAround(point, identity, 2.5), { scale: 2.5, x: -150, y: 90 })
})
test('pan clamps to scaled image edges using rendered image and viewport sizes', () => {
  const image = { width: 300, height: 200 }
  const viewport = { width: 320, height: 400 }
  assert.deepEqual(clampPan({ scale: 3, x: 999, y: -999 }, image, viewport), { scale: 3, x: 290, y: -100 })
  assert.deepEqual(clampPan({ scale: 2, x: -999, y: 99 }, image, viewport), { scale: 2, x: -140, y: 0 })
  assert.deepEqual(clampPan({ scale: 1, x: 100, y: -80 }, image, viewport), identity)
  assert.deepEqual(clampPan({ scale: 2, x: 15, y: -10 }, image, { width: 100, height: 100 }), { scale: 2, x: 15, y: -10 })
})
test('double tap toggles between 1x and 2.5x', () => {
  assert.equal(doubleTapTarget(1), 2.5)
  for (const scale of [1.01, 2.5, 4]) assert.equal(doubleTapTarget(scale), 1)
})
test('double tap requires ordered timestamps within 300ms and nearby points', () => {
  const previous = { x: 30, y: 40, time: 1000 }
  assert.equal(isDoubleTap(null, previous), false)
  assert.equal(isDoubleTap(previous, { x: 40, y: 50, time: 1300 }), true)
  assert.equal(isDoubleTap(previous, { x: 40, y: 50, time: 1301 }), false)
  assert.equal(isDoubleTap(previous, { x: 30, y: 40, time: 999 }), false)
  assert.equal(isDoubleTap(previous, { x: 61, y: 40, time: 1100 }), false)
})
test('reset returns a fresh identity without mutating the current zoom', () => {
  const state = { scale: 3, x: 12, y: -20 }
  assert.deepEqual(resetZoom(), identity)
  assert.notEqual(resetZoom(), resetZoom())
  assert.deepEqual(state, { scale: 3, x: 12, y: -20 })
})
