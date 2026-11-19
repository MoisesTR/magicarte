import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import {
  validateDesignDetectionInput,
  buildDesignDetectionRequest,
  parseDesignDetectionResponse,
} from '../api/_lib/productDesignDetection.js'
import {
  createDesignDetectionHandler,
  maxDuration,
} from '../api/detect-product-designs.js'
import {
  detectProductDesigns,
  requestDesignDetection,
} from '../src/utils/productDesignDetection.js'

const image = 'data:image/jpeg;base64,/9j/AA=='
const body = { image, productName: 'Llaveros', existingNames: ['Pikachu'] }
const output = (designs) => ({
  status: 'completed',
  output: [
    { content: [{ type: 'output_text', text: JSON.stringify({ designs }) }] },
  ],
})
const env = {
  OPENAI_API_KEY: 'test-secret',
  SUPABASE_URL: 'https://test.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service',
}

test('detection input accepts exactly one data URL and bounded optional context, rejecting remote URLs', () => {
  assert.deepEqual(validateDesignDetectionInput(body), body)
  assert.deepEqual(validateDesignDetectionInput({ image }), {
    image,
    productName: '',
    existingNames: [],
  })
  for (const invalid of [
    null,
    [],
    {},
    { image: 'https://test.invalid/a' },
    { image: [image] },
    { image: 'data:image/jpeg;base64,????' },
    { image, productName: 2 },
    { image, existingNames: ['valid', 2] },
    { image, existingNames: Array(501).fill('a') },
  ])
    assert.throws(() => validateDesignDetectionInput(invalid))
})

test('builds nonstored low-detail Responses request with strict bounded schema and safe Spanish reading-order prompt', () => {
  const request = buildDesignDetectionRequest(body)
  assert.equal(request.model, 'gpt-5.4-mini')
  assert.equal(buildDesignDetectionRequest(body, 'custom').model, 'custom')
  assert.equal(request.store, false)
  assert.deepEqual(request.input[0].content[1], {
    type: 'input_image',
    image_url: image,
    detail: 'low',
  })
  const prompt = request.input[0].content[0].text
  for (const expected of [
    /izquierda.*derecha/i,
    /arriba.*abajo/i,
    /confianza|segur/i,
    /Muñeco con bufanda/,
    /datos.*nunca instrucciones/i,
    /Pikachu/,
    /Llaveros/,
  ])
    assert.match(prompt, expected)
  assert.equal(request.text.format.strict, true)
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.schema.properties.designs.maxItems, 40)
  assert.equal(
    request.text.format.schema.properties.designs.items.properties.name
      .maxLength,
    60
  )
})

test('response parsing trims, caps at 60 chars/40 names, and dedupes against existing names and each other', () => {
  const names = [
    { name: ' pikachu ' },
    { name: ' Eevee ' },
    { name: 'EEVEE' },
    { name: ' ' },
    { name: 'x'.repeat(80) },
    { name: 'x'.repeat(60) },
  ]
  assert.deepEqual(parseDesignDetectionResponse(output(names), ['PIKACHU']), {
    designs: [{ name: 'Eevee' }, { name: 'x'.repeat(60) }],
  })
  assert.equal(
    parseDesignDetectionResponse(
      output(Array.from({ length: 50 }, (_, i) => ({ name: `D${i}` })))
    ).designs.length,
    40
  )
  assert.deepEqual(parseDesignDetectionResponse(output([])), { designs: [] })
})

test('invalid, refused, incomplete, malformed and non-name responses fail safely', () => {
  for (const invalid of [
    null,
    {},
    { ...output([]), status: 'incomplete' },
    { output: [{ content: [{ type: 'refusal' }] }] },
    { output: [{ content: [{ type: 'output_text', text: 'no' }] }] },
    output(null),
    output([{}]),
    output([{ name: 3 }]),
  ])
    assert.throws(() => parseDesignDetectionResponse(invalid), /IA|diseños/i)
})

