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
test('feed provides mobile theme-aware cards, review metadata, all core actions and sheets', async () => {
  const page = await readFile('src/pages/WhatsAppFeed.jsx', 'utf8'),
    card = await readFile('src/components/whatsapp/ThreadCard.jsx', 'utf8'),
    editor = await readFile('src/components/whatsapp/ThreadEditor.jsx', 'utf8')
  for (const text of [
    'Última revisión de Claude',
    'Agregar manual',
    'Todo al día en WhatsApp',
    'groupThreads',
    'feedKPIs',
    'md:grid-cols-2',
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
    'line-clamp-3',
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
