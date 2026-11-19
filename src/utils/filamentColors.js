import { findByCode, storeLinkByCode, suggest, isTransparent } from './bambuColors.js'

export function normalizeColorHex(value) {
  const hex = String(value ?? '').trim().toUpperCase()
  if (!hex) return null
  if (!/^#[0-9A-F]{6}$/.test(hex)) throw new Error('El color hexadecimal debe tener el formato #RRGGBB')
  return hex
}

export function colorFields(form) {
  return {
    color_hex: normalizeColorHex(form.color_hex),
    color_transparent: Boolean(form.color_transparent),
  }
}

function normalizeProductUrl(value) {
  const url = String(value ?? '').trim()
  if (!url) return null
  try {
    if (url.startsWith('https://') && new URL(url).hostname) return url
  } catch { /* Invalid URLs are rejected below. */ }
  throw new Error('El enlace debe ser una URL válida que comience con https://')
}

export function productFields(form) {
  const product_url = normalizeProductUrl(form.product_url)
  return {
    product_url,
    product_image_url: product_url ? normalizeProductUrl(form.product_image_url) : null,
  }
}

export function applyBambuCode(form, code) {
  const entry = findByCode(code)
  const link = storeLinkByCode(code)
  return {
    ...form,
    bambu_code: code,
    ...(entry ? { material: entry.material, color: entry.en, color_hex: entry.hex, color_transparent: isTransparent(entry), product_url: link?.url || '', product_image_url: link?.image || '' } : {}),
  }
}

/** Named legacy Bambu colors can be previewed without a database backfill. */
export function filamentSwatch(item) {
  const entry = suggest(item?.filament_material, item?.filament_color)
  const hasSavedHex = /^#[0-9A-F]{6}$/i.test(item?.color_hex || '')
  return {
    hex: hasSavedHex ? item.color_hex : entry?.hex || null,
    transparent: Boolean(item?.color_transparent || (!hasSavedHex && isTransparent(entry))),
  }
}