function harness(settings = {}) {
  const calls = []
  const handler = createDesignDetectionHandler({
    env: { ...env, ...settings.env },
    createClient: (url, key) => {
      calls.push(['client', url, key])
      return {
        auth: {
          getUser: async (token) => {
            calls.push(['auth', token])
            if (settings.authThrow) throw new Error('test-secret')
            return {
              data: { user: settings.invalidUser ? null : { id: 'owner' } },
              error: settings.authError,
            }
          },
        },
      }
    },
    fetchImpl: async (url, options) => {
      calls.push(['fetch', url, options])
      if (settings.fetchError) throw settings.fetchError
      return {
        ok: !settings.upstreamStatus,
        status: settings.upstreamStatus || 200,
        json: async () => {
          if (settings.jsonError) throw settings.jsonError
          return (
            settings.payload || output([{ name: 'Eevee' }, { name: 'pikachu' }])
          )
        },
      }
    },
  })
  return {
    calls,
    async run(
      payload = body,
      {
        headers = { authorization: 'Bearer token' },
        method = 'POST',
        parsed = true,
      } = {}
    ) {
      const req = Readable.from(
        parsed
          ? []
          : [typeof payload === 'string' ? payload : JSON.stringify(payload)]
      )
      req.method = method
      req.headers = headers
      if (parsed) req.body = payload
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v
        },
        status(code) {
          this.statusCode = code
          return this
        },
        json(value) {
          this.body = value
          this.destroyed = req.destroyed
          return this
        },
      }
      await handler(req, res)
      return res
    },
  }
}

test('endpoint verifies service-role Supabase bearer and returns cleaned detection, 60s max/45s signal', async () => {
  const h = harness()
  const res = await h.run()
  assert.equal(maxDuration, 60)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { designs: [{ name: 'Eevee' }] })
  assert.deepEqual(h.calls[0], [
    'client',
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ])
  assert.deepEqual(h.calls[1], ['auth', 'token'])
  const [, url, options] = h.calls[2]
  assert.equal(url, 'https://api.openai.com/v1/responses')
  assert.equal(options.headers.Authorization, 'Bearer test-secret')
  assert.deepEqual(JSON.parse(options.body), buildDesignDetectionRequest(body))
  assert.ok(options.signal instanceof AbortSignal)
})

