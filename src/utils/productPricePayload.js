import { productPriceDisplay } from './productPriceDisplay.js'

export function productPricePayload(form, price = form.price) {
  const mode = productPriceDisplay(form).mode
  const empty = price == null || String(price).trim() === ''
  const value = empty ? 0 : Number(price)
  if ((empty && mode !== 'quote') || !Number.isFinite(value) || value < 0) {
    throw new Error('Ingrese un precio mayor o igual a 0.')
  }
  return { price_mode: mode, price: value }
}

// Retry only named optional columns; authorization/validation failures must surface.
export function productOptionalColumnsFallback(payload, error, columns = ['price_mode', 'video_url']) {
  if (!['42703', 'PGRST204'].includes(error?.code)) return null
  const message = `${error.message || ''} ${error.details || ''}`
  const column = columns.find(column => Object.hasOwn(payload, column) && new RegExp(`\\b${column}\\b`).test(message))
  if (!column) return null
  const legacy = { ...payload }
  delete legacy[column]
  return legacy
}

// Retain the original price-only helper contract for existing consumers.
export function productPriceModeFallback(payload, error) {
  return productOptionalColumnsFallback(payload, error, ['price_mode'])
}
