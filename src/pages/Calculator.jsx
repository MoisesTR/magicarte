import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../config/supabaseClient'
import toast from 'react-hot-toast'
import {
  loadConfig, saveConfig as persistConfig,
  loadQuotes, saveQuotes,
  DEFAULT_CONFIG, MATERIAL_LABELS, MATERIAL_OPTIONS,
  SHEET_CM2, formatC,
} from '../utils/calculatorConfig'

// ─── Default form values ───
const DEFAULT_FORM = {
  nombre: '',
  cliente: '',
  cantidad: 1,
  ancho: 30,
  alto: 20,
  materialCapa1: 'mdf5mm',
  coberturaCapa1: 100,
  materialCapa2: 'mdf3mm',
  coberturaCapa2: 30,
  materialCapa3: 'ninguno',
  coberturaCapa3: 0,
  herrajes: 0,
  pegaLoca: 1,
  tiempoLaser: 20,
  tiempoManoObra: 120,
  tiempoOverhead: 120,
  margen: 50,
  margenTipo: 'markup',
  usarColores: false,
  color1: 'Color principal',
  color1Pct: 100,
  color2: '',
  color2Pct: 0,
  color3: '',
  color3Pct: 0,
}

export default function Calculator() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [config, setConfig] = useState(loadConfig)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [showConfig, setShowConfig] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [configForm, setConfigForm] = useState(config)
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setCheckingAuth(false)
    })
  }, [])

  // Pre-fill from URL params (e.g. from order page)
  useEffect(() => {
    const w = searchParams.get('width')
    const l = searchParams.get('length')
    const name = searchParams.get('name')
    if (w || l || name) {
      setForm(prev => ({
        ...prev,
        ...(w ? { ancho: parseFloat(w) } : {}),
        ...(l ? { alto: parseFloat(l) } : {}),
        ...(name ? { nombre: name } : {}),
      }))
    }
  }, [searchParams])

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ─── Calculation engine ───
  const calc = useCallback(() => {
    const { ancho, alto, cantidad: rawQty } = form
    const cantidad = Math.max(1, rawQty || 1)
    const areaCm2 = ancho * alto
    const areaM2 = areaCm2 / 10000

    // Materials per layer
    const layerCost = (mat, cob) =>
      mat !== 'ninguno' ? areaCm2 * (cob / 100) * (config.materiales[mat] || 0) : 0

    const costo1 = layerCost(form.materialCapa1, form.coberturaCapa1)
    const costo2 = layerCost(form.materialCapa2, form.coberturaCapa2)
    const costo3 = layerCost(form.materialCapa3, form.coberturaCapa3)
    const totalMateriales = costo1 + costo2 + costo3

    // Finishes
    const gessoMl = areaM2 * config.gesso.mlPorM2
    const gessoCosto = gessoMl * config.gesso.precioPorMl
    const pinturaBaseMl = areaM2 * config.pintura.basePerM2
    const pinturaBaseCosto = pinturaBaseMl * config.pintura.precioPorMl
    const pinturaDecMl = areaM2 * config.pintura.decPerM2
    const pinturaDecCosto = pinturaDecMl * config.pintura.precioPorMl
    const totalAcabados = gessoCosto + pinturaBaseCosto + pinturaDecCosto

    // Extras
    const herrajeCosto = (form.herrajes || 0) * config.herraje
    const pegaCosto = (form.pegaLoca || 0) * config.pega
    const totalExtras = herrajeCosto + pegaCosto

    // Time costs
    const laserHoras = (form.tiempoLaser || 0) / 60
    const laserElec = laserHoras * (config.electricidad.laserWatts / 1000) * config.electricidad.tarifaKwh
    const laserOper = laserHoras * config.laser
    const laserCosto = laserElec + laserOper
    const manoObraCosto = ((form.tiempoManoObra || 0) / 60) * config.manoObra
    const overheadCosto = ((form.tiempoOverhead || 0) / 60) * config.overhead

    // Totals
    const subtotal = totalMateriales + totalAcabados + totalExtras + laserCosto + manoObraCosto + overheadCosto
    const merma = subtotal * (config.merma / 100)
    const costoTotal = subtotal + merma

    const margen = form.margen || 0
    let ganancia, precioVenta
    if (form.margenTipo === 'margen') {
      const factor = 1 - margen / 100
      precioVenta = factor > 0 ? costoTotal / factor : 0
      ganancia = precioVenta - costoTotal
    } else {
      ganancia = costoTotal * (margen / 100)
      precioVenta = costoTotal + ganancia
    }

    // Price suggestions
    const precioEconomico = costoTotal * 1.30
    const precioNormal = costoTotal * 1.50
    const precioPremium = costoTotal * 1.80

    // Batch materials
    const matTotals = { mdf3mm: 0, mdf5mm: 0, mdf9mm: 0, plywood: 0 }
    const addMat = (mat, cob) => {
      if (mat !== 'ninguno') matTotals[mat] += areaCm2 * (cob / 100) * cantidad
    }
    addMat(form.materialCapa1, form.coberturaCapa1)
    addMat(form.materialCapa2, form.coberturaCapa2)
    addMat(form.materialCapa3, form.coberturaCapa3)

    const sheetsNeeded = (cm2) => cm2 > 0 ? Math.ceil(cm2 / SHEET_CM2) : 0

    // Color distribution
    let colorBreakdown = null
    if (form.usarColores) {
      const pctTotal = form.color1Pct + form.color2Pct + form.color3Pct
      const pctFactor = pctTotal > 0 ? 100 / pctTotal : 0
      const decMlLote = pinturaDecMl * cantidad
      colorBreakdown = {
        pctTotal,
        colors: [
          { name: form.color1, pct: form.color1Pct, ml: decMlLote * (form.color1Pct * pctFactor / 100) },
          { name: form.color2, pct: form.color2Pct, ml: decMlLote * (form.color2Pct * pctFactor / 100) },
          { name: form.color3, pct: form.color3Pct, ml: decMlLote * (form.color3Pct * pctFactor / 100) },
        ].filter(c => c.pct > 0),
      }
    }

    return {
      areaCm2, areaM2, cantidad,
      costo1, costo2, costo3, totalMateriales,
      gessoMl, gessoCosto, pinturaBaseMl, pinturaBaseCosto, pinturaDecMl, pinturaDecCosto, totalAcabados,
      herrajeCosto, pegaCosto, totalExtras,
      laserHoras, laserElec, laserOper, laserCosto,
      manoObraCosto, overheadCosto,
      subtotal, merma, costoTotal,
      ganancia, precioVenta,
      precioEconomico, precioNormal, precioPremium,
      matTotals, sheetsNeeded,
      colorBreakdown,
    }
  }, [form, config])

  const r = calc()

  // ─── Save quote ───
  const guardarCotizacion = () => {
    if (!form.nombre) {
      toast.error('Ingresa un nombre para el producto')
      return
    }
    const quotes = loadQuotes()
    quotes.unshift({
      id: Date.now(),
      fecha: new Date().toISOString(),
      ...form,
      precioVenta: formatC(r.precioVenta),
    })
    saveQuotes(quotes)
    toast.success('Cotización guardada')
  }

  const cargarCotizacion = (quote) => {
    const { id, fecha, precioVenta, ...rest } = quote
    setForm({ ...DEFAULT_FORM, ...rest })
    setShowHistory(false)
  }

  const eliminarCotizacion = (id) => {
    if (!confirm('¿Eliminar esta cotización?')) return
    const quotes = loadQuotes().filter(q => q.id !== id)
    saveQuotes(quotes)
    setShowHistory(false)
    setTimeout(() => setShowHistory(true), 0)
  }

  const limpiar = () => setForm(DEFAULT_FORM)

  const handleSaveConfig = () => {
    setConfig(configForm)
    persistConfig(configForm)
    setShowConfig(false)
  }

  // ─── Copy log ───
  const copiarLog = () => {
    const fecha = new Date().toLocaleDateString('es-NI')
    const log = `========================================
COTIZACIÓN - ${fecha}
========================================
Producto: ${form.nombre || 'Sin nombre'}
Cliente: ${form.cliente || 'Sin cliente'}
Cantidad: ${r.cantidad}
Método: ${form.margenTipo === 'margen' ? 'Margen sobre precio' : 'Markup sobre costo'}
Dimensiones: ${form.ancho} x ${form.alto} cm
Área: ${r.areaCm2} cm² (${r.areaM2.toFixed(4)} m²)

--- MATERIALES ---
Capa 1 (${form.materialCapa1}, ${form.coberturaCapa1}%): ${formatC(r.costo1)}
Capa 2 (${form.materialCapa2}, ${form.coberturaCapa2}%): ${formatC(r.costo2)}
Capa 3 (${form.materialCapa3}, ${form.coberturaCapa3}%): ${formatC(r.costo3)}
Total Materiales: ${formatC(r.totalMateriales)}

--- ACABADOS ---
Gesso: ${formatC(r.gessoCosto)} (${r.gessoMl.toFixed(1)} ml)
Pintura Base: ${formatC(r.pinturaBaseCosto)} (${r.pinturaBaseMl.toFixed(1)} ml)
Pintura Decorativa: ${formatC(r.pinturaDecCosto)} (${r.pinturaDecMl.toFixed(1)} ml)
Total Acabados: ${formatC(r.totalAcabados)}

--- EXTRAS ---
Herrajes: ${formatC(r.herrajeCosto)}
Pega: ${formatC(r.pegaCosto)}
Total Extras: ${formatC(r.totalExtras)}

--- TIEMPOS ---
Láser: ${formatC(r.laserCosto)} (${form.tiempoLaser} min)
Mano de Obra: ${formatC(r.manoObraCosto)} (${form.tiempoManoObra} min)
Overhead: ${formatC(r.overheadCosto)} (${form.tiempoOverhead} min)

--- RESUMEN ---
Subtotal: ${formatC(r.subtotal)}
Merma (${config.merma}%): ${formatC(r.merma)}
COSTO TOTAL: ${formatC(r.costoTotal)}
Ganancia (${form.margen}%): ${formatC(r.ganancia)}
PRECIO VENTA: ${formatC(r.precioVenta)}
TU SUELDO: ${formatC(r.manoObraCosto)}
INGRESO TOTAL: ${formatC(r.ganancia + r.manoObraCosto)}
========================================`
    navigator.clipboard.writeText(log).then(() => toast.success('Resumen copiado'))
      .catch(() => toast.error('No se pudo copiar'))
  }

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879]' />
      </div>
    )
  }

  if (!user) {
    navigate('/admin')
    return null
  }

  // ─── Input helper ───
  const Input = ({ label, field, type = 'number', ...props }) => (
    <div>
      <label className='block text-sm font-medium text-gray-600 mb-1'>{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={e => updateForm(field, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
        {...props}
      />
    </div>
  )

  const Select = ({ label, field, options }) => (
    <div>
      <label className='block text-sm font-medium text-gray-600 mb-1'>{label}</label>
      <select
        value={form[field]}
        onChange={e => updateForm(field, e.target.value)}
        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{MATERIAL_LABELS[opt]}</option>
        ))}
      </select>
    </div>
  )

  const ResultRow = ({ label, value, bold, accent }) => (
    <div className={`flex justify-between py-1.5 ${bold ? 'font-bold' : ''} ${accent ? 'text-green-700 bg-green-50 px-3 -mx-3 rounded-lg' : ''}`}>
      <span className='text-gray-600'>{label}</span>
      <span className={accent ? 'text-green-700' : 'text-gray-900'}>{value}</span>
    </div>
  )

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='max-w-6xl mx-auto px-4'>
        {/* Header */}
        <div className='bg-white rounded-2xl shadow-soft p-5 mb-6'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-bold text-gray-800'>Calculadora de Costos</h1>
              <p className='text-gray-500 text-sm'>Estima costos, materiales y precios de venta</p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <button onClick={guardarCotizacion} className='bg-[#51c879] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#45b86b] transition-colors'>
                💾 Guardar
              </button>
              <button onClick={() => setShowHistory(true)} className='bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors'>
                📂 Historial
              </button>
              <button onClick={copiarLog} className='bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors'>
                📋 Copiar Log
              </button>
              <button onClick={() => { setConfigForm(config); setShowConfig(true) }} className='bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-300 transition-colors'>
                ⚙️ Config
              </button>
              <button onClick={limpiar} className='bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-300 transition-colors'>
                🗑️ Limpiar
              </button>
              <button onClick={() => navigate('/admin')} className='bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-300 transition-colors'>
                ← Admin
              </button>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* ─── LEFT: Inputs ─── */}
          <div className='lg:col-span-2 space-y-5'>
            {/* Product info */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-4'>📦 Producto</h2>
              <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3'>
                <Input label='Nombre' field='nombre' type='text' placeholder='Ej: Cuadro MDF' />
                <Input label='Cliente' field='cliente' type='text' placeholder='Nombre del cliente' />
                <Input label='Cantidad' field='cantidad' min={1} step={1} />
                <div>
                  <label className='block text-sm font-medium text-gray-600 mb-1'>Área</label>
                  <div className='px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700'>
                    {r.areaCm2.toFixed(0)} cm² ({r.areaM2.toFixed(4)} m²)
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-3 mt-3'>
                <Input label='Ancho (cm)' field='ancho' min={0} step={0.1} />
                <Input label='Alto / Largo (cm)' field='alto' min={0} step={0.1} />
              </div>
            </div>

            {/* MDF Layers */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-4'>🪵 Capas de MDF</h2>
              {[1, 2, 3].map(n => (
                <div key={n} className='grid grid-cols-3 gap-3 mb-3'>
                  <div className='col-span-1'>
                    <Select label={`Capa ${n}`} field={`materialCapa${n}`} options={MATERIAL_OPTIONS} />
                  </div>
                  <div className='col-span-1'>
                    <Input label='Cobertura %' field={`coberturaCapa${n}`} min={0} max={100} />
                  </div>
                  <div className='col-span-1'>
                    <label className='block text-sm font-medium text-gray-600 mb-1'>Costo</label>
                    <div className='px-3 py-2 bg-gray-100 rounded-lg text-sm'>
                      {formatC(n === 1 ? r.costo1 : n === 2 ? r.costo2 : r.costo3)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Extras */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-4'>🔩 Extras</h2>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                <Input label='Herrajes (sets)' field='herrajes' min={0} />
                <div>
                  <label className='block text-sm font-medium text-gray-600 mb-1'>Costo herrajes</label>
                  <div className='px-3 py-2 bg-gray-100 rounded-lg text-sm'>{formatC(r.herrajeCosto)}</div>
                </div>
                <Input label='Pega loca (uds)' field='pegaLoca' min={0} />
                <div>
                  <label className='block text-sm font-medium text-gray-600 mb-1'>Costo pega</label>
                  <div className='px-3 py-2 bg-gray-100 rounded-lg text-sm'>{formatC(r.pegaCosto)}</div>
                </div>
              </div>
            </div>

            {/* Times */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-4'>⏱️ Tiempos (minutos)</h2>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                <div>
                  <Input label='Láser (min)' field='tiempoLaser' min={0} />
                  <p className='text-xs text-gray-400 mt-1'>{formatC(r.laserCosto)} ({r.laserHoras.toFixed(2)}h)</p>
                </div>
                <div>
                  <Input label='Mano de obra (min)' field='tiempoManoObra' min={0} />
                  <p className='text-xs text-gray-400 mt-1'>{formatC(r.manoObraCosto)}</p>
                </div>
                <div>
                  <Input label='Overhead (min)' field='tiempoOverhead' min={0} />
                  <p className='text-xs text-gray-400 mt-1'>{formatC(r.overheadCosto)}</p>
                </div>
              </div>
            </div>

            {/* Margin */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-4'>💰 Margen</h2>
              <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                <Input label='Margen %' field='margen' min={0} />
                <div>
                  <label className='block text-sm font-medium text-gray-600 mb-1'>Tipo</label>
                  <select
                    value={form.margenTipo}
                    onChange={e => updateForm('margenTipo', e.target.value)}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                  >
                    <option value='markup'>Markup sobre costo</option>
                    <option value='margen'>Margen sobre precio</option>
                  </select>
                </div>
                <div className='flex items-end gap-2'>
                  {[30, 40, 50, 60, 80].map(p => (
                    <button
                      key={p}
                      onClick={() => updateForm('margen', p)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        form.margen === p ? 'bg-[#51c879] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <div className='flex items-center gap-3 mb-4'>
                <h2 className='text-lg font-bold text-gray-800'>🎨 Distribución de Colores</h2>
                <label className='flex items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={form.usarColores}
                    onChange={e => updateForm('usarColores', e.target.checked)}
                    className='rounded'
                  />
                  Activar
                </label>
              </div>
              {form.usarColores && (
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                  <Input label='Color 1' field='color1' type='text' />
                  <Input label='% Color 1' field='color1Pct' min={0} max={100} />
                  <Input label='Color 2' field='color2' type='text' />
                  <Input label='% Color 2' field='color2Pct' min={0} max={100} />
                  <Input label='Color 3' field='color3' type='text' />
                  <Input label='% Color 3' field='color3Pct' min={0} max={100} />
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT: Results ─── */}
          <div className='space-y-5'>
            {/* Unit breakdown */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-3'>📊 Desglose Unitario</h2>
              <div className='space-y-1 text-sm'>
                <ResultRow label='Materiales' value={formatC(r.totalMateriales)} />
                <ResultRow label='Acabados' value={formatC(r.totalAcabados)} />
                <ResultRow label='Extras' value={formatC(r.totalExtras)} />
                <ResultRow label='Láser' value={formatC(r.laserCosto)} />
                <ResultRow label='Mano de obra' value={formatC(r.manoObraCosto)} />
                <ResultRow label='Overhead' value={formatC(r.overheadCosto)} />
                <div className='border-t my-2' />
                <ResultRow label='Subtotal' value={formatC(r.subtotal)} bold />
                <ResultRow label={`Merma (${config.merma}%)`} value={formatC(r.merma)} />
                <ResultRow label='Costo Total' value={formatC(r.costoTotal)} bold />
                <div className='border-t my-2' />
                <ResultRow label={`Ganancia (${form.margen}%)`} value={formatC(r.ganancia)} />
                <ResultRow label='Precio Venta' value={formatC(r.precioVenta)} bold accent />
              </div>
            </div>

            {/* Income */}
            <div className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] rounded-xl p-5 text-white'>
              <h2 className='text-lg font-bold mb-3'>💵 Tu Ingreso</h2>
              <div className='space-y-2 text-sm'>
                <div className='flex justify-between'>
                  <span>Tu sueldo</span>
                  <span className='font-bold'>{formatC(r.manoObraCosto)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Ganancia</span>
                  <span className='font-bold'>{formatC(r.ganancia)}</span>
                </div>
                <div className='border-t border-white/30 my-2' />
                <div className='flex justify-between text-lg'>
                  <span className='font-bold'>Ingreso Total</span>
                  <span className='font-bold'>{formatC(r.ganancia + r.manoObraCosto)}</span>
                </div>
              </div>
            </div>

            {/* Price suggestions */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-3'>💡 Sugerencias de Precio</h2>
              <div className='space-y-2 text-sm'>
                <div className='flex justify-between items-center'>
                  <span className='text-gray-600'>Económico (30%)</span>
                  <span className='font-semibold text-yellow-600'>{formatC(r.precioEconomico)}</span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-gray-600'>Normal (50%)</span>
                  <span className='font-semibold text-green-600'>{formatC(r.precioNormal)}</span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-gray-600'>Premium (80%)</span>
                  <span className='font-semibold text-blue-600'>{formatC(r.precioPremium)}</span>
                </div>
                {r.areaCm2 > 0 && (
                  <>
                    <div className='border-t my-2' />
                    <div className='flex justify-between items-center'>
                      <span className='text-gray-600'>Precio por cm²</span>
                      <span className='font-semibold'>{formatC(r.precioVenta / r.areaCm2)}/cm²</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Batch totals */}
            {r.cantidad > 1 && (
              <div className='bg-white rounded-xl shadow-soft p-5'>
                <h2 className='text-lg font-bold text-gray-800 mb-3'>📦 Lote ({r.cantidad} uds)</h2>
                <div className='space-y-1 text-sm'>
                  <ResultRow label='Costo Total' value={formatC(r.costoTotal * r.cantidad)} bold />
                  <ResultRow label='Ganancia' value={formatC(r.ganancia * r.cantidad)} />
                  <ResultRow label='Tu sueldo' value={formatC(r.manoObraCosto * r.cantidad)} />
                  <ResultRow label='Ingreso Total' value={formatC((r.ganancia + r.manoObraCosto) * r.cantidad)} />
                  <div className='border-t my-2' />
                  <ResultRow label='Precio Venta Lote' value={formatC(r.precioVenta * r.cantidad)} bold accent />
                </div>
              </div>
            )}

            {/* Materials needed for batch */}
            <div className='bg-white rounded-xl shadow-soft p-5'>
              <h2 className='text-lg font-bold text-gray-800 mb-3'>🧮 Materiales para {r.cantidad} ud{r.cantidad > 1 ? 's' : ''}</h2>
              <div className='space-y-2 text-xs'>
                {Object.entries(r.matTotals).filter(([, v]) => v > 0).map(([mat, cm2]) => (
                  <div key={mat} className='bg-gray-50 rounded-lg p-2'>
                    <span className='font-semibold'>{MATERIAL_LABELS[mat]}</span>
                    <span className='text-gray-500 ml-2'>
                      {cm2.toFixed(0)} cm² · {r.sheetsNeeded(cm2)} lámina{r.sheetsNeeded(cm2) > 1 ? 's' : ''} 4×8
                    </span>
                  </div>
                ))}
                <div className='bg-gray-50 rounded-lg p-2'>
                  <span className='font-semibold'>Gesso</span>
                  <span className='text-gray-500 ml-2'>{(r.gessoMl * r.cantidad).toFixed(1)} ml</span>
                </div>
                <div className='bg-gray-50 rounded-lg p-2'>
                  <span className='font-semibold'>Pintura base</span>
                  <span className='text-gray-500 ml-2'>{(r.pinturaBaseMl * r.cantidad).toFixed(1)} ml</span>
                </div>
                <div className='bg-gray-50 rounded-lg p-2'>
                  <span className='font-semibold'>Pintura decorativa</span>
                  <span className='text-gray-500 ml-2'>{(r.pinturaDecMl * r.cantidad).toFixed(1)} ml</span>
                </div>
                {r.colorBreakdown && (
                  <div className='bg-purple-50 rounded-lg p-2'>
                    <span className='font-semibold'>Colores</span>
                    <span className='text-gray-500 ml-2'>
                      {r.colorBreakdown.colors.map(c => `${c.name}: ${c.ml.toFixed(1)} ml`).join(' · ')}
                    </span>
                  </div>
                )}
                {form.herrajes > 0 && (
                  <div className='bg-gray-50 rounded-lg p-2'>
                    <span className='font-semibold'>Herrajes</span>
                    <span className='text-gray-500 ml-2'>{form.herrajes * r.cantidad} sets</span>
                  </div>
                )}
                {form.pegaLoca > 0 && (
                  <div className='bg-gray-50 rounded-lg p-2'>
                    <span className='font-semibold'>Pega loca</span>
                    <span className='text-gray-500 ml-2'>{form.pegaLoca * r.cantidad} uds</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Config Modal ─── */}
      {showConfig && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4' onClick={e => e.target === e.currentTarget && setShowConfig(false)}>
          <div className='bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6'>
            <div className='flex justify-between items-center mb-5'>
              <h2 className='text-xl font-bold text-gray-800'>⚙️ Configuración de Precios</h2>
              <button onClick={() => setShowConfig(false)} className='text-gray-500 hover:text-gray-700 text-2xl'>×</button>
            </div>

            <div className='space-y-4'>
              <h3 className='font-semibold text-gray-700 border-b pb-1'>Materiales (C$/cm²)</h3>
              {Object.keys(configForm.materiales).map(mat => (
                <div key={mat} className='flex items-center gap-3'>
                  <label className='text-sm text-gray-600 w-24'>{MATERIAL_LABELS[mat]}</label>
                  <input
                    type='number'
                    step='0.0001'
                    value={configForm.materiales[mat]}
                    onChange={e => setConfigForm({
                      ...configForm,
                      materiales: { ...configForm.materiales, [mat]: parseFloat(e.target.value) || 0 }
                    })}
                    className='flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm'
                  />
                </div>
              ))}

              <h3 className='font-semibold text-gray-700 border-b pb-1 pt-2'>Gesso</h3>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-xs text-gray-500'>C$/ml</label>
                  <input type='number' step='0.01' value={configForm.gesso.precioPorMl}
                    onChange={e => setConfigForm({ ...configForm, gesso: { ...configForm.gesso, precioPorMl: parseFloat(e.target.value) || 0 } })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
                <div>
                  <label className='text-xs text-gray-500'>ml/m²</label>
                  <input type='number' step='1' value={configForm.gesso.mlPorM2}
                    onChange={e => setConfigForm({ ...configForm, gesso: { ...configForm.gesso, mlPorM2: parseFloat(e.target.value) || 0 } })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
              </div>

              <h3 className='font-semibold text-gray-700 border-b pb-1 pt-2'>Pintura</h3>
              <div className='grid grid-cols-3 gap-3'>
                <div>
                  <label className='text-xs text-gray-500'>C$/ml</label>
                  <input type='number' step='0.01' value={configForm.pintura.precioPorMl}
                    onChange={e => setConfigForm({ ...configForm, pintura: { ...configForm.pintura, precioPorMl: parseFloat(e.target.value) || 0 } })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
                <div>
                  <label className='text-xs text-gray-500'>Base ml/m²</label>
                  <input type='number' step='1' value={configForm.pintura.basePerM2}
                    onChange={e => setConfigForm({ ...configForm, pintura: { ...configForm.pintura, basePerM2: parseFloat(e.target.value) || 0 } })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
                <div>
                  <label className='text-xs text-gray-500'>Dec ml/m²</label>
                  <input type='number' step='1' value={configForm.pintura.decPerM2}
                    onChange={e => setConfigForm({ ...configForm, pintura: { ...configForm.pintura, decPerM2: parseFloat(e.target.value) || 0 } })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
              </div>

              <h3 className='font-semibold text-gray-700 border-b pb-1 pt-2'>Extras (C$/unidad)</h3>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-xs text-gray-500'>Herraje</label>
                  <input type='number' step='0.1' value={configForm.herraje}
                    onChange={e => setConfigForm({ ...configForm, herraje: parseFloat(e.target.value) || 0 })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
                <div>
                  <label className='text-xs text-gray-500'>Pega</label>
                  <input type='number' step='0.1' value={configForm.pega}
                    onChange={e => setConfigForm({ ...configForm, pega: parseFloat(e.target.value) || 0 })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
              </div>

              <h3 className='font-semibold text-gray-700 border-b pb-1 pt-2'>Tarifas (C$/hora)</h3>
              <div className='grid grid-cols-3 gap-3'>
                <div>
                  <label className='text-xs text-gray-500'>Láser</label>
                  <input type='number' step='1' value={configForm.laser}
                    onChange={e => setConfigForm({ ...configForm, laser: parseFloat(e.target.value) || 0 })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
                <div>
                  <label className='text-xs text-gray-500'>Mano de obra</label>
                  <input type='number' step='1' value={configForm.manoObra}
                    onChange={e => setConfigForm({ ...configForm, manoObra: parseFloat(e.target.value) || 0 })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
                <div>
                  <label className='text-xs text-gray-500'>Overhead</label>
                  <input type='number' step='1' value={configForm.overhead}
                    onChange={e => setConfigForm({ ...configForm, overhead: parseFloat(e.target.value) || 0 })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
              </div>

              <h3 className='font-semibold text-gray-700 border-b pb-1 pt-2'>Electricidad</h3>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-xs text-gray-500'>Tarifa kWh (C$)</label>
                  <input type='number' step='0.01' value={configForm.electricidad.tarifaKwh}
                    onChange={e => setConfigForm({ ...configForm, electricidad: { ...configForm.electricidad, tarifaKwh: parseFloat(e.target.value) || 0 } })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
                <div>
                  <label className='text-xs text-gray-500'>Láser Watts</label>
                  <input type='number' step='1' value={configForm.electricidad.laserWatts}
                    onChange={e => setConfigForm({ ...configForm, electricidad: { ...configForm.electricidad, laserWatts: parseFloat(e.target.value) || 0 } })}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
                </div>
              </div>

              <h3 className='font-semibold text-gray-700 border-b pb-1 pt-2'>Merma</h3>
              <div>
                <label className='text-xs text-gray-500'>Merma %</label>
                <input type='number' step='0.5' value={configForm.merma}
                  onChange={e => setConfigForm({ ...configForm, merma: parseFloat(e.target.value) || 0 })}
                  className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm' />
              </div>
            </div>

            <div className='flex gap-3 mt-6'>
              <button onClick={() => { setConfigForm(structuredClone(DEFAULT_CONFIG)); }}
                className='flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm'>
                Restaurar Defaults
              </button>
              <button onClick={handleSaveConfig}
                className='flex-1 bg-[#51c879] text-white px-4 py-2 rounded-lg font-semibold hover:bg-[#45b86b] text-sm'>
                Guardar Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── History Modal ─── */}
      {showHistory && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4' onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className='bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6'>
            <div className='flex justify-between items-center mb-5'>
              <h2 className='text-xl font-bold text-gray-800'>📂 Historial de Cotizaciones</h2>
              <button onClick={() => setShowHistory(false)} className='text-gray-500 hover:text-gray-700 text-2xl'>×</button>
            </div>

            {(() => {
              const quotes = loadQuotes()
              if (quotes.length === 0) {
                return <p className='text-gray-500 text-center py-8'>No hay cotizaciones guardadas</p>
              }
              return (
                <div className='space-y-3'>
                  {quotes.map(q => (
                    <div key={q.id} className='border rounded-xl p-4 hover:bg-gray-50 transition-colors'>
                      <div className='flex justify-between items-start mb-2'>
                        <div>
                          <h4 className='font-semibold text-gray-800'>{q.nombre || 'Sin nombre'}</h4>
                          <p className='text-sm text-gray-500'>
                            {q.cliente || 'Sin cliente'} · {new Date(q.fecha).toLocaleDateString('es-NI')} · {q.ancho}×{q.alto}cm
                          </p>
                        </div>
                        <span className='font-bold text-green-600'>{q.precioVenta}</span>
                      </div>
                      <div className='flex gap-2'>
                        <button onClick={() => cargarCotizacion(q)}
                          className='bg-blue-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-600'>
                          📂 Cargar
                        </button>
                        <button onClick={() => eliminarCotizacion(q.id)}
                          className='bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600'>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
