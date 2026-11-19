import { newProductForm } from './quoteForms.js'

export const MAX_DRAFT_PHOTOS = 6

async function loadPreviewImage(file) {
  const image = new Image()
  const url = URL.createObjectURL(file)
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('No se pudo leer una foto. Prueba con otra imagen.'))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function createImagePreview(file, { loadImage = loadPreviewImage, createCanvas = () => document.createElement('canvas') } = {}) {
  const image = await loadImage(file)
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = createCanvas()
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo preparar las fotos en este navegador.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export async function prepareDraftImages(files, { prepareFile, previewFile = createImagePreview }) {
  const images = []
  // Sequential conversion avoids decoding six full-size HEIC files at once.
  for (const file of Array.from(files).slice(0, MAX_DRAFT_PHOTOS)) {
    images.push(await previewFile(await prepareFile(file)))
  }
  return images
}

export async function requestPhotoDraft({ images, note = '', categories = [] }, { getSession, fetchImpl = fetch }) {
  const { data: { session } } = await getSession()
  if (!session?.access_token) throw new Error('Inicia sesión para crear un borrador.')
  const body = JSON.stringify({ images, note: note.trim(), categories: categories.map(({ id, name }) => ({ id, name })) })
  if (new TextEncoder().encode(body).length > 4 * 1024 * 1024) {
    throw new Error('Las fotos superan el límite de 4 MB. Usa menos fotos o imágenes más pequeñas.')
  }
  const response = await fetchImpl('/api/draft-product-from-photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || 'No se pudo analizar las fotos. Puedes completar el producto manualmente.')
  if (!result || typeof result.name !== 'string' || typeof result.description !== 'string') {
    throw new Error('La API no devolvió un borrador válido. Prueba en Vercel o con vercel dev.')
  }
  return result
}

export function photoDraftForm(draft, files) {
  const originals = Array.from(files)
  return {
    formData: {
      ...newProductForm(),
      name: draft?.name || '', description: draft?.description || '', category_id: draft?.categoryId || '',
      material_technique: draft?.materialTechnique ?? '', care_instructions: draft?.careInstructions ?? '',
      length: draft?.lengthCm ?? '', width: draft?.widthCm ?? '', is_visible: false,
    },
    imageFiles: { main: originals[0] || null, secondary: originals.slice(1) },
  }
}

export async function createPhotoDraft({ files, note, categories }, adapters) {
  let images = []
  try {
    images = await prepareDraftImages(files, adapters)
    const draft = await requestPhotoDraft({ images, note, categories }, adapters)
    return { ...photoDraftForm(draft, files), mainPreviewUrl: images[0], error: null }
  } catch (error) {
    return {
      ...photoDraftForm(null, files), mainPreviewUrl: images[0] || null,
      error: error?.message || 'No se pudo analizar las fotos. Completa el producto manualmente.',
    }
  }
}
