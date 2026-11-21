import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as campaigns from '../src/utils/seasonalCampaigns.js'

const require = createRequire(import.meta.url)
const christmas = () => campaigns.activeCampaign(new Date('2026-11-21T18:00:00Z'))

async function component(name, react = React) {
  const source = await readFile(new URL(`../src/components/${name}.jsx`, import.meta.url), 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(specifier => {
    if (specifier === 'react') return react
    if (specifier.endsWith('/seasonalCampaigns.js')) return campaigns
    return require(specifier)
  }, module, module.exports)
  return module.exports.default
}

function elements(node, predicate) {
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => elements(child, predicate))]
}

test('Christmas hero renders exact copy, desktop side card, and optional deadline', async () => {
  const Hero = await component('SeasonalHero')
  const campaign = christmas()
  const html = renderToStaticMarkup(React.createElement(Hero, { campaign, categories: [{ id: 1, name: 'Navidad' }] }))
  for (const text of ['🎄 Temporada navideña', 'Regalos que se quedan en el árbol', 'Esferas, nacimientos y adornos personalizados para esta Navidad.', 'Ver regalos de Navidad →', '✨ Personalizado con nombre', '🚚 Envíos a todo el país', '💬 Pedidos por WhatsApp', 'hidden md:flex', 'from-emerald-900', 'to-red-700', 'amber-300']) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /📅 Pedidos hasta/)
  const deadline = renderToStaticMarkup(React.createElement(Hero, { campaign: { ...campaign, orderDeadline: '18 de diciembre' } }))
  assert.match(deadline, /📅 Pedidos hasta el 18 de diciembre/)
})

test('Christmas CTA invokes existing selection flow with exact category or is omitted', async () => {
  const Hero = await component('SeasonalHero')
  const category = { id: 9, name: 'Navidad' }
  let selected
  const tree = Hero({ campaign: christmas(), categories: [{ id: 1, name: 'Otra' }, category], onCategorySelect: value => { selected = value } })
  const buttons = elements(tree, node => node.type === 'button')
  assert.equal(buttons.length, 1)
  buttons[0].props.onClick()
  assert.equal(selected, category)
  for (const categories of [undefined, [], [{ id: 0, name: 'Todos' }]]) {
    const html = renderToStaticMarkup(React.createElement(Hero, { campaign: christmas(), categories }))
    assert.match(html, /Regalos que se quedan en el árbol/)
    assert.doesNotMatch(html, /<button|undefined/)
    assert.match(html, /min-h-12/)
  }
  for (const categories of [[], [category]]) {
    const tree = Hero({ campaign: { ...christmas(), orderDeadline: '18 de diciembre' }, categories })
    const slot = elements(tree, node => node.type === 'div' && node.props.className === 'min-h-12 w-full xl:w-60 shrink-0')
    assert.equal(slot.length, 1, 'reserve the CTA slot even when a deadline is already rendered')
  }
  assert.equal(Hero({ campaign: null }), null)
})

test('seasonal banner renders both deadline variants and dismisses locally with callback', async () => {
  let dismissed = false
  let callbackCount = 0
  const Banner = await component('SeasonalBanner', { ...React, useState: () => [dismissed, value => { dismissed = value }] })
  for (const orderDeadline of [null, '18 de diciembre']) {
    const campaign = { ...christmas(), orderDeadline }
    const html = renderToStaticMarkup(React.createElement(Banner, { campaign }))
    assert.ok(html.includes(campaigns.campaignBannerText(campaign)))
    assert.match(html, /aria-label="Cerrar banner"/)
    assert.match(html, /seasonal-banner-height/)
  }
  const tree = Banner({ campaign: christmas(), onDismiss: () => { callbackCount++ } })
  elements(tree, node => node.type === 'button')[0].props.onClick()
  assert.equal(callbackCount, 1)
  assert.equal(Banner({ campaign: christmas() }), null)
  dismissed = false
  assert.equal(Banner({ campaign: null }), null)
})

test('Mother hero retains pink visuals and formal copy with its existing deadline window', async () => {
  const Hero = await component('SeasonalHero')
  const campaign = campaigns.activeCampaign(new Date('2026-05-20T18:00:00Z'))
  const html = renderToStaticMarkup(React.createElement(Hero, { campaign, categories: [{ name: 'Madera' }] }))
  for (const text of ['from-rose-500', 'via-pink-400', 'to-fuchsia-400', 'Regale amor a mamá', 'Personalizado con su mensaje', 'Pedidos hasta el 27 de mayo']) assert.ok(html.includes(text), text)
  const late = renderToStaticMarkup(React.createElement(Hero, { campaign: { ...campaign, daysLeft: 2 } }))
  assert.doesNotMatch(late, /Pedidos hasta/)
})

test('Home/Header use shared seasonal components and both pages account for dismissed banner height', async () => {
  const home = await readFile(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8')
  const header = await readFile(new URL('../src/components/Header.jsx', import.meta.url), 'utf8')
  const detail = await readFile(new URL('../src/pages/ProductDetail.jsx', import.meta.url), 'utf8')
  assert.match(home, /<SeasonalHero/)
  assert.match(home, /setSelectedCategory\(cat\)[\s\S]*?productsRef.current\?\.scrollIntoView/)
  assert.match(header, /<SeasonalBanner onDismiss=\{onBannerDismiss\}/)
  for (const source of [home, detail]) {
    assert.match(source, /isSeasonalBannerActive\(\)/)
    assert.match(source, /!bannerDismissed/)
    assert.match(source, /var\(--seasonal-banner-height\)/)
    assert.match(source, /onBannerDismiss=\{\(\) => setBannerDismissed\(true\)\}/)
    assert.doesNotMatch(source, /getMothersDay|MothersDayHero/)
  }
})

test('seasonal decoration is scoped, clipped, noninteractive and fully disabled for reduced motion', async () => {
  const hero = await readFile(new URL('../src/components/SeasonalHero.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
  assert.match(hero, /overflow-hidden/)
  assert.match(hero, /pointer-events-none/)
  assert.match(hero, /aria-hidden='true'/)
  assert.doesNotMatch(hero, /setInterval|setTimeout|<img|<canvas/)
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.seasonal-decoration[^}]*animation:\s*none[^}]*display:\s*none/s)
  assert.match(css, /--seasonal-banner-height:\s*6rem/)
  assert.match(css, /@media\s*\(min-width:\s*640px\)[\s\S]*?--seasonal-banner-height:\s*4rem/)
})
