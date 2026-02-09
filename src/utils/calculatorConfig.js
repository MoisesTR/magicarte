// Default calculator configuration based on the original Excel/standalone calculator
export const DEFAULT_CONFIG = {
  materiales: {
    mdf3mm: 0.0168,    // C$/cm² — Lámina 400 C$ / (122×244) cm²
    mdf5mm: 0.0286,    // C$/cm² — Lámina 680 C$ / (122×244) cm²
    mdf9mm: 0.04,
    plywood: 0.05,
  },
  gesso: {
    precioPorMl: 0.4,
    mlPorM2: 60,
  },
  pintura: {
    precioPorMl: 0.63,  // Artecho
    basePerM2: 100,
    decPerM2: 120,
  },
  herraje: 11.6,
  pega: 3.5,
  electricidad: {
    tarifaKwh: 8.39,    // Tarifa >150kWh Nicaragua
    laserWatts: 360,     // SCULPFUN S30 Ultra 33W
  },
  laser: 15,             // C$/hora amortización + mantenimiento
  manoObra: 45,          // C$/hora
  overhead: 20,          // C$/hora
  merma: 7.5,            // %
}

const CONFIG_KEY = 'arteMdfConfigV2'
const QUOTES_KEY = 'arteMdfCotizaciones'

export function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY)
    return saved ? JSON.parse(saved) : structuredClone(DEFAULT_CONFIG)
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function loadQuotes() {
  try {
    const saved = localStorage.getItem(QUOTES_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function saveQuotes(quotes) {
  localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes))
}

export const MATERIAL_LABELS = {
  ninguno: 'Ninguno',
  mdf3mm: 'MDF 3mm',
  mdf5mm: 'MDF 5mm',
  mdf9mm: 'MDF 9mm',
  plywood: 'Plywood',
}

export const MATERIAL_OPTIONS = Object.keys(MATERIAL_LABELS)

// Sheet size for material calculations
export const SHEET_CM2 = 122 * 244

export function formatC(value) {
  return `C$${value.toFixed(2)}`
}
