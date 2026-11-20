import { validateEnhanceInput, validateEnhancedText } from '../../api/_lib/productTextEnhance.js'

export async function requestTextEnhancement(input, { getSession, fetchImpl = fetch }) {
  const body = JSON.stringify(validateEnhanceInput(input))
  let session
  try {
    const result = await getSession()
    session = result?.data?.session
  } catch {
    throw new Error('No se pudo verificar su sesión. Inicie sesión de nuevo para mejorar el texto.')
  }
  if (!session?.access_token) throw new Error('Inicie sesión para mejorar el texto.')
  let response
  try {
    response = await fetchImpl('/api/enhance-product-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body,
    })
  } catch {
    throw new Error('No se pudo mejorar el texto. Revise su conexión e intente de nuevo; su texto no cambió.')
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('Su sesión venció. Inicie sesión de nuevo para mejorar el texto.')
    if (response.status === 429) throw new Error('La IA alcanzó su límite de uso. Intente más tarde.')
    if (response.status === 503) throw new Error('La IA no está configurada. Puede completar el texto manualmente.')
    if (response.status === 504) throw new Error('La IA tardó demasiado. Intente de nuevo; su texto no cambió.')
    throw new Error('No se pudo mejorar el texto. Intente de nuevo; su texto no cambió.')
  }
  return validateEnhancedText(result)
}

export function createEnhancementState(text) {
  return { text, revision: 0, pending: null, suggestion: null, undo: null }
}

export function enhancementReducer(state, action) {
  switch (action.type) {
    case 'start':
      if (state.pending || !state.text.trim()) return state
      return { ...state, pending: { id: action.id, revision: state.revision }, suggestion: null }
    case 'suggest':
      if (state.pending?.id !== action.id) return state
      return { ...state, pending: null, suggestion: state.pending.revision === state.revision ? action.text : null }
    case 'fail':
      return state.pending?.id === action.id ? { ...state, pending: null } : state
    case 'edit':
      return { ...state, text: action.text, revision: state.revision + 1, suggestion: null, undo: null }
    case 'discard':
      return { ...state, suggestion: null }
    case 'use':
      if (!state.suggestion) return state
      return { ...state, text: state.suggestion, revision: state.revision + 1, suggestion: null, undo: { previous: state.text } }
    case 'undo':
      if (!state.undo) return state
      return { ...state, text: state.undo.previous, revision: state.revision + 1, suggestion: null, undo: null }
    default:
      return state
  }
}

export function productTextContext(formData) {
  const dimensions = {}
  for (const key of ['length', 'width']) {
    const value = Number(formData[key])
    if (Number.isFinite(value) && value > 0) dimensions[key] = value
  }
  return {
    productName: formData.name || '',
    dimensions,
    otherFields: {
      description: formData.description || '',
      material: formData.material_technique || '',
      care: formData.care_instructions || '',
    },
  }
}
