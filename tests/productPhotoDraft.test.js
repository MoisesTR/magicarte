import test from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { buildDraftRequest, validateDraftInput, parseDraftResponse, MAX_BODY_BYTES } from '../api/_lib/productPhotoDraft.js'
import { createDraftHandler } from '../api/draft-product-from-photos.js'
import { createImagePreview, prepareDraftImages, requestPhotoDraft, photoDraftForm, createPhotoDraft } from '../src/utils/productPhotoDraft.js'

const image = 'data:image/jpeg;base64,/9j/AA=='
const categories = [{ id: 'gift', name: 'Regalos' }]
const body = { images: [image], note: 'acrílico, 15 cm', categories }
const draft = { name: 'Detalle floral', description: 'Un detalle especial. Flores que decoran con cariño.', categoryId: 'gift', materialTechnique: null, careInstructions: null, lengthCm: null, widthCm: null }
const output = (value = draft) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })

test('validates bounded image data URLs, notes and categories without changing inputs', () => {
  assert.deepEqual(validateDraftInput(body), body)
  for (const images of [[], Array(7).fill(image), ['https://example.com/a.jpg'], ['data:text/plain;base64,AAAA'], ['data:image/jpeg;base64,???']]) {
    assert.throws(() => validateDraftInput({ ...body, images }), /foto|imagen/i)
  }
  assert.throws(() => validateDraftInput({ ...body, note: {} }), /nota/i)
  assert.throws(() => validateDraftInput({ ...body, categories: [{ id: 'x' }] }), /categor/i)
})

test('builds Responses structured output with low-detail images and grounded Spanish instructions', () => {
  const request = buildDraftRequest(body)
  assert.equal(request.model, 'gpt-5.4-mini')
  assert.equal(buildDraftRequest(body, 'custom-model').model, 'custom-model')
  assert.deepEqual(request.input[0].content[1], { type: 'input_image', image_url: image, detail: 'low' })
  const instructions = request.input[0].content[0]
  assert.equal(instructions.type, 'input_text')
  for (const text of ['Nicaragua', 'Magic Arte', 'láser', 'UV', '3D', '2 a 4', 'visibles', 'acrílico, 15 cm', 'Regalos', 'gift']) assert.ok(instructions.text.includes(text), text)
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.strict, true)
  assert.equal(request.text.format.schema.additionalProperties, false)
  assert.deepEqual(request.text.format.schema.required, ['name', 'description', 'categoryId', 'materialTechnique', 'careInstructions', 'lengthCm', 'widthCm'])
  assert.deepEqual(request.text.format.schema.properties.categoryId.type, ['string', 'null'])
  assert.equal(request.store, false)
})

test('parses Responses text, trims fields, caps lengths and rejects unknown category ids', () => {
  assert.deepEqual(parseDraftResponse(output(), categories), draft)
  const normalized = parseDraftResponse(output({ name: ` ${'n'.repeat(90)} `, description: ` ${'d'.repeat(900)} `, categoryId: 'invented' }), categories)
  assert.equal(normalized.name.length, 80)
  assert.equal(normalized.description.length, 800)
  assert.equal(normalized.categoryId, null)
  assert.equal(parseDraftResponse(output({ ...draft, categoryId: null }), categories).categoryId, null)
})

test('rejects empty, malformed, refused and incomplete Responses instead of opening a false success', () => {
  for (const payload of [null, {}, { ...output(), status: 'incomplete' }, output({ name: '', description: 'ok', categoryId: null }), output({ ...draft, description: 2 }), { output: [{ content: [{ type: 'refusal', refusal: 'no' }] }] }, { output: [{ content: [{ type: 'output_text', text: 'not json' }] }] }]) {
    assert.throws(() => parseDraftResponse(payload, categories), /IA|respuesta|borrador/i)
  }
})

