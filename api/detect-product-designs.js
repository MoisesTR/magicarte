import { createClient } from '@supabase/supabase-js'
import { readPhotoBody } from './_lib/photoRequest.js'
import { openAIError } from './_lib/productPhotoDraft.js'
import {
  validateDesignDetectionInput,
  buildDesignDetectionRequest,
  parseDesignDetectionResponse,
} from './_lib/productDesignDetection.js'

export const maxDuration = 60

export function createDesignDetectionHandler({
  env = process.env,
  createClient: makeClient = createClient,
  fetchImpl = fetch,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader?.('Allow', 'POST')
      return res.status(405).json({ error: 'Método no permitido. Usa POST.' })
    }
    if (!env.OPENAI_API_KEY)
      return res
        .status(503)
        .json({
          error: 'La IA no está configurada (falta OPENAI_API_KEY en Vercel).',
        })
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY)
      return res
        .status(500)
        .json({
          error:
            'Falta la configuración de autenticación de Supabase en el servidor.',
        })
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ') || !authHeader.split(' ')[1])
      return res
        .status(401)
        .json({ error: 'Inicia sesión para detectar los diseños.' })
    try {
      const supabase = makeClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY)
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(authHeader.split(' ')[1])
      if (authError || !user)
        return res
          .status(401)
          .json({ error: 'La sesión no es válida. Inicia sesión de nuevo.' })
      const input = validateDesignDetectionInput(await readPhotoBody(req))
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(
          buildDesignDetectionRequest(input, env.OPENAI_MODEL || 'gpt-5.4-mini')
        ),
        signal: AbortSignal.timeout(45000),
      })
      if (!response.ok) throw openAIError(response.status)
      return res
        .status(200)
        .json(
          parseDesignDetectionResponse(
            await response.json(),
            input.existingNames
          )
        )
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
        return res.status(504).json({ error: openAIError(504).message })
      // Never reflect upstream errors, credentials or photos into logs or responses.
      const result = res
        .status(error?.isDraftError ? error.status : 502)
        .json({
          error: error?.isDraftError ? error.message : openAIError(502).message,
        })
      if (error?.isDraftError && error.status === 413) req.resume?.()
      return result
    }
  }
}

export default createDesignDetectionHandler()
