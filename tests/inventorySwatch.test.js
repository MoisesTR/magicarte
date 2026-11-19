import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
async function loadSwatch() {
  const url = new URL('../src/components/Swatch.jsx', import.meta.url)
  const source = await readFile(url, 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' })
  const resolved = code.replace(/from "([^"]+)"/g, (_, specifier) => `from "${pathToFileURL(require.resolve(specifier)).href}"`)
  return (await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)).default
}

test('swatch displays a solid round color with an accessible name', async () => {
  const Swatch = await loadSwatch()
  const html = renderToStaticMarkup(React.createElement(Swatch, { hex: '#F1E2D3', label: 'Ivory White' }))
  assert.match(html, /background-color:#F1E2D3/)
  assert.match(html, /rounded-full/)
  assert.match(html, /shrink-0/)
  assert.match(html, /title="Ivory White"/)
  assert.match(html, /aria-label="Ivory White"/)
})

test('transparent swatch uses checkerboard with Spanish title even with a hex', async () => {
  const Swatch = await loadSwatch()
  const html = renderToStaticMarkup(React.createElement(Swatch, { hex: '#000000', transparent: true }))
  assert.match(html, /title="Transparente"/)
  assert.match(html, /conic-gradient/)
  assert.match(html, /background-size:12px 12px/)
})

test('missing and malformed hex render a neutral dashed placeholder', async () => {
  const Swatch = await loadSwatch()
  for (const hex of [null, undefined, '', 'bad']) {
    const html = renderToStaticMarkup(React.createElement(Swatch, { hex }))
    assert.match(html, /border-dashed/)
    assert.match(html, /title="Color sin definir"/)
    assert.doesNotMatch(html, /background-color:bad/)
  }
})
