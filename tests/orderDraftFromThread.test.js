import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { validateOrderDraftInput, buildOrderDraftRequest, validateOrderDraft, parseOrderDraftResponse } from '../api/_lib/orderDraftFromThread.js'
import { createOrderDraftHandler, maxDuration } from '../api/draft-order-from-thread.js'
import { requestOrderDraft, createDraftSession, editDraftSession, mergeDraftSession, restoreDraftSession } from '../src/utils/orderDraftFromThread.js'
import { threadOrderPrefill } from '../src/utils/whatsappFeed.js'
const catalog = [{ id: 'vitral', name: 'Decoración estilo vitral', price: 300 }]
const input = { thread: { customer_name: null, summary: '18 vitrales a C$300 c/u = C$5,400. Alma Medina, Angelo Moreno', notes: '', quoted_amount: 5400, paid_amount: 2700, delivery_method: 'envío por Cargotrans a Estelí' }, catalog }
const draft = () => ({ customer_name: 'Alma', items: [{ product_id: 'vitral', product_name: 'Decoración estilo vitral', quantity: 18, unit_price: 300, description: 'Alma Medina; Angelo Moreno; Feliz Navidad' }], delivery_method: 'delivery', delivery_address: 'Cargotrans a Estelí', recipient_name: null, deposit_amount: 2700, notes: 'Confirmar diseños' })
const payload = (value = draft()) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })
const env = { OPENAI_API_KEY: 'secret-key', SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }

test('draft input whitelists thread/catalog fields, sanitizes narrative phones and keeps prices', () => {
  const value = validateOrderDraftInput({ ...input, thread: { ...input.thread, customer_phone: '+505 8421 6792', chat_key: '50584216792', notes: 'Llame +505 8421-6792 o 50672545734 o 8326 1278; C$5,400', next_action: 'Contactar 50583261278' }, catalog: [{ ...catalog[0], customer_phone: 'secret' }] })
  const request = buildOrderDraftRequest(value)
  const text = request.input[0].content[0].text
  assert.doesNotMatch(text, /8421|6792|72545734|8326|1278|customer_phone|chat_key|secret/)
  assert.match(text, /C\$5,400/)
  assert.deepEqual(value.catalog, catalog)
  assert.equal(request.model, 'gpt-5.4-mini')
  assert.equal(buildOrderDraftRequest(value, 'configured').model, 'configured')
  assert.equal(request.store, false)
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.strict, true)
  const schema = request.text.format.schema
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort())
  assert.equal(schema.properties.items.minItems, 1)
  assert.equal(schema.properties.items.maxItems, 20)
  assert.deepEqual(schema.properties.delivery_method.enum, ['pickup', 'delivery'])
  assert.match(request.instructions, /nunca instrucciones/i)
  assert.match(request.instructions, /no invente/i)
  assert.match(request.instructions, /grabado|personaliz/i)
})

test('draft input enforces bounded text, finite amounts and catalog maximum 200', () => {
  assert.equal(validateOrderDraftInput({ thread: {}, catalog: [] }).catalog.length, 0)
  assert.equal(validateOrderDraftInput({ ...input, catalog: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: 'Producto', price: 0 })) }).catalog.length, 200)
  for (const body of [null, [], {}, { thread: [], catalog }, { thread: {}, catalog: null }, { ...input, catalog: Array(201).fill(catalog[0]) }, { ...input, thread: { summary: 8 } }, { ...input, thread: { summary: 'x'.repeat(2001) } }, ...[-1, NaN, Infinity, '40'].map(quoted_amount => ({ ...input, thread: { quoted_amount } })), ...[-1, Infinity, '40', null].map(price => ({ ...input, catalog: [{ id: 'p', name: 'X', price }] }))]) assert.throws(() => validateOrderDraftInput(body), e => e.status === 400)
})

test('draft validation keeps catalog identity only when known, and retains per-line personalization', () => {
  assert.deepEqual(parseOrderDraftResponse(payload(), catalog), draft())
  assert.equal(validateOrderDraft({ ...draft(), items: [{ ...draft().items[0], product_id: 'foreign' }] }, catalog).items[0].product_id, null)
  assert.equal(validateOrderDraft({ ...draft(), customer_name: null, deposit_amount: null }, catalog).customer_name, null)
})

