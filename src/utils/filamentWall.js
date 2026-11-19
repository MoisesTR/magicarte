import { spanishColorName } from './bambuColors.js'
import { filamentSwatch } from './filamentColors.js'

const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0
const roundGrams = value => Math.round((value + Number.EPSILON) * 1000) / 1000

export function hexToHsl(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null
  const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const l = (max + min) / 2
  if (!delta) return { h: 0, s: 0, l }
  const h = (max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60
  return { h, s: delta / (1 - Math.abs(2 * l - 1)), l }
}

/** Hue bands follow the wall's reading direction, not the numeric hue wheel. */
function rainbowKey(item) {
  const swatch = filamentSwatch(item)
  if (swatch.transparent) return [-1, 0, 0]
  const hsl = hexToHsl(swatch.hex)
  if (!hsl) return [11, 0, 0]
  const { h, s, l } = hsl
  if (l >= 0.92 || (s < 0.12 && l >= 0.87)) return [0, -l, 0]
  if (l <= 0.1) return [10, -l, 0]
  if (s < 0.12) return [9, -l, 0]
  if (h >= 15 && h < 75 && l < 0.43) return [8, h, -l]
  if (h >= 44 && h < 75) return [1, -h, -l]
  if (h >= 15 && h < 44) return [2, -h, -l]
  if (h >= 345 || h < 15) return [l > 0.67 ? 4 : 3, h, -l]
  if (h >= 315) return [4, -h, -l]
  if (h >= 250) return [5, -h, -l]
  if (h >= 170) return [6, -h, -l]
  return [7, -h, -l]
}

export function orderFilaments(items) {
  // Resolve catalog fallback/HSL once per card, not for every sort comparison.
  return items.map(item => ({ item, key: rainbowKey(item) })).sort((a, b) => {
    const ak = a.key, bk = b.key
    for (let i = 0; i < ak.length; i++) if (ak[i] !== bk[i]) return ak[i] - bk[i]
    return String(a.item.filament_color || '').localeCompare(String(b.item.filament_color || ''), 'es')
  }).map(entry => entry.item)
}

const MATERIAL_ORDER = ['pla basic', 'pla matte', 'pla silk+', 'pla marble', 'pla wood', 'pla pure', 'petg basic', 'petg translucent', 'tpu for ams']
const materialRank = material => {
  const index = MATERIAL_ORDER.indexOf(String(material || '').trim().toLowerCase())
  return index === -1 ? MATERIAL_ORDER.length : index
}
/** Most used materials first; unknown ones after, alphabetically. */
const byMaterial = (a, b) => materialRank(a) - materialRank(b) || String(a).localeCompare(String(b), 'es')

export function materialLabel(material) {
  return String(material || 'Otro').replace(/TPU for AMS/gi, 'TPU flexible').replace(/Silk\+?/gi, 'Seda').replace(/Matte/gi, 'Mate').replace(/Marble/gi, 'Mármol').replace(/Wood/gi, 'Madera').replace(/Translucent/gi, 'Translúcido').replace(/Basic/gi, 'Básico')
}

export function filamentDetails(item) {
  const englishName = String(item.filament_color || 'Sin nombre')
  return {
    spanishName: spanishColorName(item.filament_material, englishName),
    englishName,
    materialLabel: materialLabel(item.filament_material),
    bambuCode: String(item.notes || '').match(/c[oó]digo\s+bambu\s+(\d{5})\b/i)?.[1] || '',
  }
}

export function stockSummary(item) {
  const grams = Math.max(0, number(item.current_stock))
  const gramsPerSpool = number(item.grams_per_spool) > 0 ? number(item.grams_per_spool) : 1000
  const rolls = grams > 0 ? Math.ceil(grams / gramsPerSpool) : 0
  const capacity = rolls * gramsPerSpool
  const closedSpools = Math.max(0, rolls - 1)
  return {
    grams, kg: grams / 1000, rolls, capacity,
    ratio: capacity ? grams / capacity : 0, gramsPerSpool, closedSpools,
    openGrams: roundGrams(grams - closedSpools * gramsPerSpool),
    costPerKg: number(item.unit_cost) * 1000,
    stockValue: grams * number(item.unit_cost),
    low: Boolean(item.is_low_stock) || grams <= number(item.low_stock_threshold),
    exhausted: grams <= 0,
  }
}

/** The last held roll is the open one, including an exactly full last roll. */
export function openSpoolAdjustment(item, value, unit = 'percent') {
  const stock = stockSummary(item)
  const entered = Number(value)
  const limit = unit === 'percent' ? 100 : stock.gramsPerSpool
  if (!['percent', 'g'].includes(unit) || String(value).trim() === '' || !Number.isFinite(entered) || entered < 0 || entered > limit) throw new Error('Indica cuánto queda en el rollo abierto')
  const openGrams = unit === 'percent' ? entered / 100 * stock.gramsPerSpool : entered
  const total = stock.closedSpools * stock.gramsPerSpool + openGrams
  return {
    inventory_item_id: item.id,
    movement_type: 'adjustment',
    quantity_delta: roundGrams(total - number(item.current_stock)),
    note: 'Ajuste de existencia (muro)',
  }
}

export function filterFilaments(items, { materials = [], query = '', onlyAvailable = false } = {}) {
  const term = fold(query)
  return items.filter(item => {
    if (item.inventory_kind !== 'filament') return false
    if (materials.length && !materials.includes(item.filament_material)) return false
    if (onlyAvailable && !(number(item.current_stock) > 0)) return false
    const details = filamentDetails(item)
    return !term || fold([details.spanishName, details.englishName, item.name, item.filament_material, details.materialLabel, details.bambuCode].join(' ')).includes(term)
  })
}

export function materialCounts(items) {
  const counts = new Map()
  for (const item of items) if (item.inventory_kind === 'filament') counts.set(item.filament_material || 'Otro', (counts.get(item.filament_material || 'Otro') || 0) + 1)
  return [...counts].map(([material, count]) => ({ material, count })).sort((a, b) => byMaterial(a.material, b.material))
}

export function groupFilaments(items) {
  const groups = new Map()
  for (const item of items) {
    const material = item.filament_material || 'Otro'
    if (!groups.has(material)) groups.set(material, [])
    groups.get(material).push(item)
  }
  return [...groups].map(([material, colors]) => ({ material, label: materialLabel(material), items: orderFilaments(colors) })).sort((a, b) => byMaterial(a.material, b.material))
}

function preferences(slug, value = {}) {
  return {
    view: ['wall', 'list'].includes(value?.view) ? value.view : slug === 'hikari' ? 'wall' : 'list',
    sort: ['rainbow', 'material'].includes(value?.sort) ? value.sort : 'rainbow',
    materials: Array.isArray(value?.materials) ? value.materials.filter(m => typeof m === 'string') : [],
    query: typeof value?.query === 'string' ? value.query : '',
    onlyAvailable: typeof value?.onlyAvailable === 'boolean' ? value.onlyAvailable : false,
  }
}

export function readWallPreferences(slug, storage) {
  try { return preferences(slug, JSON.parse((storage || globalThis.localStorage)?.getItem(`filament-wall:${slug}`) || '{}')) }
  catch { return preferences(slug) }
}

export function saveWallPreferences(slug, value, storage) {
  try { (storage || globalThis.localStorage)?.setItem(`filament-wall:${slug}`, JSON.stringify(preferences(slug, value))) }
  catch { /* Browsing still works when storage is unavailable. */ }
}

/** Defensive allowlist: even an unexpected server field never reaches the page. */
export function publicColorRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map(row => ({
    business_name: row.business_name,
    primary_color: row.primary_color,
    filament_material: row.filament_material,
    filament_color: row.filament_color,
    color_hex: row.color_hex,
    color_transparent: Boolean(row.color_transparent),
    availability: row.availability === 'poco' ? 'poco' : 'disponible',
  }))
}

export const availabilityLabel = item => item.availability === 'poco' ? 'Pocas unidades' : ''
