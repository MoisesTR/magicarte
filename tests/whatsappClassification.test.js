import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { AI_TAGS } from '../src/utils/whatsappTags.js'
import {
  validateClassifyInput,
  buildClassifyRequest,
  parseClassifyResponse,
} from '../api/_lib/whatsappClassification.js'
import {
  createClassifyHandler,
  maxDuration,
} from '../api/classify-whatsapp-thread.js'
import { requestThreadClassification } from '../src/utils/whatsappClassification.js'
const input = {
  thread: {
    summary: 'Le escribimos; dar seguimiento hoy.',
    status: 'sent',
    kind: 'quote',
    follow_up_date: '2026-11-19',
    awaiting_reply: false,
  },
}
const classification = {
  tag: 'follow_up',
  reason: 'Solo se planea volver a escribir al cliente.',
}
const output = (value = classification) => ({
  status: 'completed',
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
})
const env = {
  OPENAI_API_KEY: 'private-key',
  SUPABASE_URL: 'https://test.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'private-service',
}
function harness(settings = {}) {
  const calls = []
  const handler = createClassifyHandler({
    env: { ...env, ...settings.env },
    createClient(url, key) {
      calls.push(['client', url, key])
      return {
        auth: {
          async getUser(token) {
            calls.push(['auth', token])
            if (settings.authThrow) throw Error('private')
            return {
              data: { user: settings.invalidUser ? null : { id: 'owner' } },
              error: settings.authError,
            }
          },
        },
      }
    },
    async fetchImpl(url, options) {
      calls.push(['fetch', url, options])
      if (settings.fetchError) throw settings.fetchError
      return {
        ok: !settings.status,
        status: settings.status || 200,
        async json() {
          if (settings.jsonError) throw settings.jsonError
          return settings.payload === undefined ? output() : settings.payload
        },
      }
    },
  })
  return {
    calls,
    async run(
      body = input,
      {
        method = 'POST',
        headers = { authorization: 'Bearer token' },
        stream = false,
      } = {}
    ) {
      const req = Readable.from(
        stream ? [typeof body === 'string' ? body : JSON.stringify(body)] : []
      )
      req.method = method
      req.headers = headers
      if (!stream) req.body = body
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v
        },
        status(code) {
          this.statusCode = code
          return this
        },
        json(body) {
          this.body = body
          return this
        },
      }
      await handler(req, res)
      return res
    },
  }
}
test('classification allowlists exactly the minimal thread context without names/phones or mutation', () => {
  const body = {
    thread: {
      ...input.thread,
      summary: ' Texto ',
      customer_name: 'Private name',
      customer_phone: '50588887777',
      chat_key: 'secret',
      notes: 'secret',
      extra: 'secret',
    },
  }
  const normalized = validateClassifyInput(body)
  assert.deepEqual(Object.keys(normalized.thread), [
    'summary',
    'next_action',
    'status',
    'kind',
    'promised_date',
    'promise_source',
    'follow_up_date',
    'awaiting_reply',
    'last_customer_message_at',
    'last_our_message_at',
    'quoted_amount',
    'paid_amount',
    'delivery_date',
  ])
  assert.equal(normalized.thread.summary, 'Texto')
  assert.equal(body.thread.summary, ' Texto ')
  assert.doesNotMatch(JSON.stringify(normalized), /Private|50588887777|secret/)
})
test('classification validates bounded text, enums, boolean, dates, timestamps and finite nonnegative amounts', () => {
  const bad = [
    null,
    [],
    {},
    { thread: [] },
    ...[null, '', ' ', 2, 'x'.repeat(2001)].map((summary) => ({
      thread: { ...input.thread, summary },
    })),
    ...[
      { status: 'bad' },
      { kind: 'bad' },
      { next_action: 4 },
      { promise_source: 'x'.repeat(2001) },
      { awaiting_reply: 'false' },
      { promised_date: '2026-02-30' },
      { follow_up_date: '20/11/2026' },
      { delivery_date: 'bad' },
      { last_customer_message_at: '2026-11-19' },
      { last_our_message_at: 'bad' },
      { quoted_amount: -1 },
      { paid_amount: Infinity },
    ].map((fields) => ({ thread: { ...input.thread, ...fields } })),
  ]
  for (const body of bad)
    assert.throws(
      () => validateClassifyInput(body),
      (e) => e.status === 400
    )
  assert.equal(
    validateClassifyInput({
      thread: { summary: 'x'.repeat(2000), paid_amount: 0 },
    }).thread.summary.length,
    2000
  )
})
test('strict nonstored Responses request distinguishes actual dated promises from internal follow-ups', () => {
  const normalized = validateClassifyInput(input),
    request = buildClassifyRequest(normalized)
  assert.equal(request.model, 'gpt-5.4-mini')
  assert.equal(request.store, false)
  assert.equal(buildClassifyRequest(normalized, 'custom').model, 'custom')
  assert.deepEqual(JSON.parse(request.input[0].content[0].text), normalized)
  for (const rule of [
    /promised/,
    /follow_up/,
    /NOSOTROS/,
    /fecha/,
    /cliente/,
    /nunca instrucciones/,
    /español/,
    /oración/,
  ])
    assert.match(request.instructions, rule)
  assert.equal(request.text.format.strict, true)
  assert.deepEqual(
    request.text.format.schema.properties.tag.enum,
    Object.keys(AI_TAGS)
  )
  assert.deepEqual(request.text.format.schema.required, ['tag', 'reason'])
})
test('parser accepts all catalog tags, trims short reasons, rejects unknown/malformed/refused/incomplete output', () => {
  for (const tag of Object.keys(AI_TAGS))
    assert.deepEqual(
      parseClassifyResponse(output({ tag, reason: ' Razón breve. ' })),
      { tag, reason: 'Razón breve.' }
    )
  for (const payload of [
    null,
    {},
    { ...output(), status: 'incomplete' },
    { output: [null] },
    { output: [{ content: [null] }] },
    { output: [{ content: [{ type: 'refusal' }] }] },
    { output: [{ content: [{ type: 'output_text', text: 'bad JSON' }] }] },
    ...[
      null,
      [],
      {},
      { tag: 'toString', reason: 'Razón.' },
      { ...classification, reason: '' },
      { ...classification, reason: 'x'.repeat(201) },
      { ...classification, reason: 'Una\nOtra' },
      { ...classification, extra: true },
    ].map(output),
  ])
    assert.throws(
      () => parseClassifyResponse(payload),
      (e) => e.status === 502
    )
})
test('endpoint mirrors authenticated service-role request style, fallback env and timeout', async (t) => {
  const times = []
  const original = AbortSignal.timeout.bind(AbortSignal)
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    times.push(ms)
    return original(ms)
  })
  const h = harness({
    env: {
      SUPABASE_URL: undefined,
      VITE_SUPABASE_URL: 'https://fallback.invalid',
      OPENAI_MODEL: 'custom',
    },
  })
  const res = await h.run()
  assert.equal(maxDuration, 60)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, classification)
  assert.deepEqual(h.calls.slice(0, 2), [
    ['client', 'https://fallback.invalid', env.SUPABASE_SERVICE_ROLE_KEY],
    ['auth', 'token'],
  ])
  const [, url, options] = h.calls[2]
  assert.equal(url, 'https://api.openai.com/v1/responses')
  assert.equal(options.headers.Authorization, 'Bearer private-key')
  assert.deepEqual(
    JSON.parse(options.body),
    buildClassifyRequest(validateClassifyInput(input), 'custom')
  )
  assert.deepEqual(times, [30000])
})
test('endpoint enforces method/config/auth before OpenAI and invalid input is 400', async () => {
  for (const [settings, options, expected] of [
    [{}, { method: 'GET' }, 405],
    [{ env: { OPENAI_API_KEY: '' } }, {}, 503],
    [{ env: { SUPABASE_SERVICE_ROLE_KEY: '' } }, {}, 500],
    [{ env: { SUPABASE_URL: '' } }, {}, 500],
    [{}, { headers: {} }, 401],
    [{}, { headers: { authorization: 'Bearer ' } }, 401],
    [{ invalidUser: true }, {}, 401],
    [{ authError: { message: 'private' } }, {}, 401],
    [{ authThrow: true }, {}, 502],
  ]) {
    const h = harness(settings),
      res = await h.run(input, options)
    assert.equal(res.statusCode, expected)
    assert.equal(
      h.calls.some((c) => c[0] === 'fetch'),
      false
    )
    assert.doesNotMatch(JSON.stringify(res.body), /private/)
    if (expected === 405) assert.equal(res.headers.Allow, 'POST')
  }
  const h = harness()
  assert.equal((await h.run({ thread: { summary: '' } })).statusCode, 400)
  assert.equal(h.calls.length, 2)
})
test('endpoint shares 4 MB reader, malformed JSON handling and streamed input', async () => {
  assert.equal((await harness().run(input, { stream: true })).statusCode, 200)
  assert.equal(
    (await harness().run('bad JSON', { stream: true })).statusCode,
    400
  )
  for (const options of [
    {},
    { stream: true },
    {
      headers: {
        authorization: 'Bearer token',
        'content-length': 4 * 1024 * 1024 + 1,
      },
    },
  ]) {
    const h = harness()
    const res = await h.run(
      { thread: { summary: 'x'.repeat(4 * 1024 * 1024) } },
      options
    )
    assert.equal(res.statusCode, 413)
    assert.match(res.body.error, /4 MB/)
    assert.equal(
      h.calls.some((c) => c[0] === 'fetch'),
      false
    )
  }
})
for (const [status, expected] of [
  [401, 502],
  [429, 429],
  [408, 504],
  [504, 504],
  [500, 502],
])
  test(`classification upstream ${status} maps to ${expected}`, async () => {
    const res = await harness({ status }).run()
    assert.equal(res.statusCode, expected)
    assert.doesNotMatch(res.body.error, /private|fotos|producto|mejorar texto/i)
  })
