import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
async function loadField() {
  const sourceUrl = new URL('../src/components/ProductTextField.jsx', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' })
  const resolved = code.replace(/from "([^"]+)"/g, (_, specifier) => `from "${specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : pathToFileURL(require.resolve(specifier)).href}"`)
  return (await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)).default
}

test('product text field renders label-row enhancement with accessible >=40px controls and an empty-field guard', async () => {
  const Field = await loadField()
  for (const value of ['', '   ', 'acrilico 3mm']) {
    const html = renderToStaticMarkup(React.createElement(Field, {
      field: 'material', label: 'Material y Técnica', value, onChange() {}, context: {}, getSession() {},
    }))
    assert.match(html, /for="product-text-material"/)
    assert.match(html, /id="product-text-material"/)
    assert.match(html, /✨ Mejorar/)
    assert.match(html, /aria-label="Mejorar con IA: Material y Técnica"/)
    assert.equal(/<button[^>]*disabled=""/.test(html), !value.trim())
    assert.match(html, /min-h-10/)
    assert.match(html, /flex-wrap/)
    assert.match(html, /min-w-0/)
  }
})

test('all three Admin text fields share explicit suggestion/use/discard/undo and form-scoped stale-response boundaries', async () => {
  const admin = await readFile(new URL('../src/pages/Admin.jsx', import.meta.url), 'utf8')
  for (const field of ['description', 'material', 'care']) assert.match(admin, new RegExp(`field=['"]${field}['"]`))
  for (const name of ['description', 'material_technique', 'care_instructions']) assert.match(admin, new RegExp(`value=\\{formData\\.${name}\\}`))
  assert.match(admin, /key=\{`\$\{currentBusinessId\}:\$\{quoteRequest.current\}:/)
  const source = await readFile(new URL('../src/components/ProductTextField.jsx', import.meta.url), 'utf8')
  for (const text of ['Mejorando…', 'Usar este texto', 'Descartar', 'Deshacer', 'Sugerencia de IA']) assert.ok(source.includes(text))
  assert.match(source, /whitespace-pre-wrap/)
  assert.match(source, /\[overflow-wrap:anywhere\]/)
  assert.match(source, /mounted.current = false/)
  assert.match(source, /enhancementReducer/)
  assert.match(source, /requestTextEnhancement/)
  assert.match(source, /toast.error/)
})
