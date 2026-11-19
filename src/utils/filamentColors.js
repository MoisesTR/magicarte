import { findByCode, suggest, isTransparent } from './bambuColors.js'

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

export function applyBambuCode(form, code) {
  const entry = findByCode(code)
  return {
    ...form,
    bambu_code: code,
    ...(entry ? { material: entry.material, color: entry.en, color_hex: entry.hex, color_transparent: isTransparent(entry) } : {}),
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