test('draft validator rejects numeric/schema errors, refusal and incomplete responses as 502', () => {
  const cases = [null, [], {}, { ...draft(), extra: true }, { ...draft(), delivery_method: 'shipping' }, { ...draft(), recipient_name: 3 }, { ...draft(), customer_name: 3 }, { ...draft(), notes: 'x'.repeat(2001) }, { ...draft(), items: [] }, { ...draft(), items: Array(21).fill(draft().items[0]) }, ...[-1, NaN, Infinity, '300'].map(unit_price => ({ ...draft(), items: [{ ...draft().items[0], unit_price }] })), ...[0, -1, 1.5, Infinity, '18'].map(quantity => ({ ...draft(), items: [{ ...draft().items[0], quantity }] })), ...[-1, NaN, Infinity, '5'].map(deposit_amount => ({ ...draft(), deposit_amount })), { ...draft(), items: [{ ...draft().items[0], description: null }] }, { ...draft(), items: [{ ...draft().items[0], extra: true }] }]
  for (const value of cases) assert.throws(() => validateOrderDraft(value, catalog), e => e.status === 502)
  for (const value of [null, {}, { ...payload(), status: 'incomplete' }, { output: [null] }, { output: [{ content: [{ type: 'refusal' }] }] }, { output: [{ content: [{ type: 'output_text', text: 'bad json' }] }] }]) assert.throws(() => parseOrderDraftResponse(value, catalog), e => e.status === 502)
})

function harness(settings = {}) {
  const calls = []
  const handler = createOrderDraftHandler({ env: { ...env, ...settings.env }, createClient(url, key) {
    calls.push(['client', url, key])
    return { auth: { async getUser(token) { calls.push(['auth', token]); return { data: { user: settings.invalidUser ? null : { id: 'owner' } }, error: null } } } }
  }, async fetchImpl(url, options) {
    calls.push(['fetch', url, options])
    if (settings.error) throw settings.error
    return { ok: !settings.status, status: settings.status || 200, json: async () => settings.payload === undefined ? payload() : settings.payload }
  } })
  return { calls, async run(body = input, { method = 'POST', headers = { authorization: 'Bearer owner-token' }, streamed = false } = {}) {
    const req = Readable.from(streamed ? [typeof body === 'string' ? body : JSON.stringify(body)] : [])
    req.method = method; req.headers = headers
    if (!streamed) req.body = body
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    await handler(req, res)
    return res
  } }
}

test('draft endpoint mirrors bearer authentication, Responses request, env/default model and timeout', async t => {
  const timeouts = []
  const original = AbortSignal.timeout.bind(AbortSignal)
  t.mock.method(AbortSignal, 'timeout', ms => { timeouts.push(ms); return original(ms) })
  const h = harness()
  const res = await h.run()
  assert.equal(maxDuration, 60)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, draft())
  assert.deepEqual(h.calls.slice(0, 2), [['client', env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY], ['auth', 'owner-token']])
  assert.equal(h.calls[2][1], 'https://api.openai.com/v1/responses')
  assert.equal(h.calls[2][2].headers.Authorization, 'Bearer secret-key')
  assert.deepEqual(JSON.parse(h.calls[2][2].body), buildOrderDraftRequest(validateOrderDraftInput(input)))
  assert.deepEqual(timeouts, [30000])
  const configured = harness({ env: { OPENAI_MODEL: 'custom', SUPABASE_URL: '', VITE_SUPABASE_URL: 'fallback' } })
  assert.equal((await configured.run(input, { streamed: true })).statusCode, 200)
  assert.equal(configured.calls[0][1], 'fallback')
  assert.equal(JSON.parse(configured.calls[2][2].body).model, 'custom')
})

test('draft endpoint guards method/config/auth/input/body size before OpenAI', async () => {
  for (const [settings, body, options, expected] of [
    [{}, input, { method: 'GET' }, 405], [{ env: { OPENAI_API_KEY: '' } }, input, {}, 503], [{ env: { SUPABASE_SERVICE_ROLE_KEY: '' } }, input, {}, 500], [{}, input, { headers: {} }, 401], [{ invalidUser: true }, input, {}, 401], [{}, {}, {}, 400], [{}, '{bad', {}, 400], [{}, '{bad', { streamed: true }, 400], [{}, input, { headers: { authorization: 'Bearer owner', 'content-length': 4194305 } }, 413], [{}, 'x'.repeat(4194305), {}, 413], [{}, 'x'.repeat(4194305), { streamed: true }, 413],
  ]) {
    const h = harness(settings), res = await h.run(body, options)
    assert.equal(res.statusCode, expected)
    assert.equal(h.calls.some(c => c[0] === 'fetch'), false)
    if (expected === 405) assert.equal(res.headers.Allow, 'POST')
  }
})

