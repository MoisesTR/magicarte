import colors from '../data/bambuColors.json' with { type: 'json' }

const normalize = (value) => String(value ?? '').trim().toLowerCase()
const normalizeName = (value) => normalize(value).replace(/^matte\s+/, '')

/** Bambu product codes are exactly five digits; partial input never matches. */
export function findByCode(code) {
  const value = String(code ?? '')
  return /^\d{5}$/.test(value) ? colors.find((entry) => entry.code === value) : undefined
}

export function suggest(material, colorName) {
  const name = normalizeName(colorName)
  if (!name || !normalize(material)) return undefined
  return colors.find((entry) => normalize(entry.material) === normalize(material) && normalizeName(entry.en) === name)
}

const SPANISH_FALLBACK = {
  'dark beige': 'Beige oscuro', 'baby blue': 'Azul bebé', 'milky pink': 'Rosa lechoso',
}

/** Spanish color name: same material first, then any material with that English name, then a short fallback list. */
export function spanishColorName(material, colorName) {
  const exact = suggest(material, colorName)
  if (exact?.es) return exact.es
  const name = normalizeName(colorName)
  const shared = name && colors.find((entry) => entry.es && normalizeName(entry.en) === name)
  return shared?.es || SPANISH_FALLBACK[name] || String(colorName ?? '')
}

export function isTransparent(entry) {
  return entry?.alpha === '00'
}
