import {
  catalogPriceLine,
  catalogSizeLine,
  wrapCatalogText,
} from './whatsappCatalog.js'

const FONT = '"Fredoka", system-ui, -apple-system, "Segoe UI", sans-serif'
const COLORS = {
  pink: '#ffb6c1',
  green: '#51c879',
  blue: '#50bfe6',
  text: '#1f2937',
  muted: '#6b7280',
  placeholder: '#f3f4f6',
}

export function loadCatalogImage(
  url,
  { createImage = () => new Image(), timeoutMs = 15000 } = {}
) {
  return new Promise((resolve, reject) => {
    const image = createImage()
    const finish = (error) => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      if (error) reject(new Error('Catalog image unavailable'))
      else resolve(image)
    }
    const timer = setTimeout(() => finish(true), timeoutMs)
    image.crossOrigin = 'anonymous'
    image.onload = () => finish(!image.naturalWidth || !image.naturalHeight)
    image.onerror = () => finish(true)
    image.src = url
  })
}

function drawPhoto(context, image, x, y, width, height) {
  if (image) {
    const scale = Math.max(
      width / image.naturalWidth,
      height / image.naturalHeight
    )
    const sourceWidth = width / scale
    const sourceHeight = height / scale
    context.drawImage(
      image,
      (image.naturalWidth - sourceWidth) / 2,
      (image.naturalHeight - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height
    )
    return
  }
  context.fillStyle = COLORS.placeholder
  context.fillRect(x, y, width, height)
  context.fillStyle = COLORS.muted
  context.font = `400 ${height < 200 ? 24 : 38}px ${FONT}`
  context.textAlign = 'center'
  context.fillText('Imagen no disponible', x + width / 2, y + height / 2)
  context.textAlign = 'left'
}

function exportJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.')),
      'image/jpeg',
      0.9
    )
  })
}

export async function createCatalogCard(
  product,
  presentations = [],
  {
    includePrice = true,
    resolveImageUrl,
    documentObject = document,
    loadImage = loadCatalogImage,
  } = {}
) {
  await documentObject.fonts?.ready
  const paths = [
    product.image_url || '',
    ...(product.secondary_images || []).slice(0, 3),
  ]
  const images = await Promise.all(
    paths.map(async (path) => {
      if (!path) return null
      try {
        return await loadImage(resolveImageUrl(path))
      } catch {
        return null
      }
    })
  )
  let missingPhotos = images.some((image) => !image)
  const canvas = documentObject.createElement('canvas')
  const draw = (photos) => {
    // Resetting dimensions clears both old drawing state and the origin-clean flag.
    canvas.width = 1080
    canvas.height = 1350
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Su navegador no permite generar imágenes.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, 1080, 1350)
    const hasStrip = paths.length > 1
    drawPhoto(context, photos[0], 0, 0, 1080, hasStrip ? 780 : 950)
    if (hasStrip)
      photos
        .slice(1)
        .forEach((image, index) =>
          drawPhoto(context, image, 40 + index * 336, 798, 320, 152)
        )
    context.fillStyle = COLORS.pink
    context.fillRect(0, 968, 1080, 8)
    context.fillStyle = COLORS.text
    context.textBaseline = 'top'
    context.font = `600 52px ${FONT}`
    const measure = (text) => context.measureText(text)
    wrapCatalogText(product.name, 980, measure, 2).forEach((line, index) =>
      context.fillText(line, 50, 998 + index * 60)
    )
    context.font = `500 34px ${FONT}`
    context.fillStyle = '#237a42'
    wrapCatalogText(
      catalogPriceLine(product, presentations, includePrice),
      980,
      measure,
      2
    ).forEach((line, index) => context.fillText(line, 50, 1130 + index * 41))
    context.font = `400 30px ${FONT}`
    context.fillStyle = COLORS.muted
    const size = catalogSizeLine(product)
    if (size)
      wrapCatalogText(size, 980, measure, 1).forEach((line) =>
        context.fillText(line, 50, 1226)
      )
    context.fillStyle = COLORS.green
    context.fillRect(0, 1283, 1080, 67)
    context.fillStyle = COLORS.text
    context.font = `600 32px ${FONT}`
    context.fillText('Magic Arte', 50, 1300)
    context.font = `400 28px ${FONT}`
    context.textAlign = 'right'
    context.fillText('magicarte.net', 1030, 1302)
  }
  draw(images)
  let blob
  try {
    blob = await exportJpeg(canvas)
  } catch (error) {
    if (error.name !== 'SecurityError') throw error
    missingPhotos = true
    draw(images.map(() => null))
    blob = await exportJpeg(canvas)
  }
  // Release the large backing buffer; previews use the encoded JPEG instead.
  canvas.width = 0
  canvas.height = 0
  return { blob, missingPhotos }
}
