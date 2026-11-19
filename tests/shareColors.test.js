import test from 'node:test'
import assert from 'node:assert/strict'
import { copyColorLink, shareColorLink } from '../src/utils/shareColors.js'

const url = 'https://example.test/hikari/colores'
test('native sharing receives the URL and title without copying', async () => {
  const calls = []
  const navigator = { share: async value => calls.push(value) }
  assert.equal(await shareColorLink(url, 'Colores', { navigator }), 'shared')
  assert.deepEqual(calls, [{ title: 'Colores', url }])
})
test('share cancellation does not unexpectedly copy; other failures fall back to copying', async () => {
  const copies = []
  const navigator = { share: async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }) }, clipboard: { writeText: async text => copies.push(text) } }
  assert.equal(await shareColorLink(url, 'Colores', { navigator }), 'cancelled')
  assert.deepEqual(copies, [])
  navigator.share = async () => { throw Error('unavailable') }
  assert.equal(await shareColorLink(url, 'Colores', { navigator }), 'copied')
  assert.deepEqual(copies, [url])
})
test('clipboard copy works without native share', async () => {
  let copied
  assert.equal(await copyColorLink(url, { navigator: { clipboard: { writeText: async value => { copied = value } } } }), true)
  assert.equal(copied, url)
})
test('denied clipboard uses a selected textarea fallback and cleans it up', async () => {
  let removed = false, selected = false
  const textarea = { style: {}, setAttribute() {}, select() { selected = true }, remove() { removed = true } }
  const document = { createElement: () => textarea, body: { appendChild() {} }, execCommand: action => action === 'copy' }
  assert.equal(await copyColorLink(url, { navigator: { clipboard: { writeText: async () => { throw Error('denied') } } }, document }), true)
  assert.equal(textarea.value, url)
  assert.equal(selected, true)
  assert.equal(removed, true)
  assert.equal(await copyColorLink(url, { navigator: {}, document: undefined }), false)
})
