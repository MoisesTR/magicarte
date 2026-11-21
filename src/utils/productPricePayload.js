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

// Retry only the optional column; authorization/validation failures must surface.
export function productPriceModeFallback(payload, error) {
  if (
    !Object.hasOwn(payload, 'price_mode') ||
    !['42703', 'PGRST204'].includes(error?.code) ||
    !/\bprice_mode\b/.test(`${error.message || ''} ${error.details || ''}`)
  )
    return null
  const legacy = { ...payload }
  delete legacy.price_mode
  return legacy
}
