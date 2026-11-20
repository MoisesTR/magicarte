import {
  validateClassifyInput,
  validateClassification,
} from '../../api/_lib/whatsappClassification.js'

/** Authenticated, allowlisted context only; never forward upstream error text. */
export async function requestThreadClassification(
  thread,
  { getSession, fetchImpl = fetch }
) {
  const body = JSON.stringify(validateClassifyInput({ thread }))
  let session
  try {
    session = (await getSession())?.data?.session
  } catch {
    throw new Error(
      'No se pudo verificar su sesión. Inicie sesión de nuevo para clasificar.'
    )
  }
  if (!session?.access_token)
    throw new Error('Inicie sesión para clasificar la conversación.')
  let response
  try {
    response = await fetchImpl('/api/classify-whatsapp-thread', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body,
    })
  } catch {
    throw new Error(
      'No se pudo clasificar con IA. Revise su conexión e intente de nuevo.'
    )
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401)
      throw new Error(
        'Su sesión venció. Inicie sesión de nuevo para clasificar.'
      )
    if (response.status === 429)
      throw new Error('La IA alcanzó su límite de uso. Intente más tarde.')
    if (response.status === 503)
      throw new Error(
        'La IA no está configurada. La conversación se conserva sin clasificar.'
      )
    if (response.status === 504)
      throw new Error('La IA tardó demasiado. Intente de nuevo.')
    throw new Error('No se pudo clasificar con IA. Intente de nuevo.')
  }
  return validateClassification(result)
}
