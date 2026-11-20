import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
test('WhatsApp replaces Hoy while preserving legacy redirect, default and scoped page', async () => {
  const app = await readFile('src/App.jsx', 'utf8'),
    nav = await readFile('src/components/AdminChrome.jsx', 'utf8')
  assert.match(app, /\/admin\/:business\/whatsapp/)
  assert.match(app, /BusinessScopedPage page=\{WhatsAppFeed\}/)
  assert.match(app, /\/admin\/\$\{slug\}\/whatsapp/)
  assert.match(app, /\/admin\/:business\/hoy/)
  assert.match(app, /WhatsAppLegacyRedirect/)
  assert.match(nav, /tab: 'whatsapp', label: 'WhatsApp'/)
  assert.doesNotMatch(nav, /label: 'Hoy'/)
  await assert.rejects(() => access('src/pages/Today.jsx'))
})
test('feed provides compact theme-aware tabs, review metadata, all core actions and sheets', async () => {
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8'),
    card = await readFile('src/components/whatsapp/ThreadCard.jsx', 'utf8'),
    editor = await readFile('src/components/whatsapp/ThreadEditor.jsx', 'utf8')
  for (const text of [
    'Última revisión de Claude',
    'Agregar manual',
    'Sin conversaciones en este grupo.',
    'groupThreads',
    "role='tablist'",
    "role='tab'",
    'aria-selected',
    'feedTabKey',
    'overflow-x-auto',
    'max-w-[880px]',
    'Ver {remaining} más',
    'useWhatsAppFeed',
  ])
    assert.ok(page.includes(text), text)
  for (const text of [
    'Abrir chat',
    'Copiar número',
    'Marcar perdida',
    'Cerrar',
    'Convertir en pedido',
    'noopener',
    'aria-expanded',
    'aria-controls',
    'ThreadDetail',
    'rowChip',
    'min-h-14',
    'truncate',
    'Claude',
    'min-h-10',
  ])
    assert.ok(card.includes(text), text)
  for (const text of [
    'Pegar conversación (opcional)',
    'prepareFile',
    'uploadCompressedImage',
    'quoted_amount',
    'promise_source',
    'follow_up_date',
    'next_action',
    'notes',
    'reference_images',
    'ourSenders',
  ])
    assert.ok(editor.includes(text), text)
})

test('feed mounts business-keyed state only after data arrives and renders only selected rows', async () => {
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8')
  assert.match(page, /data\?\.available && \(/)
  assert.match(page, /key=\{currentBusinessId\}/)
  assert.match(
    page,
    /useState\(\(\) =>\s*loadFeedTab\(businessId, groups\)\s*\)/
  )
  assert.match(page, /visibleFeedThreads\(selectedGroup, showAllWaiting\)/)
  assert.match(page, /expanded=\{openThread === thread\.id\}/)
  assert.doesNotMatch(page, /feedKPIs|md:grid-cols-2|Todo al día en WhatsApp/)
})

test('tabs measure the app chrome, connect their panel, and expose keyboard focus', async () => {
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8')
  for (const text of [
    '[data-admin-chrome]',
    'ResizeObserver',
    'sticky',
    'aria-orientation',
    'aria-labelledby',
    "role='tabpanel'",
    'tabIndex={selected ? 0 : -1}',
    'preventDefault()',
    '.focus(',
    'scrollIntoView',
  ])
    assert.ok(page.includes(text), text)
})

test('compact row uses a native button and full existing detail rather than nested summary toggles', async () => {
  const card = await readFile('src/components/whatsapp/ThreadCard.jsx', 'utf8')
  assert.match(
    card,
    /<button[\s\S]*?aria-expanded=\{expanded\}[\s\S]*?onClick=\{onToggle\}/
  )
  assert.match(card, /expanded && \(/)
  assert.match(card, /<ThreadDetail/)
  assert.doesNotMatch(card, /Ver conversación completa|line-clamp-3/)
})

// Compile existing JSX in memory; SSR exercises real markup without a browser,
// network requests, generated files, or additional test dependencies.
async function renderComponents() {
  const [
    { transformWithEsbuild },
    React,
    { renderToStaticMarkup },
    { StaticRouter },
  ] = await Promise.all([
    import('vite'),
    import('react'),
    import('react-dom/server'),
    import('react-router-dom'),
  ])
  const utilsUrl = new URL('../src/utils/whatsappFeed.js', import.meta.url).href
  const compile = async (source, name) => {
    const { code } = await transformWithEsbuild(source, name, {
      loader: 'jsx',
      jsx: 'automatic',
    })
    const resolved = code.replace(
      /from "([^"]+)"/g,
      (_match, specifier) =>
        `from "${specifier === '../../utils/whatsappFeed' ? utilsUrl : import.meta.resolve(specifier)}"`
    )
    const url = `data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`
    return { url, component: (await import(url)).default }
  }
  const card = await compile(
    await readFile('src/components/whatsapp/ThreadCard.jsx', 'utf8'),
    'ThreadCard.jsx'
  )
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8')
  // Isolate the internal presentation component, avoiding authenticated/data imports.
  const groups = await compile(
    `
    import { useEffect, useState } from 'react'
    import ThreadCard from '${card.url}'
    import { loadFeedTab, saveFeedTab, feedTabKey, visibleFeedThreads } from '${utilsUrl}'
    ${page.slice(page.indexOf('const TAB_LABELS'), page.indexOf('export default function WhatsAppFeed'))}
    export default FeedGroups
  `,
    'FeedGroups.jsx'
  )
  const render = (component, props) =>
    renderToStaticMarkup(
      React.createElement(
        StaticRouter,
        { location: '/admin/hikari/whatsapp' },
        React.createElement(component, props)
      )
    )
  return { card: card.component, groups: groups.component, render }
}
const renderedComponents = renderComponents()

