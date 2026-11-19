import { createImagePreview } from './productPhotoDraft.js'

const failure =
  'No se pudieron detectar los diseños. Intenta de nuevo o agrégalos manualmente.'
export async function requestDesignDetection(
  { image, productName = '', existingNames = [] },
  { getSession, fetchImpl = fetch }
) {
  let session
  try {
    const result = await getSession()
    session = result?.data?.session
  } catch {
    throw new Error(
      'No se pudo verificar tu sesión. Intenta iniciar sesión de nuevo.'
    )
  }
  if (!session?.access_token)
    throw new Error('Inicia sesión para detectar los diseños.')
  const body = JSON.stringify({
    image,
    productName: productName.trim(),
    existingNames,
  })
  if (new TextEncoder().encode(body).length > 4 * 1024 * 1024)
    throw new Error(
      'La foto supera el límite de 4 MB. Usa una imagen más pequeña.'
    )
  let response
  try {
    response = await fetchImpl('/api/detect-product-designs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body,
    })
  } catch {
    throw new Error(failure)
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || failure)
  if (
    !result ||
    !Array.isArray(result.designs) ||
    result.designs.length > 40 ||
    result.designs.some(
      (row) =>
        !row ||
        typeof row.name !== 'string' ||
        !row.name.trim() ||
        row.name.length > 60
    )
  )
    throw new Error(
      'La API no devolvió diseños válidos. Prueba en Vercel o con vercel dev.'
    )
  return result.designs.map(({ name }) => ({
    name: name.trim(),
    checked: true,
  }))
}

export async function detectProductDesigns(
  { mainImage, productName, existingNames },
  {
    prepareFile,
    previewFile = createImagePreview,
    fetchImpl = fetch,
    ...adapters
  }
) {
  if (!mainImage?.file && !mainImage?.url)
    throw new Error('Agrega una foto principal para detectar los diseños.')
  let file = mainImage.file
  if (!file) {
    try {
      const response = await fetchImpl(mainImage.url, { credentials: 'omit' })
      if (!response.ok) throw new Error(failure)
      file = await response.blob()
    } catch {
      throw new Error(
        'No se pudo leer la foto principal. Intenta seleccionarla de nuevo.'
      )
    }
  }
  let image
  try {
    image = await previewFile(await prepareFile(file))
  } catch {
    throw new Error(
      'No se pudo preparar la foto principal. Prueba con otra imagen.'
    )
  }
  return requestDesignDetection(
    { image, productName, existingNames },
    { ...adapters, fetchImpl }
  )
}
