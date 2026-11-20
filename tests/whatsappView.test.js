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
    const module = await import(url)
    return { url, component: module.default, content: module.DateFilteredFeed }
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
    import * as feed from '${utilsUrl}'
    const { loadFeedTab, saveFeedTab, feedTabKey, visibleFeedThreads,
      groupThreads, filterThreadsByDate, loadFeedDateRange, saveFeedDateRange } = feed
    ${page.slice(page.indexOf('const TAB_LABELS'), page.indexOf('export default function WhatsAppFeed'))}
    export default FeedGroups
    export const DateFilteredFeed = typeof FeedContent === 'undefined' ? null : FeedContent
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
  return {
    card: card.component,
    groups: groups.component,
    content: groups.content,
    render,
  }
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

test('rendered tabs keep seven counts, one panel, and only selected group rows', async () => {
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
  assert.equal((html.match(/role="tab"/g) || []).length, 8)
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 1)
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1)
  assert.equal((html.match(/<article/g) || []).length, 1)
  assert.ok(html.includes('Cliente urgente'))
  assert.ok(!html.includes('Cliente cotizar'))
  for (const label of [
    'Confirmados',
    'Responder hoy',
    'Sin responder',
    'Por cotizar',
    'Pagos',
    'Esperando cliente',
    'En Pedidos ✓',
    'Descartados',
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

test('date controls precede tabs with accessible selections, mobile targets, and theme-aware colors', async () => {
  const { content, render } = await renderedComponents
  assert.equal(typeof content, 'function')
  const html = render(content, {
    businessId: 'new-business',
    threads: [],
    now: '2026-11-20T04:00:00Z',
  })
  assert.match(html, /role="group" aria-label="Filtrar por fecha"/)
  assert.ok(html.indexOf('Filtrar por fecha') < html.indexOf('role="tablist"'))
  assert.match(html, /aria-pressed="false"[^>]*>Hoy<\/button>/)
  assert.match(html, /aria-pressed="false"[^>]*>Esta semana<\/button>/)
  assert.match(html, /aria-pressed="true"[^>]*>Todo<\/button>/)
  assert.match(html, /grid w-full min-w-0 grid-cols-3/)
  assert.equal((html.match(/min-h-10/g) || []).length, 3)
  assert.match(html, /bg-white/)
  assert.match(html, /text-gray-800/)
  assert.doesNotMatch(html, /Mostrando/)
})

test('rendered date filtering restores business choice before grouping, counts, and default selection', async () => {
  const { content, render } = await renderedComponents
  assert.equal(typeof content, 'function')
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) =>
        key === 'whatsapp.feedDateRange.filtered-business' ? 'today' : null,
      setItem() {
        assert.fail('render must not overwrite preferences')
      },
    },
  })
  try {
    const props = {
      now: '2026-11-20T04:00:00Z',
      threads: [
        {
          id: 'old',
          customer_name: 'Cliente antiguo',
          status: 'to_quote',
          awaiting_reply: true,
          created_at: '2025-01-01T12:00:00Z',
        },
        {
          id: 'new',
          customer_name: 'Cliente reciente',
          status: 'follow_up',
          kind: 'payment',
          updated_at: '2026-11-20T03:00:00Z',
        },
      ],
    }
    const filtered = render(content, {
      ...props,
      businessId: 'filtered-business',
    })
    assert.match(filtered, /Mostrando 1 de 2 conversaciones/)
    assert.match(filtered, /aria-labelledby="whatsapp-tab-payments"/)
    assert.match(filtered, /Cliente reciente/)
    assert.doesNotMatch(filtered, /Cliente antiguo/)
    assert.match(filtered, /Sin responder <span[^>]*>0<\/span>/)
    const other = render(content, { ...props, businessId: 'other-business' })
    assert.match(other, /Cliente antiguo/)
    assert.doesNotMatch(other, /Mostrando/)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})

test('date selection saves only explicit changes and resets tab state against filtered groups', async () => {
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8')
  assert.match(page, /useState\(\(\) =>\s*loadFeedDateRange\(businessId\)\s*\)/)
  assert.match(page, /saveFeedDateRange\(businessId, (?:range|key)\)/)
  assert.match(page, /<FeedGroups\s+key=\{(?:dateRange|range)\}/)
  assert.match(page, /<FeedContent[\s\S]*?key=\{currentBusinessId\}/)
})

