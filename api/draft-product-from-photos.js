import { createClient } from '@supabase/supabase-js'
import { MAX_BODY_BYTES, draftError, validateDraftInput, buildDraftRequest, parseDraftResponse, openAIError } from './_lib/productPhotoDraft.js'

// Accept Vercel-parsed bodies as well as raw Node request streams.
export const maxDuration = 60

async function readBody(req) {
  const tooLarge = () => draftError('Las fotos superan el límite de 4 MB. Usa menos fotos o imágenes más pequeñas.', 413)
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw tooLarge()
  const invalidJSON = () => draftError('El cuerpo de la solicitud debe ser JSON válido.')
  let parsed
  // Vercel's Node helpers can expose a lazy body getter after consuming the stream.
  try { parsed = req.body } catch { throw invalidJSON() }
  if (parsed !== undefined) {
    let serialized
    try { serialized = typeof parsed === 'string' || Buffer.isBuffer(parsed) ? parsed : JSON.stringify(parsed) } catch { throw invalidJSON() }
    if (serialized === undefined) throw invalidJSON()
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) throw tooLarge()
    if (typeof parsed !== 'string' && !Buffer.isBuffer(parsed)) return parsed
    try { return JSON.parse(serialized.toString()) } catch { throw invalidJSON() }
  }
  const chunks = []
  let size = 0
  // Early rejection must leave the socket alive long enough to send the 413 JSON.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw tooLarge()
    chunks.push(buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw invalidJSON()
  }
}

export function createDraftHandler({ env = process.env, createClient: makeClient = createClient, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader?.('Allow', 'POST')
      return res.status(405).json({ error: 'Método no permitido. Usa POST.' })
    }
    if (!env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'La IA no está configurada (falta OPENAI_API_KEY en Vercel).' })
    }
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Falta la configuración de autenticación de Supabase en el servidor.' })
    }
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ') || !authHeader.split(' ')[1]) {
      return res.status(401).json({ error: 'Inicia sesión para crear un borrador.' })
    }
    try {
      const supabase = makeClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.split(' ')[1])
      if (authError || !user) return res.status(401).json({ error: 'La sesión no es válida. Inicia sesión de nuevo.' })
      const input = validateDraftInput(await readBody(req))
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify(buildDraftRequest(input, env.OPENAI_MODEL || 'gpt-5.4-mini')),
        signal: AbortSignal.timeout(45000),
      })
      if (!response.ok) throw openAIError(response.status)
      const payload = await response.json()
      return res.status(200).json(parseDraftResponse(payload, input.categories))
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        return res.status(504).json({ error: openAIError(504).message })
      }
      // Never reflect upstream errors, credentials or photos into logs or responses.
      const result = res.status(error?.isDraftError ? error.status : 502).json({ error: error?.isDraftError ? error.message : openAIError(502).message })
      if (error?.isDraftError && error.status === 413) req.resume?.()
      return result
    }
  }
}

export default createDraftHandler()
