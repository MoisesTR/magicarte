import { createClient } from '@supabase/supabase-js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

const normalizeText = (text) => text?.trim().replace(/\n{3,}/g, '\n\n') || ''
const endsCompleteSentence = (text) => /[.!?…][)"'”’\]]*$/.test(normalizeText(text))

const getRetrySeconds = (message) => {
  const match = message?.match(/retry in ([\d.]+)s/i)
  return match ? Math.ceil(Number(match[1])) : null
}

const getGeminiError = (status, payload) => {
  const message = payload?.error?.message || 'No se pudo generar contenido con Gemini'

  if (status === 429 || payload?.error?.status === 'RESOURCE_EXHAUSTED') {
    const retrySeconds = getRetrySeconds(message)
    const retryText = retrySeconds ? ` Intenta de nuevo en ${retrySeconds} segundos.` : ''
    const hasZeroFreeTier = message.includes('limit: 0') || message.includes('free_tier')

    if (hasZeroFreeTier) {
      return `Gemini no tiene cuota disponible para este proyecto/API key.${retryText} Revisa la cuota o facturación en Google AI Studio.`
    }

    return `Gemini alcanzó el límite de uso temporal.${retryText}`
  }

  if (status === 404) {
    return `El modelo de Gemini "${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}" no está disponible para esta API key. Cambia GEMINI_MODEL.`
  }

  return message
}

const getBlockedResponseMessage = (payload) => {
  const promptFeedback = payload?.promptFeedback
  const finishReason = payload?.candidates?.[0]?.finishReason
  const safetyRatings = payload?.candidates?.[0]?.safetyRatings || promptFeedback?.safetyRatings || []
  const blockedCategories = safetyRatings
    .filter((rating) => rating.blocked || ['MEDIUM', 'HIGH'].includes(rating.probability))
    .map((rating) => rating.category?.replace('HARM_CATEGORY_', '').toLowerCase())
    .filter(Boolean)

  if (promptFeedback?.blockReason) {
    return `Gemini bloqueó la solicitud (${promptFeedback.blockReason}). Ajusta el nombre o las notas del producto.`
  }

  if (finishReason === 'SAFETY') {
    const categories = blockedCategories.length ? ` Categorías: ${blockedCategories.join(', ')}.` : ''
    return `Gemini bloqueó la respuesta por filtros de seguridad.${categories} Ajusta las notas del producto e intenta de nuevo.`
  }

  if (finishReason === 'RECITATION') {
    return 'Gemini evitó responder por posible texto demasiado parecido a una fuente existente. Cambia las notas e intenta de nuevo.'
  }

  return null
}

const formatProductContext = (product) => {
  const dimensions = [product.length, product.width].filter(Boolean).join(' x ')

  return [
    `Nombre: ${product.name || 'Sin nombre'}`,
    `Categoría: ${product.category || 'Sin categoría'}`,
    `Precio: ${product.price ? `C$ ${product.price}` : 'Sin precio'}`,
    `Dimensiones: ${dimensions ? `${dimensions} cm` : 'Sin dimensiones'}`,
    `Descripción actual: ${product.description || 'Sin descripción'}`,
    `Material y técnica: ${product.material_technique || 'MDF cortado en láser, pintado a mano'}`,
  ].join('\n')
}

const buildDescriptionPrompt = (product) => `
Eres copywriter para MagicArte Nicaragua, un negocio pequeño de productos artesanales personalizados.

Escribe una descripción premium para la página del producto en español.
Debe sonar cálida, emocional y profesional, como una marca artesanal cuidada, no como texto genérico.
La descripción debe ayudar a una persona a imaginar por qué este producto sería un buen regalo o detalle especial.

Estructura obligatoria:
- Exactamente 3 oraciones completas.
- Oración 1: gancho emocional sobre el propósito, ocasión o sentimiento del producto.
- Oración 2: describe detalles visuales, personalización o valor decorativo usando la información disponible.
- Oración 3: menciona que es hecho a mano en MDF con corte láser, pintado a mano y acabado con cuidado.

Reglas:
- No incluyas título, hashtags, precio, viñetas, emojis ni comillas.
- No inventes colores, nombres, personajes, fechas o detalles que no estén en los datos.
- Cada oración debe ser clara, completa y terminar con punto final.
No dejes frases a medias.

Datos del producto:
${formatProductContext(product)}
`

const buildFacebookListingPrompt = (product) => `
Eres copywriter para MagicArte Nicaragua.

Crea un listing completo y listo para Facebook Marketplace en español para un producto artesanal.
El producto es de MDF cortado en láser, pintado a mano, y puede personalizarse con nombres o mensajes.

Devuelve únicamente el texto del listing. No escribas frases como "Aquí tienes", "Claro" ni explicaciones.

Usa exactamente esta estructura, reemplazando los corchetes con los datos disponibles:

[Gancho emocional de 1 línea]

✨ [Nombre del producto]
[Descripción breve y vendedora de 2 a 3 líneas]

🎨 Personalización:
Podemos personalizarlo con nombres, mensajes o detalles especiales.

📏 Medidas: [dimensiones en cm o "consultar medidas"]
💰 Precio: [precio en C$ o "consultar precio"]
⏱️ Tiempo de entrega: 3 a 5 días hábiles
💳 Pago: 50% de adelanto para iniciar el pedido personalizado

Escríbenos por WhatsApp para cotizar y apartar el tuyo.

#MagicArte #MDF #RegaloPersonalizado #HechoAMano #Nicaragua

No inventes datos que no estén en la información del producto.

Datos del producto:
${formatProductContext(product)}
`

const getPrompt = (type, product) => {
  if (type === 'description') return buildDescriptionPrompt(product)
  if (type === 'facebook_listing') return buildFacebookListingPrompt(product)
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const geminiKey = process.env.GEMINI_API_KEY
    const geminiModel = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      return res.status(500).json({ error: 'Missing server environment variables' })
    }

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { type, product } = req.body || {}
    const prompt = getPrompt(type, product || {})

    if (!prompt) {
      return res.status(400).json({ error: 'Invalid generation type' })
    }

    const geminiResponse = await fetch(`${GEMINI_API_BASE}/${geminiModel}:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: type === 'description' ? 0.7 : 0.8,
          topP: 0.95,
          maxOutputTokens: 1500,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    })

    const payload = await geminiResponse.json().catch(() => null)

    if (!geminiResponse.ok) {
      return res.status(geminiResponse.status).json({ error: getGeminiError(geminiResponse.status, payload) })
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('\n')
    const finishReason = payload?.candidates?.[0]?.finishReason

    if (!text) {
      return res.status(502).json({
        error: getBlockedResponseMessage(payload) || `Gemini no devolvió contenido${finishReason ? ` (${finishReason})` : ''}. Intenta de nuevo.`,
      })
    }

    return res.status(200).json({ text: normalizeText(text) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error al generar contenido' })
  }
}