test('confirmed compact rows show delivery/payment/safety-net chips and existing expanded actions', async () => {
  const { card, groups: component, render } = await renderedComponents
  const { groupThreads } = await import('../src/utils/whatsappFeed.js')
  const now = '2026-11-20T18:00:00Z'
  const thread = {
    id: 'confirmed',
    status: 'sent',
    kind: 'quote',
    customer_name: 'Ana',
    customer_phone: '50588887777',
    summary: '20 llaveros',
    delivery_date: '2026-11-20',
    delivery_method: 'Retiro El Edén',
    paid_amount: 700,
    quoted_amount: 1400,
  }
  const html = render(card, { thread, now, expanded: false })
  for (const text of [
    'Sin pedido registrado',
    'Pagó la mitad · falta C$700',
    'Hoy',
    'Retiro El Edén',
    'Ana',
    '20 llaveros',
  ])
    assert.ok(html.includes(text), text)
  assert.match(html, /bg-red-50[^"]*text-red-700/)
  const expanded = render(card, {
    thread,
    now,
    expanded: true,
    ordersPath: '/admin/hikari/orders',
  })
  for (const text of [
    'Registrar pago',
    'Monto del pago (C$)',
    'Convertir en pedido',
    'Abrir chat',
  ])
    assert.ok(expanded.includes(text), text)
  const groups = groupThreads(
    [
      thread,
      {
        ...thread,
        id: 'undated',
        customer_name: 'Sin fecha Ana',
        delivery_date: null,
      },
    ],
    now
  )
  const panel = render(component, { groups, businessId: 'deliveries', now })
  assert.match(panel, /Acordado en WhatsApp y aún sin pedido registrado/)
  assert.match(panel, /Sin fecha/)
  assert.match(panel, /Confirmados <span[^>]*>2<\/span>/)
})

test('editor exposes delivery date, free-text method and paid amount without new payment tables', async () => {
  const source = await readFile(
    'src/components/whatsapp/ThreadEditor.jsx',
    'utf8'
  )
  for (const text of [
    'Fecha de entrega',
    'Forma de entrega',
    'Pagado C$',
    'delivery_date',
    'delivery_method',
    'paid_amount',
  ])
    assert.ok(source.includes(text), text)
})

test('closed linked rows expose a green order deep-link outside the accordion button with session-only note', async () => {
  const { card, render } = await renderedComponents
  const thread = {
    id: 'linked',
    chat_key: '50588841808',
    status: 'won',
    order_id: 'order-id',
    summary: 'Llaveros',
    customer_name: 'Ana',
  }
  const props = {
    thread,
    ordersPath: '/admin/hikari/orders',
    matchedOrder: { id: 'order-id', order_number: 42 },
    expanded: false,
  }
  const html = render(card, { ...props, autoLinked: true })
  assert.match(html, /href="\/admin\/hikari\/orders\?order=order-id"/)
  assert.match(html, /Pedido #42 ✓/)
  assert.match(html, /bg-green-50[^\"]*text-green-700/)
  assert.match(html, /Vinculado por teléfono/)
  assert.ok(html.indexOf('</button>') < html.indexOf('Pedido #42'))
  assert.doesNotMatch(render(card, props), /Vinculado por teléfono/)
  assert.doesNotMatch(html, /Sin pedido registrado/)
  assert.match(
    render(card, {
      thread: {
        ...thread,
        status: 'sent',
        order_id: null,
        delivery_date: '2026-11-20',
      },
      expanded: true,
      now: '2026-11-20T18:00:00Z',
    }),
    /Sin pedido registrado/
  )
})

test('closed feed forwards matched order and session provenance to the rendered compact row', async () => {
  const { groups: component, render } = await renderedComponents
  const { groupThreads } = await import('../src/utils/whatsappFeed.js')
  const now = '2026-11-20T18:00:00Z'
  const thread = {
    id: 'linked',
    status: 'won',
    order_id: 'order-id',
    status_changed_at: now,
    chat_key: '50588841808',
    summary: 'Llaveros',
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'inOrders' },
  })
  try {
    const html = render(component, {
      groups: groupThreads([thread], now),
      businessId: 2,
      now,
      ordersPath: '/admin/hikari/orders',
      orderMatches: new Map([['linked', { id: 'order-id', order_number: 42 }]]),
      autoLinkedThreadIds: ['linked'],
    })
    assert.match(html, /Pedido #42 ✓/)
    assert.match(html, /Vinculado por teléfono/)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})

test('authenticated feed wires order matching and per-business session provenance into its load and UI', async () => {
  const hook = await readFile('src/hooks/useWhatsAppFeed.js', 'utf8')
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8')
  assert.match(hook, /loadWhatsAppFeedWithOrders\(/)
  assert.match(hook, /fetchWhatsAppOrders/)
  assert.match(hook, /completeThreadConversion/)
  assert.match(page, /orderMatches=\{data\.orderMatches\}/)
  assert.match(page, /autoLinkedThreadIds=\{data\.autoLinkedThreadIds\}/)
})

test('non-customer action is next to Cerrar only for expanded open threads and has an inline optional reason confirmation', async () => {
  const { card, render } = await renderedComponents
  const props = {
    thread: { id: 't', status: 'sent', kind: 'quote', summary: 'Delivery' },
    ordersPath: '/admin/hikari/orders',
  }
  const html = render(card, { ...props, expanded: true })
  assert.match(html, />Cerrar<\/button><button[^>]*>No es cliente<\/button>/)
  assert.doesNotMatch(render(card, { ...props, expanded: false }), /No es cliente/)
  assert.doesNotMatch(render(card, {
    ...props,
    thread: { ...props.thread, status: 'done' },
    expanded: true,
  }), />No es cliente<\/button>/)
  const source = await readFile('src/components/whatsapp/ThreadCard.jsx', 'utf8')
  assert.match(source, /placeholder='Ej\.: delivery, proveedor'/)
  assert.match(source, /maxLength=\{80\}/)
  assert.match(source, />\s*Confirmar\s*<\/button>/)
  assert.doesNotMatch(source, /window\.confirm/)
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8')
  assert.match(page, /markNotCustomer\(thread, reason, currentBusinessId\)/)
})

test('Cerrados renders a muted non-customer chip and reason instead of money or ordinary closed styling', async () => {
  const { groups: component, render } = await renderedComponents
  const { groupThreads } = await import('../src/utils/whatsappFeed.js')
  const now = '2026-11-20T18:00:00Z'
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'closed' },
  })
  try {
    const html = render(component, {
      businessId: 'non-customer-test',
      now,
      groups: groupThreads([{
        id: 'supplier',
        status: 'done',
        kind: 'other',
        lost_reason: 'No es cliente: proveedor',
        status_changed_at: now,
        quoted_amount: 1200,
        summary: 'Entrega de insumos',
      }], now),
    })
    assert.match(html, /aria-labelledby="whatsapp-tab-closed"/)
    assert.match(html, /bg-gray-100 text-gray-600[^>]*>No es cliente: proveedor<\/span>/)
    assert.doesNotMatch(html, /C\$|>Cerrado<|bg-green-50|bg-red-50/)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})

test('confirmed rows expose a visible Crear pedido link outside the accordion button', async () => {
  const { card, render } = await renderedComponents
  const thread = {
    id: 'thread-18',
    chat_key: '50584216792',
    status: 'follow_up',
    kind: 'order',
    paid_amount: 2700,
    delivery_date: '2026-11-25',
    summary: '18 vitrales',
    customer_name: 'Julissa',
  }
  const props = {
    ordersPath: '/admin/magicarte/orders',
    expanded: false,
    now: '2026-11-20T18:00:00Z',
  }
  const html = render(card, { ...props, thread })
  assert.match(
    html,
    /<a[^>]*href="\/admin\/magicarte\/orders\?fromThread=thread-18"[^>]*>Crear pedido<\/a>/
  )
  assert.ok(html.indexOf('</button>') < html.indexOf('>Crear pedido<'))
  for (const other of [
    { ...thread, paid_amount: 0, delivery_date: null },
    { ...thread, status: 'won', order_id: 'order-1' },
  ])
    assert.doesNotMatch(render(card, { ...props, thread: other }), />Crear pedido</)
})
