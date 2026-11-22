import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'

async function renderLightbox({ video = false, scale = 1 } = {}) {
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const utils = await import('../src/utils/storefrontGallery.js')
  const require = createRequire(import.meta.url)
  const source = await readFile(new URL('../src/components/StorefrontProductGallery.jsx', import.meta.url), 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }; let stateIndex = 0
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return { ...React, useState(initial) { return [stateIndex++ === 0 ? video ? 1 : 0 : initial === false ? true : initial, () => {}] }, useEffect() {}, useRef: value => ({ current: value }) }
    if (name.endsWith('/storefrontGallery.js')) return utils
    if (name.endsWith('/useZoomPan.js')) return { __esModule: true, default: () => ({ state: { scale, x: 0, y: 0 }, bind: {}, imageRef: { current: null }, viewportRef: { current: null }, showHint: scale === 1, handleKeyDown: () => false, onImageLoad() {} }) }
    return require(name)
  }, module, module.exports)
  return renderToStaticMarkup(React.createElement(module.exports.default, { images: ['main.webp', 'side.webp'], videoUrl: 'clip.mp4', name: 'Marco' })).split('role="dialog"')[1]
}

test('lightbox photo has isolated touch-action none, GPU transform and Spanish hint away from counter', async () => {
  const html = await renderLightbox()
  assert.ok(html)
  assert.match(html, /touch-action:none/)
  assert.doesNotMatch(html, /touch-pan-y/)
  assert.match(html, /translate3d\(0px, 0px, 0\) scale\(1\)/)
  assert.match(html, /will-change:transform/)
  assert.match(html, /Pellizque o toque dos veces para acercar/)
  assert.match(html, /pointer-events-none[^\"]*bottom-16/)
  assert.match(html, /bottom-5[^>]*>1 \/ 3/)
  assert.match(html, /cursor-zoom-in/)
  const zoomed = await renderLightbox({ scale: 2.5 })
  assert.match(zoomed, /cursor-zoom-out/)
  assert.doesNotMatch(zoomed, /Pellizque o toque dos veces para acercar/)
})
test('lightbox video retains original touch-pan-y wrapper, native controls and no zoom hint', async () => {
  const html = await renderLightbox({ video: true })
  assert.match(html, /w-full max-w-5xl touch-pan-y p-4/)
  assert.match(html, /<video[^>]*src="clip.mp4"[^>]*muted=""[^>]*loop=""[^>]*playsinline=""[^>]*controls=""[^>]*preload="none"/)
  assert.doesNotMatch(html, /touch-action:none|will-change:transform|Pellizque/)
})
test('gallery delegates only open photos to zoom and checks zoom keyboard before Escape close', async () => {
  const gallery = await readFile(new URL('../src/components/StorefrontProductGallery.jsx', import.meta.url), 'utf8')
  const hook = await readFile(new URL('../src/hooks/useZoomPan.js', import.meta.url), 'utf8')
  assert.match(gallery, /enabled: lightboxOpen && item\?\.type === 'image'/)
  assert.match(gallery, /handleZoomKeyDown\(event\)\) return[\s\S]*event.key === 'Escape'/)
  assert.match(gallery, /resetKey:/)
  assert.match(hook, /scale === 1[\s\S]*onSwipe/)
  assert.doesNotMatch(hook, /setTimeout|setInterval/)
  assert.match(hook, /setPointerCapture/)
})

test('all photo backdrop areas refuse accidental close while zoomed', async () => {
  const gallery = await readFile(new URL('../src/components/StorefrontProductGallery.jsx', import.meta.url), 'utf8')
  assert.match(gallery, /event.target === event.currentTarget && \(item\?\.type === 'video' \|\| zoom.state.scale === 1\)/)
  assert.match(gallery, /!consumed && event.target === event.currentTarget && zoom.state.scale === 1/)
})
