import { createClient } from '@supabase/supabase-js'
import { readPhotoBody } from './_lib/photoRequest.js'
import {
  validateClassifyInput,
  buildClassifyRequest,
  parseClassifyResponse,
  classificationError,
} from './_lib/whatsappClassification.js'

export const maxDuration = 60

export function createClassifyHandler({
  env = process.env,
  createClient: makeClient = createClient,
  fetchImpl = fetch,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader?.('Allow', 'POST')
      return res.status(405).json({ error: 'Método no permitido. Use POST.' })
    }
    if (!env.OPENAI_API_KEY) {
      return res
        .status(503)
        .json({
          error: 'La IA no está configurada (falta OPENAI_API_KEY en Vercel).',
        })
    }
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return res
        .status(500)
        .json({
          error:
            'Falta la configuración de autenticación de Supabase en el servidor.',
        })
    }
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ') || !authHeader.split(' ')[1]) {
      return res
        .status(401)
        .json({ error: 'Inicie sesión para clasificar la conversación.' })
    }
    try {
      const supabase = makeClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY)
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(authHeader.split(' ')[1])
      if (authError || !user)
        return res
          .status(401)
          .json({ error: 'La sesión no es válida. Inicie sesión de nuevo.' })
      const input = validateClassifyInput(await readPhotoBody(req))
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(
          buildClassifyRequest(input, env.OPENAI_MODEL || 'gpt-5.4-mini')
        ),
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw classificationError(response.status)
      return res.status(200).json(parseClassifyResponse(await response.json()))
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        return res.status(504).json({ error: classificationError(504).message })
      }
      // Never reflect upstream errors, credentials or user text into logs or responses.
      if (error?.isDraftError && error.status === 413) {
        const result = res
          .status(413)
          .json({
            error:
              'La solicitud supera el límite de 4 MB. Reduzca el texto enviado.',
          })
        req.resume?.()
        return result
      }
      return res
        .status(error?.isDraftError ? error.status : 502)
        .json({
          error: error?.isDraftError
            ? error.message
            : classificationError(502).message,
        })
    }
  }
}

export default createClassifyHandler()