test('rendered accordion hides detail while collapsed and preserves full existing detail/actions when open', async () => {
  const { card, render } = await renderedComponents
  const thread = {
    id: 'thread',
    chat_key: '50588887777',
    customer_name: 'Cliente de prueba',
    customer_phone: '50588887777',
    status: 'to_quote',
    kind: 'quote',
    summary: 'Resumen completo\nSegunda línea de detalle',
    next_action: 'Enviar cotización',
    promised_date: '2026-11-19',
    promise_source: 'Hoy le envío el precio',
    source: 'claude',
    labels: ['Prioridad'],
    reference_images: ['https://example.invalid/reference.jpg'],
  }
  const props = {
    thread,
    now: '2026-11-20T04:00:00Z',
    ordersPath: '/admin/hikari/orders',
    onToggle() {},
    onStatus() {},
    onEdit() {},
  }
  const collapsed = render(card, { ...props, expanded: false })
  assert.match(collapsed, /aria-expanded="false"/)
  assert.doesNotMatch(
    collapsed,
    /role="region"|Abrir chat|Convertir en pedido|<img/
  )
  const expanded = render(card, { ...props, expanded: true })
  assert.match(expanded, /aria-expanded="true"/)
  assert.match(expanded, /role="region"/)
  for (const text of [
    'Resumen completo\nSegunda línea de detalle',
    'Abrir chat',
    'Copiar número',
    'Cotización enviada',
    'Dar seguimiento',
    'Editar',
    'Marcar perdida',
    'Cerrar',
    'Convertir en pedido',
    'Prioridad',
    'Prometido 19/11',
    'Hoy le envío el precio',
    'Claude',
    'reference.jpg',
  ])
    assert.ok(expanded.includes(text), text)
  assert.match(expanded, /href="\/admin\/hikari\/orders\?fromThread=thread"/)
  assert.doesNotMatch(expanded, /Ver conversación completa|line-clamp/)
})

test('rendered tabs keep six counts, one panel, and only selected group rows', async () => {
  const { groups: component, render } = await renderedComponents
  const { groupThreads } = await import('../src/utils/whatsappFeed.js')
  const now = '2026-11-20T04:00:00Z'
  const groups = groupThreads(
    [
      {
        id: 'urgent',
        status: 'to_quote',
        kind: 'quote',
        chat_key: 'name:urgente',
        customer_name: 'Cliente urgente',
        summary: 'Urgente',
        promised_date: '2026-11-19',
      },
      {
        id: 'quote',
        status: 'to_quote',
        kind: 'quote',
        chat_key: 'name:cotizar',
        customer_name: 'Cliente cotizar',
        summary: 'Cotizar',
      },
    ],
    now
  )
  const html = render(component, { groups, businessId: 'render-test', now })
  assert.equal((html.match(/role="tab"/g) || []).length, 6)
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 1)
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1)
  assert.equal((html.match(/<article/g) || []).length, 1)
  assert.ok(html.includes('Cliente urgente'))
  assert.ok(!html.includes('Cliente cotizar'))
  for (const label of [
    'Para hoy',
    'Sin responder',
    'Por cotizar',
    'Pagos',
    'Esperando cliente',
    'Cerrados',
  ])
    assert.ok(html.includes(label), label)
  assert.match(html, /opacity-50[\s\S]*?>0<\/span>/)
})

test('rendered waiting tab initially shows eight rows and the exact remaining count', async () => {
  const { groups: component, render } = await renderedComponents
  const { groupThreads } = await import('../src/utils/whatsappFeed.js')
  const now = '2026-11-20T04:00:00Z'
  const groups = groupThreads(
    Array.from({ length: 30 }, (_, i) => ({
      id: `waiting-${i}`,
      chat_key: `name:cliente-${i}`,
      customer_name: `Cliente ${i}`,
      summary: 'Esperando aprobación',
      status: 'sent',
      kind: 'quote',
      last_our_message_at: '2026-11-17T20:00:00Z',
    })),
    now
  )
  const html = render(component, { groups, businessId: 'render-test', now })
  assert.equal((html.match(/<article/g) || []).length, 8)
  assert.match(html, /Ver 22 más/)
  assert.match(html, /aria-labelledby="whatsapp-tab-waiting"/)
  assert.doesNotMatch(html, /Sin conversaciones en este grupo/)
})