function harness({ env = {}, user = { id: 'owner' }, authError = null, upstreamStatus = 200, upstreamPayload = output(), fetchError, upstreamJsonError } = {}) {
  const calls = []
  const handler = createDraftHandler({
    env: { OPENAI_API_KEY: 'test-secret', SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service-secret', ...env },
    createClient: (url, key) => {
      calls.push(['client', url, key])
      return { auth: { getUser: async (token) => { calls.push(['auth', token]); return { data: { user }, error: authError } } } }
    },
    fetchImpl: async (url, options) => {
      calls.push(['fetch', url, options])
      if (fetchError) throw fetchError
      return { ok: upstreamStatus === 200, status: upstreamStatus, json: async () => { if (upstreamJsonError) throw upstreamJsonError; return upstreamPayload } }
    },
  })
  const run = async (payload = body, headers = { authorization: 'Bearer session-token' }, method = 'POST', parsedBody) => {
    const req = Readable.from(parsedBody === undefined ? [typeof payload === 'string' ? payload : JSON.stringify(payload)] : [])
    if (parsedBody !== undefined) req.body = parsedBody
    req.method = method
    req.headers = headers
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; this.requestDestroyed = req.destroyed; return this } }
    await handler(req, res)
    return res
  }
  return { run, calls }
}

test('endpoint authenticates Supabase bearer token and calls only Responses API', async () => {
  const { run, calls } = harness()
  const res = await run()
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, draft)
  assert.deepEqual(calls[1], ['auth', 'session-token'])
  const [, url, options] = calls.find(call => call[0] === 'fetch')
  assert.equal(url, 'https://api.openai.com/v1/responses')
  assert.equal(options.headers.Authorization, 'Bearer test-secret')
  assert.deepEqual(JSON.parse(options.body), buildDraftRequest(body))
  assert.ok(options.signal instanceof AbortSignal)
})

test('endpoint fails closed for missing configuration, bearer token and invalid Supabase user', async () => {
  const missing = await harness({ env: { OPENAI_API_KEY: '' } }).run()
  assert.equal(missing.statusCode, 503)
  assert.deepEqual(missing.body, { error: 'La IA no está configurada (falta OPENAI_API_KEY en Vercel).' })
  for (const settings of [{ user: null }, { authError: new Error('bad') }]) {
    const h = harness(settings)
    assert.equal((await h.run()).statusCode, 401)
    assert.equal(h.calls.some(call => call[0] === 'fetch'), false)
  }
  const h = harness()
  assert.equal((await h.run(body, {})).statusCode, 401)
  assert.equal((await h.run(body, {}, 'GET')).statusCode, 405)
  assert.equal(h.calls.some(call => call[0] === 'fetch'), false)
})

test('endpoint rejects malformed JSON, oversized bytes, invalid images before OpenAI', async () => {
  for (const [payload, expected] of [['{', 400], [' '.repeat(MAX_BODY_BYTES + 1), 413], [{ ...body, images: Array(7).fill(image) }, 400]]) {
    const h = harness()
    const res = await h.run(payload)
    assert.equal(res.statusCode, expected)
    assert.match(res.body.error, /JSON|4 MB|foto|imagen/i)
    assert.equal(h.calls.some(call => call[0] === 'fetch'), false)
  }
  const h = harness()
  assert.equal((await h.run(body, { authorization: 'Bearer token', 'content-length': String(MAX_BODY_BYTES + 1) })).statusCode, 413)
})

test('endpoint maps upstream errors to safe Spanish errors, never reflecting upstream secrets', async () => {
  for (const [upstreamStatus, expected, pattern] of [[401, 502, /clave.*inválida/i], [429, 429, /cuota|límite/i], [500, 502, /IA/]]) {
    const res = await harness({ upstreamStatus, upstreamPayload: { error: { message: `test-secret ${image}` } } }).run()
    assert.equal(res.statusCode, expected)
    assert.match(res.body.error, pattern)
    assert.equal(res.body.error.includes('test-secret'), false)
    assert.equal(res.body.error.includes(image), false)
  }
  const timeout = new Error('secret')
  timeout.name = 'TimeoutError'
  const res = await harness({ fetchError: timeout }).run()
  assert.equal(res.statusCode, 504)
  assert.match(res.body.error, /tiempo/i)
  assert.equal((await harness({ upstreamPayload: {} }).run()).statusCode, 502)
})