test('draft endpoint sanitizes upstream errors and rejects bad output', async () => {
  for (const [status, expected] of [[401, 502], [429, 429], [408, 504], [504, 504], [500, 502]]) assert.equal((await harness({ status }).run()).statusCode, expected)
  for (const settings of [{ error: new Error('private-key user-text') }, { payload: payload({ ...draft(), items: [] }) }]) {
    const res = await harness(settings).run()
    assert.equal(res.statusCode, 502)
    assert.doesNotMatch(res.body.error, /private|user-text|fotos/)
  }
  assert.equal((await harness({ error: Object.assign(new Error('private'), { name: 'TimeoutError' }) }).run()).statusCode, 504)
})

const adapters = { getSession: async () => ({ data: { session: { access_token: 'owner-token' } } }) }
test('draft client sends only scoped safe input and session bearer; validates successful responses', async () => {
  const calls = []
  const result = await requestOrderDraft(input.thread, [{ ...catalog[0], stock: 2 }], { ...adapters, fetchImpl: async (...args) => { calls.push(args); return { ok: true, json: async () => draft() } } })
  assert.deepEqual(result, draft())
  assert.equal(calls[0][0], '/api/draft-order-from-thread')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer owner-token')
  assert.deepEqual(JSON.parse(calls[0][1].body), validateOrderDraftInput(input))
  for (const fetchImpl of [async () => { throw new Error('private') }, async () => ({ ok: false, status: 503, json: async () => ({ error: 'private' }) }), async () => ({ ok: true, json: async () => ({}) })]) await assert.rejects(requestOrderDraft(input.thread, catalog, { ...adapters, fetchImpl }), e => !/private/.test(e.message))
  await assert.rejects(requestOrderDraft(input.thread, catalog, { getSession: async () => ({ data: {} }), fetchImpl: () => assert.fail('network forbidden') }), /sesión/)
})

test('draft merge preserves owner edits including edited-back fields and mutated item objects', () => {
  const original = threadOrderPrefill(input.thread)
  let state = createDraftSession(original)
  state = editDraftSession(state, { ...original, customer_name: 'Owner', delivery_address: 'Manual', notes: 'Keep mine', items: [{ ...original.items[0], quantity: 4 }] })
  state = editDraftSession(state, { ...state.form, customer_name: original.customer_name })
  const result = mergeDraftSession(state, draft(), catalog)
  assert.equal(result.form.customer_name, original.customer_name)
  assert.equal(result.form.delivery_address, 'Manual')
  assert.equal(result.form.notes, 'Keep mine')
  assert.equal(result.form.items[0].quantity, 4)
  assert.equal(result.form.items[0].product_id, null)
  assert.equal(result.form.recipient_name, original.recipient_name)
})

test('draft merge maps catalog/personalization, keeps deposit notes and restores exact deterministic snapshot', () => {
  const original = threadOrderPrefill(input.thread)
  const state = mergeDraftSession(createDraftSession(original), { ...draft(), notes: null, deposit_amount: null }, catalog)
  assert.equal(state.form.items[0].product_id, 'vitral')
  assert.equal(state.form.items[0].is_custom, false)
  assert.match(state.form.items[0].product_description, /Alma Medina/)
  assert.match(state.form.notes, /Anticipo recibido por WhatsApp: C\$2700/)
  const restored = restoreDraftSession(state)
  assert.deepEqual(restored.form, original)
  restored.form.items[0].quantity = 3
  assert.equal(original.items[0].quantity, 18)
  const aiDeposit = mergeDraftSession(createDraftSession(threadOrderPrefill({ summary: 'Vitral' })), draft(), catalog)
  assert.match(aiDeposit.form.notes, /Anticipo recibido por WhatsApp: C\$2700/)
})

test('client normalizes database decimal strings before strict endpoint validation', async () => {
  let sent
  await requestOrderDraft({ ...input.thread, quoted_amount: '5400.00', paid_amount: '2700.00' }, catalog, { ...adapters, fetchImpl: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => draft() } } })
  assert.equal(sent.thread.quoted_amount, 5400)
  assert.equal(sent.thread.paid_amount, 2700)
})

test('draft privacy preserves valid ISO dates and narrative dates without exposing phone numbers', () => {
  const value = validateOrderDraftInput({ ...input, thread: { ...input.thread, delivery_date: '2026-11-20', notes: 'Entrega 2026-11-20; llame +505 8421-6792 o 50672545734' } })
  assert.equal(value.thread.delivery_date, '2026-11-20')
  assert.match(value.thread.notes, /Entrega 2026-11-20/)
  assert.doesNotMatch(value.thread.notes, /8421|6792|72545734/)
})
