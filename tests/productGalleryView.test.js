import test from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fromProduct } from '../src/utils/productGallery.js'

const require = createRequire(import.meta.url)

async function loadGallery() {
  const sourceUrl = new URL('../src/components/ProductGallery.jsx', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' })
  const resolved = code.replace(/from "([^"]+)"/g, (_, specifier) => {
    const url = specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : pathToFileURL(require.resolve(specifier)).href
    return `from "${url}"`
  })
  return (await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)).default
}

test('gallery renders one ordered grid with persistent Spanish controls and accessible touch targets', async () => {
  const Gallery = await loadGallery()
  const html = renderToStaticMarkup(React.createElement(Gallery, {
    items: fromProduct({ image_url: 'one.jpg', secondary_images: ['two.jpg', 'three.jpg'] }),
    onChange() {}, prepareFile: async file => file, resolveUrl: url => `data:${url}`,
  }))
  assert.equal((html.match(/>Principal</g) || []).length, 1)
  assert.equal((html.match(/>Hacer principal</g) || []).length, 2)
  assert.equal((html.match(/aria-label="Eliminar foto/g) || []).length, 3)
  assert.ok(html.indexOf('data:one.jpg') < html.indexOf('data:two.jpg'))
  assert.ok(html.indexOf('data:two.jpg') < html.indexOf('data:three.jpg'))
  assert.match(html, /grid-cols-2/)
  assert.match(html, /min-w-0/)
  assert.match(html, /min-h-8/)
  assert.match(html, /min-w-8/)
  assert.match(html, /multiple=""/)
  assert.match(html, /image\/\*,.heic,.heif/)
  assert.equal((html.match(/>Agregar fotos</g) || []).length, 1)
})

test('Admin dimensions accept fractional cm while preserving manual required fields', async () => {
  const source = await readFile(new URL('../src/pages/Admin.jsx', import.meta.url), 'utf8')
  for (const field of ['length', 'width']) {
    const input = source.match(/<input\b[\s\S]*?\/>/g)?.find(element => element.includes(`value={formData.${field}}`))
    assert.ok(input, `Admin ${field} input exists`)
    const jsx = `export default function Dimension({ formData, fromPhotoDraft, setFormData }) { return (${input}) }`
    const { code } = await transform(jsx, { loader: 'jsx', jsx: 'automatic', format: 'esm' })
    const resolved = code.replace(/from "([^"]+)"/g, (_, specifier) => `from "${pathToFileURL(require.resolve(specifier)).href}"`)
    const Dimension = (await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)).default
    for (const fromPhotoDraft of [true, false]) {
      const html = renderToStaticMarkup(React.createElement(Dimension, { formData: { [field]: 20.5 }, fromPhotoDraft, setFormData() {} }))
      assert.match(html, /step="any"/, `${field} must accept fractional cm`)
      assert.match(html, /value="20.5"/)
      assert.equal(html.includes('required=""'), !fromPhotoDraft)
    }
  }
})