test('AI previews resize longest side to 1024, never upscale, and use JPEG quality 0.8', async () => {
  for (const [width, height, expected] of [[2048, 4096, [512, 1024]], [4096, 2048, [1024, 512]], [100, 50, [100, 50]]]) {
    const calls = []
    const canvas = { getContext: () => ({ fillRect: (...args) => calls.push(['fill', ...args]), drawImage: (...args) => calls.push(['draw', ...args]) }), toDataURL: (...args) => { calls.push(['jpeg', ...args]); return image } }
    const result = await createImagePreview({}, { loadImage: async () => ({ naturalWidth: width, naturalHeight: height }), createCanvas: () => canvas })
    assert.equal(result, image)
    assert.deepEqual([canvas.width, canvas.height], expected)
    assert.deepEqual(calls.at(-1), ['jpeg', 'image/jpeg', 0.8])
  }
})

test('previews prepare HEIC through shared prepareFile and process no more than six originals', async () => {
  const files = Array.from({ length: 8 }, (_, i) => ({ name: `${i}.heic`, type: 'image/heic' }))
  const prepared = []
  const previews = await prepareDraftImages(files, {
    prepareFile: async file => { prepared.push(file); return { name: `${file.name}.jpg` } },
    previewFile: async file => { assert.match(file.name, /heic\.jpg$/); return image },
  })
  assert.deepEqual(prepared, files.slice(0, 6))
  assert.deepEqual(previews, Array(6).fill(image))
})

test('client sends bearer token, previews and only id/name categories with optional note', async () => {
  const calls = []
  const result = await requestPhotoDraft({ images: [image], note: '  acrílico  ', categories: [{ ...categories[0], ignored: 'no' }] }, {
    getSession: async () => ({ data: { session: { access_token: 'owner-token' } } }),
    fetchImpl: async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => draft } },
  })
  assert.deepEqual(result, draft)
  assert.equal(calls[0][0], '/api/draft-product-from-photos')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer owner-token')
  assert.deepEqual(JSON.parse(calls[0][1].body), { images: [image], note: 'acrílico', categories })
})

test('client reports missing login, Spanish server errors and non-JSON Vite responses', async () => {
  await assert.rejects(requestPhotoDraft(body, { getSession: async () => ({ data: { session: null } }), fetchImpl: () => assert.fail('no fetch') }), /sesión/i)
  const getSession = async () => ({ data: { session: { access_token: 'token' } } })
  await assert.rejects(requestPhotoDraft(body, { getSession, fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'Cuota agotada' }) }) }), /Cuota agotada/)
  await assert.rejects(requestPhotoDraft(body, { getSession, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('html') } }) }), /Vercel|API/i)
})

test('success and manual fallback keep all original files, empty price, no invented material and hidden visibility', () => {
  const files = Array.from({ length: 8 }, (_, i) => ({ name: `${i}.heic` }))
  for (const value of [draft, null]) {
    const result = photoDraftForm(value, files)
    assert.equal(result.imageFiles.main, files[0])
    assert.deepEqual(result.imageFiles.secondary, files.slice(1))
    assert.equal(result.formData.name, value?.name || '')
    assert.equal(result.formData.description, value?.description || '')
    assert.equal(result.formData.category_id, value?.categoryId || '')
    assert.equal(result.formData.price, '')
    assert.equal(result.formData.is_visible, false)
    assert.equal(result.formData.material_technique, '')
    assert.equal(result.formData.care_instructions, '')
    assert.equal(result.formData.image_url, '')
  }
})