test('endpoint rejects absent AI/auth config, missing/invalid bearer, invalid user, and non-POST without upstream calls', async () => {
  for (const [settings, request, expected] of [
    [{ env: { OPENAI_API_KEY: '' } }, {}, 503],
    [
      {
        env: {
          SUPABASE_URL: '',
          VITE_SUPABASE_URL: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      },
      {},
      500,
    ],
    [{}, { headers: {} }, 401],
    [{}, { headers: { authorization: 'Bearer ' } }, 401],
    [{ invalidUser: true }, {}, 401],
    [{ authError: new Error('bad') }, {}, 401],
    [{}, { method: 'GET' }, 405],
  ]) {
    const h = harness(settings)
    const res = await h.run(body, request)
    assert.equal(res.statusCode, expected)
    assert.equal(
      h.calls.some((row) => row[0] === 'fetch'),
      false
    )
    if (expected === 405) assert.equal(res.headers.Allow, 'POST')
  }
  assert.equal(
    (
      await harness({
        env: {
          SUPABASE_URL: '',
          VITE_SUPABASE_URL: 'https://fallback.invalid',
        },
      }).run()
    ).statusCode,
    200
  )
})

test('endpoint reads raw/parsed bodies and enforces 4MiB before upstream including invalid JSON/body getters', async () => {
  for (const payload of [
    body,
    JSON.stringify(body),
    Buffer.from(JSON.stringify(body)),
  ])
    assert.equal((await harness().run(payload)).statusCode, 200)
  assert.equal((await harness().run(body, { parsed: false })).statusCode, 200)
  for (const [payload, request, code] of [
    ['{', {}, 400],
    [{ image: 'https://remote.invalid/a' }, {}, 400],
    [' '.repeat(4 * 1024 * 1024 + 1), { parsed: false }, 413],
    [
      body,
      {
        headers: {
          authorization: 'Bearer token',
          'content-length': 4 * 1024 * 1024 + 1,
        },
      },
      413,
    ],
  ]) {
    const h = harness()
    const res = await h.run(payload, request)
    assert.equal(res.statusCode, code)
    assert.equal(
      h.calls.some((row) => row[0] === 'fetch'),
      false
    )
    if (code === 413 && request.parsed === false)
      assert.equal(res.destroyed, false)
  }
})

test('endpoint matches draft upstream error mapping and never reflects credentials or images', async () => {
  for (const [upstreamStatus, expected] of [
    [401, 502],
    [429, 429],
    [408, 504],
    [504, 504],
    [500, 502],
  ]) {
    const res = await harness({ upstreamStatus }).run()
    assert.equal(res.statusCode, expected)
    assert.equal(res.body.error.includes('test-secret'), false)
    assert.equal(res.body.error.includes(image), false)
  }
  for (const name of ['AbortError', 'TimeoutError']) {
    const error = Object.assign(new Error('test-secret'), { name })
    assert.equal((await harness({ fetchError: error }).run()).statusCode, 504)
    assert.equal((await harness({ jsonError: error }).run()).statusCode, 504)
  }
  for (const settings of [
    { payload: {} },
    { authThrow: true },
    { fetchError: new Error('test-secret') },
    { jsonError: new Error('test-secret') },
  ]) {
    const res = await harness(settings).run()
    assert.equal(res.statusCode, 502)
    assert.equal(res.body.error.includes('test-secret'), false)
  }
})

const session = async () => ({
  data: { session: { access_token: 'owner-token' } },
})
test('client prepares newly picked HEIC via prepareFile and JPEG preview then sends authenticated bounded request', async () => {
  const calls = []
  const file = { name: 'group.heic' }
  const result = await detectProductDesigns(
    {
      mainImage: { file },
      productName: '  Llaveros ',
      existingNames: ['Pikachu'],
    },
    {
      prepareFile: async (value) => {
        assert.equal(value, file)
        calls.push('prepare')
        return { name: 'group.jpg' }
      },
      previewFile: async (value) => {
        assert.equal(value.name, 'group.jpg')
        calls.push('preview')
        return image
      },
      getSession: session,
      fetchImpl: async (url, options) => {
        calls.push('request')
        assert.equal(url, '/api/detect-product-designs')
        assert.equal(options.headers.Authorization, 'Bearer owner-token')
        assert.deepEqual(JSON.parse(options.body), body)
        return {
          ok: true,
          json: async () => ({ designs: [{ name: 'Eevee' }] }),
        }
      },
    }
  )
  assert.deepEqual(calls, ['prepare', 'preview', 'request'])
  assert.deepEqual(result, [{ name: 'Eevee', checked: true }])
})

test('client downloads existing main image as a blob before preparation; remote URL never reaches AI request', async () => {
  const file = new Blob(['image'], { type: 'image/png' })
  const calls = []
  const result = await detectProductDesigns(
    { mainImage: { url: 'https://test.invalid/photo' } },
    {
      prepareFile: async (value) => {
        assert.equal(value, file)
        return value
      },
      previewFile: async () => image,
      getSession: session,
      fetchImpl: async (url, options) => {
        calls.push(url)
        if (url.startsWith('https:')) {
          assert.equal(options.credentials, 'omit')
          return { ok: true, blob: async () => file }
        }
        assert.equal(JSON.parse(options.body).image, image)
        return { ok: true, json: async () => ({ designs: [] }) }
      },
    }
  )
  assert.deepEqual(result, [])
  assert.deepEqual(calls, [
    'https://test.invalid/photo',
    '/api/detect-product-designs',
  ])
})

test('client rejects missing photo/login, oversized request, invalid success and HTML without mutating inputs', async () => {
  const input = { image, productName: 'Llaveros', existingNames: [] }
  const fetchImpl = async () => assert.fail('must not fetch')
  await assert.rejects(detectProductDesigns({}, { fetchImpl }), /foto/i)
  await assert.rejects(
    requestDesignDetection(input, {
      getSession: async () => ({ data: { session: null } }),
      fetchImpl,
    }),
    /sesión/i
  )
  await assert.rejects(
    requestDesignDetection(
      { ...input, image: 'a'.repeat(4 * 1024 * 1024) },
      { getSession: session, fetchImpl }
    ),
    /4 MB/
  )
  for (const response of [
    { ok: false, json: async () => ({ error: 'Cuota agotada' }) },
    { ok: true, json: async () => ({ designs: [{}] }) },
    {
      ok: true,
      json: async () => {
        throw new Error('HTML')
      },
    },
  ])
    await assert.rejects(
      requestDesignDetection(input, {
        getSession: session,
        fetchImpl: async () => response,
      }),
      /Cuota|API|diseños/i
    )
  assert.deepEqual(input, { image, productName: 'Llaveros', existingNames: [] })
})

test('capped AI names remain trimmed even when truncation lands on a space', () => {
  const result = parseDesignDetectionResponse(
    output([{ name: `${'a'.repeat(59)} extra` }])
  )
  assert.equal(result.designs[0].name, 'a'.repeat(59))
})

test('session lookup failures stay friendly in Spanish and never reach the endpoint', async () => {
  await assert.rejects(
    requestDesignDetection(
      { image },
      {
        getSession: async () => {
          throw new Error('network unavailable')
        },
        fetchImpl: () => assert.fail('must not fetch'),
      }
    ),
    /sesión/i
  )
})