test('endpoint sanitizes network/json failures and maps abort/timeouts consistently', async () => {
  for (const name of ['TimeoutError', 'AbortError'])
    assert.equal(
      (
        await harness({
          fetchError: Object.assign(Error('private'), { name }),
        }).run()
      ).statusCode,
      504
    )
  for (const settings of [
    { fetchError: Error('private') },
    { jsonError: Error('private') },
    { payload: output({ tag: 'bad', reason: 'Razón.' }) },
  ]) {
    const res = await harness(settings).run()
    assert.equal(res.statusCode, 502)
    assert.doesNotMatch(JSON.stringify(res.body), /private/)
  }
})
const auth = {
  getSession: async () => ({ data: { session: { access_token: 'token' } } }),
}
test('client forwards only allowlisted fields with session bearer and validates response', async () => {
  const calls = []
  const result = await requestThreadClassification(
    {
      ...input.thread,
      customer_name: 'Private',
      customer_phone: '50588887777',
    },
    {
      ...auth,
      fetchImpl: async (...args) => {
        calls.push(args)
        return { ok: true, json: async () => classification }
      },
    }
  )
  assert.deepEqual(result, classification)
  assert.equal(calls[0][0], '/api/classify-whatsapp-thread')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer token')
  assert.deepEqual(JSON.parse(calls[0][1].body), validateClassifyInput(input))
})
test('client validates before fetch and sanitizes auth/network/status/schema failures', async () => {
  const never = () => assert.fail('network forbidden')
  await assert.rejects(
    requestThreadClassification({ summary: '' }, { ...auth, fetchImpl: never })
  )
  for (const getSession of [
    async () => ({ data: { session: null } }),
    async () => {
      throw Error('private')
    },
  ])
    await assert.rejects(
      requestThreadClassification(input.thread, {
        getSession,
        fetchImpl: never,
      }),
      /sesión/
    )
  for (const fetchImpl of [
    async () => {
      throw Error('private')
    },
    ...[401, 429, 503, 504, 502].map((status) => async () => ({
      ok: false,
      status,
      json: async () => ({ error: 'private' }),
    })),
    async () => ({
      ok: true,
      json: async () => {
        throw Error('private')
      },
    }),
    async () => ({
      ok: true,
      json: async () => ({ tag: 'unknown', reason: 'bad' }),
    }),
  ]) {
    await assert.rejects(
      requestThreadClassification(input.thread, { ...auth, fetchImpl }),
      (e) => !/private/.test(e.message) && /IA|sesión|clasifica/.test(e.message)
    )
  }
})

test('classification accepts numeric strings returned by Postgres numeric columns', () => {
  const input = validateClassifyInput({
    thread: {
      summary: 'Pidió 10 esferas',
      quoted_amount: '1400.00',
      paid_amount: '0.00',
    },
  })
  assert.equal((input.thread ?? input).quoted_amount, 1400)
  assert.equal((input.thread ?? input).paid_amount, 0)
  assert.throws(() =>
    validateClassifyInput({ thread: { summary: 'x', paid_amount: 'abc' } })
  )
  assert.throws(() =>
    validateClassifyInput({ thread: { summary: 'x', paid_amount: '-5' } })
  )
})