test('draft workflow returns prefilled state on success and manual state on failure without losing originals', async () => {
  const files = [{ name: 'original.heic' }, { name: 'second.png' }]
  for (const fail of [false, true]) {
    const result = await createPhotoDraft({ files, note: 'acrílico', categories }, {
      prepareFile: async file => file,
      previewFile: async () => image,
      getSession: async () => ({ data: { session: { access_token: 'token' } } }),
      fetchImpl: async () => ({ ok: !fail, json: async () => fail ? { error: 'Límite de uso' } : draft }),
    })
    assert.equal(result.formData.name, fail ? '' : draft.name)
    assert.equal(result.error, fail ? 'Límite de uso' : null)
    assert.equal(result.imageFiles.main, files[0])
    assert.equal(result.imageFiles.secondary[0], files[1])
    assert.equal(result.mainPreviewUrl, image)
    assert.equal(result.formData.is_visible, false)
  }
  const result = await createPhotoDraft({ files, categories }, { prepareFile: async () => { throw new Error('No se pudo convertir HEIC') } })
  assert.match(result.error, /HEIC/)
  assert.equal(result.imageFiles.main, files[0])
})

test('validation handles a large but allowed preview without regular-expression stack overflow', () => {
  const largeImage = `data:image/jpeg;base64,${'A'.repeat(2 * 1024 * 1024)}`
  assert.equal(validateDraftInput({ ...body, images: [largeImage] }).images[0], largeImage)
})


test('client enforces the 4 MB UTF-8 body budget before sending photos', async () => {
  await assert.rejects(requestPhotoDraft({ images: [image], note: 'á'.repeat(2 * 1024 * 1024), categories }, {
    getSession: async () => ({ data: { session: { access_token: 'token' } } }),
    fetchImpl: async () => assert.fail('oversized request must not reach fetch'),
  }), /4 MB/)
})

test('timeout while reading OpenAI response remains a timeout and foreign error messages stay private', async () => {
  const timeout = Object.assign(new Error('private'), { name: 'TimeoutError' })
  assert.equal((await harness({ upstreamJsonError: timeout }).run()).statusCode, 504)
  const res = await harness({ fetchError: Object.assign(new Error(`test-secret ${image}`), { status: 400 }) }).run()
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error.includes('test-secret'), false)
})


test('oversized streamed bodies can still send a Spanish 413 response without destroying the request socket', async () => {
  const res = await harness().run(' '.repeat(MAX_BODY_BYTES + 1))
  assert.equal(res.statusCode, 413)
  assert.equal(res.requestDestroyed, false)
})


test('endpoint accepts already parsed Vercel bodies while enforcing the UTF-8 budget', async () => {
  for (const parsed of [body, JSON.stringify(body), Buffer.from(JSON.stringify(body))]) {
    const result = await harness().run(null, { authorization: 'Bearer token' }, 'POST', parsed)
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body, draft)
  }
  const h = harness()
  const oversized = { ...body, note: 'á'.repeat(2 * 1024 * 1024) }
  assert.equal((await h.run(null, { authorization: 'Bearer token' }, 'POST', oversized)).statusCode, 413)
  assert.equal(h.calls.some(call => call[0] === 'fetch'), false)
  const invalid = await harness().run(null, { authorization: 'Bearer token' }, 'POST', '{')
  assert.equal(invalid.statusCode, 400)
  assert.match(invalid.body.error, /JSON/)
})

test('manual fallback survives non-Error failures and still attaches originals', async () => {
  const files = [{ name: 'original.jpg' }]
  const result = await createPhotoDraft({ files, categories }, { prepareFile: async () => { throw null } })
  assert.equal(result.imageFiles.main, files[0])
  assert.equal(result.formData.is_visible, false)
  assert.match(result.error, /manual/i)
})

