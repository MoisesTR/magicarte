import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { backTarget } from '../src/utils/storefrontRoutes.js'

test('backTarget goes back when the tab has in-app history', () => {
  assert.equal(backTarget({ idx: 2 }), -1)
  assert.equal(backTarget({ idx: 1 }), -1)
})

test('backTarget falls back to the home page on a fresh tab or direct link', () => {
  assert.equal(backTarget({ idx: 0 }), '/')
  assert.equal(backTarget(null), '/')
  assert.equal(backTarget(undefined), '/')
})

test('ProductDetail back button uses backTarget', async () => {
  const source = await readFile(new URL('../src/pages/ProductDetail.jsx', import.meta.url), 'utf8')
  assert.match(source, /backTarget\(/)
  assert.doesNotMatch(source, /navigate\(-1\)/)
})
