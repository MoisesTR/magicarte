import { supabase } from '../config/supabaseClient'

const normalizeText = (text) => text?.trim().replace(/\n{3,}/g, '\n\n') || ''
const stripListingPreface = (text) => normalizeText(text)
  .replace(/^aqu[ií]\s+tienes\s+.*?:\s*/i, '')
  .replace(/^claro[,.]?\s*/i, '')
  .trim()

async function callGemini(type, product) {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Inicia sesión para usar Gemini')
  }

  const response = await fetch('/api/generate-gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ type, product }),
  })

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(result?.error || 'No se pudo generar contenido con Gemini')
  }

  return normalizeText(result?.text)
}

export function generateProductDescription(product) {
  return callGemini('description', product)
}

export function generateFacebookMarketplaceListing(product) {
  return callGemini('facebook_listing', product).then(stripListingPreface)
}