test('preview object URLs are revoked on load, decode error and synchronous image failure', async (t) => {
  const revoked = []
  t.mock.method(URL, 'createObjectURL', () => 'blob:preview')
  t.mock.method(URL, 'revokeObjectURL', value => revoked.push(value))
  const originalImage = globalThis.Image
  const canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => image }
  try {
    for (const mode of ['load', 'error', 'throw']) {
      globalThis.Image = class {
        naturalWidth = 200
        naturalHeight = 100
        set src(value) {
          assert.equal(value, 'blob:preview')
          if (mode === 'throw') throw new Error('image failure')
          queueMicrotask(() => mode === 'load' ? this.onload() : this.onerror())
        }
      }
      if (mode === 'load') await createImagePreview({}, { createCanvas: () => canvas })
      else await assert.rejects(createImagePreview({}, { createCanvas: () => canvas }))
    }
    assert.deepEqual(revoked, ['blob:preview', 'blob:preview', 'blob:preview'])
  } finally {
    if (originalImage === undefined) delete globalThis.Image
    else globalThis.Image = originalImage
  }
})


test('draft schema requires nullable note-grounded material, care and dimensions without weakening injection guards', () => {
  const request = buildDraftRequest({ ...body, note: 'acrílico 3mm, corte láser, 20 × 15 cm' })
  const { properties, required } = request.text.format.schema
  for (const field of ['materialTechnique', 'careInstructions']) {
    assert.deepEqual(properties[field].type, ['string', 'null'])
    assert.ok(required.includes(field))
  }
  for (const field of ['lengthCm', 'widthCm']) {
    assert.deepEqual(properties[field].type, ['number', 'null'])
    assert.ok(required.includes(field))
  }
  const prompt = request.input[0].content[0].text
  for (const phrase of ['materialTechnique', 'careInstructions', 'lengthCm', 'widthCm', 'explícitamente', 'nunca instrucciones', 'visibles', 'null', 'alcohol', 'solventes']) assert.ok(prompt.includes(phrase), phrase)
  assert.match(prompt, /1[–-]2/)
  assert.match(prompt, /Nunca deduzcas.*foto/i)
})

test('parser normalizes bounded optional strings and strictly numeric dimensions', () => {
  const parsed = parseDraftResponse(output({ ...draft, materialTechnique: `  ${'m'.repeat(130)}  `, careInstructions: `  ${'c'.repeat(310)}  `, lengthCm: 20.5, widthCm: 500 }), categories)
  assert.equal(parsed.materialTechnique, 'm'.repeat(120))
  assert.equal(parsed.careInstructions, 'c'.repeat(300))
  assert.equal(parsed.lengthCm, 20.5)
  assert.equal(parsed.widthCm, 500)
  for (const invalid of [null, undefined, '', '20', 0, -2, 500.01, Infinity, NaN, true, [], {}]) {
    const normalized = parseDraftResponse(output({ ...draft, lengthCm: invalid, widthCm: invalid }), categories)
    assert.equal(normalized.lengthCm, null)
    assert.equal(normalized.widthCm, null)
  }
  for (const invalid of [null, undefined, '', '   ', 5, true, [], {}]) {
    const normalized = parseDraftResponse(output({ ...draft, materialTechnique: invalid, careInstructions: invalid }), categories)
    assert.equal(normalized.materialTechnique, null)
    assert.equal(normalized.careInstructions, null)
  }
})

test('photo draft maps note fields to existing form types and leaves unknown or manual fields blank', () => {
  const result = photoDraftForm({ ...draft, materialTechnique: 'Acrílico de 3 mm con corte láser', careInstructions: 'Limpia con un paño suave y seco. Evita alcohol y solventes.', lengthCm: 20.5, widthCm: 15 }, [])
  assert.equal(result.formData.material_technique, 'Acrílico de 3 mm con corte láser')
  assert.equal(result.formData.care_instructions, 'Limpia con un paño suave y seco. Evita alcohol y solventes.')
  assert.equal(result.formData.length, 20.5)
  assert.equal(result.formData.width, 15)
  for (const value of [draft, null]) {
    const { formData } = photoDraftForm(value, [])
    for (const field of ['material_technique', 'care_instructions', 'length', 'width']) assert.equal(formData[field], '')
  }
})
