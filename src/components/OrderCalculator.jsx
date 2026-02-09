import { useState } from 'react'
import { supabase } from '../config/supabaseClient'
import { TABLE } from '../utils/constants'
import {
  loadConfig, MATERIAL_LABELS, MATERIAL_OPTIONS, SHEET_CM2,
} from '../utils/calculatorConfig'

const DEFAULT_ITEM_PARAMS = {
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
}

function calcItem(item, config) {
  const ancho = item.width || 0
  const alto = item.length || 0
  const cantidad = Math.max(1, item.quantity || 1)
  const p = item.params
  const areaCm2 = ancho * alto
  const areaM2 = areaCm2 / 10000

  const matUsage = { mdf3mm: 0, mdf5mm: 0, mdf9mm: 0, plywood: 0 }
  const addMat = (mat, cob) => {
    if (mat !== 'ninguno') matUsage[mat] += areaCm2 * (cob / 100)
  }
  addMat(p.materialCapa1, p.coberturaCapa1)
  addMat(p.materialCapa2, p.coberturaCapa2)
  addMat(p.materialCapa3, p.coberturaCapa3)

  const gessoMl = areaM2 * config.gesso.mlPorM2
  const pinturaBaseMl = areaM2 * config.pintura.basePerM2
  const pinturaDecMl = areaM2 * config.pintura.decPerM2

  const tiempoLaser = p.tiempoLaser || 0
  const tiempoMO = p.tiempoManoObra || 0
  const tiempoOH = p.tiempoOverhead || 0
  const tiempoTotal = tiempoLaser + tiempoMO + tiempoOH

  return {
    areaCm2, cantidad, matUsage,
    gessoMl, pinturaBaseMl, pinturaDecMl,
    herrajes: p.herrajes || 0, pegaLoca: p.pegaLoca || 0,
    tiempoLaser, tiempoMO, tiempoOH, tiempoTotal,
    tiempoTotalLote: tiempoTotal * cantidad,
    matUsageLote: Object.fromEntries(
      Object.entries(matUsage).map(([k, v]) => [k, v * cantidad])
    ),
    gessoMlLote: gessoMl * cantidad,
    pinturaBaseMlLote: pinturaBaseMl * cantidad,
    pinturaDecMlLote: pinturaDecMl * cantidad,
    herrajesLote: (p.herrajes || 0) * cantidad,
    pegaLocaLote: (p.pegaLoca || 0) * cantidad,
  }
}

export default function OrderCalculator({ orders, onClose }) {
  const [config] = useState(loadConfig)
  const [expandedOrder, setExpandedOrder] = useState(orders.length === 1 ? 0 : null)
  const [expandedItem, setExpandedItem] = useState(null)
  const [saving, setSaving] = useState(false)

  const [orderItems, setOrderItems] = useState(() =>
    orders.map(order => {
      const saved = order.calculator_data
      return {
        order,
        items: order.order_items.map(oi => {
          const savedItem = saved?.items?.find(s => s.id === oi.id)
          return {
            id: oi.id,
            name: oi.product_name,
            quantity: oi.quantity,
            width: savedItem?.width ?? oi.products?.width ?? 0,
            length: savedItem?.length ?? oi.products?.length ?? 0,
            params: savedItem?.params ?? { ...DEFAULT_ITEM_PARAMS },
          }
        }),
      }
    })
  )

  const saveCalculatorData = async () => {
    setSaving(true)
    try {
      for (const { order, items } of orderItems) {
        const calculator_data = {
          items: items.map(item => ({
            id: item.id, width: item.width, length: item.length, params: item.params,
          })),
          savedAt: new Date().toISOString(),
        }
        const { error } = await supabase
          .from(TABLE.ORDERS)
          .update({ calculator_data })
          .eq('id', order.id)
        if (error) throw error
      }
      alert('✅ Datos guardados')
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateParam = (orderIdx, itemIdx, field, value) => {
    setOrderItems(prev => prev.map((o, oi) =>
      oi === orderIdx
        ? { ...o, items: o.items.map((item, ii) =>
            ii === itemIdx ? { ...item, params: { ...item.params, [field]: value } } : item
          )}
        : o
    ))
  }

  const updateField = (orderIdx, itemIdx, field, value) => {
    setOrderItems(prev => prev.map((o, oi) =>
      oi === orderIdx
        ? { ...o, items: o.items.map((item, ii) =>
            ii === itemIdx ? { ...item, [field]: value } : item
          )}
        : o
    ))
  }

  // Calculate
  const orderResults = orderItems.map(({ order, items }) => {
    const itemResults = items.map(item => calcItem(item, config))
    const totals = itemResults.reduce((acc, r) => ({
      tiempoMin: acc.tiempoMin + r.tiempoTotalLote,
      tiempoLaser: acc.tiempoLaser + r.tiempoLaser * r.cantidad,
      tiempoMO: acc.tiempoMO + r.tiempoMO * r.cantidad,
      tiempoOH: acc.tiempoOH + r.tiempoOH * r.cantidad,
    }), { tiempoMin: 0, tiempoLaser: 0, tiempoMO: 0, tiempoOH: 0 })
    return { order, items, itemResults, totals }
  })

  const grand = orderResults.reduce((acc, { totals }) => ({
    tiempoMin: acc.tiempoMin + totals.tiempoMin,
    tiempoLaser: acc.tiempoLaser + totals.tiempoLaser,
    tiempoMO: acc.tiempoMO + totals.tiempoMO,
    tiempoOH: acc.tiempoOH + totals.tiempoOH,
  }), { tiempoMin: 0, tiempoLaser: 0, tiempoMO: 0, tiempoOH: 0 })

  const grandMat = { mdf3mm: 0, mdf5mm: 0, mdf9mm: 0, plywood: 0 }
  let grandGesso = 0, grandPintBase = 0, grandPintDec = 0, grandHerrajes = 0, grandPega = 0
  orderResults.forEach(({ itemResults }) => {
    itemResults.forEach(r => {
      Object.entries(r.matUsageLote).forEach(([k, v]) => { grandMat[k] += v })
      grandGesso += r.gessoMlLote
      grandPintBase += r.pinturaBaseMlLote
      grandPintDec += r.pinturaDecMlLote
      grandHerrajes += r.herrajesLote
      grandPega += r.pegaLocaLote
    })
  })

  const sheetsNeeded = (cm2) => cm2 > 0 ? Math.ceil(cm2 / SHEET_CM2) : 0
  const sheetPct = (cm2) => ((cm2 / SHEET_CM2) * 100).toFixed(1)
  const fmtTime = (min) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h ${m > 0 ? m + 'min' : ''}` : `${m}min`
  }

  const isMulti = orders.length > 1
  const totalItems = orders.reduce((s, o) => s + o.order_items.length, 0)

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4' onClick={e => e.target === e.currentTarget && onClose()}>
      <div className='bg-white rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col'>
        {/* Header */}
        <div className='p-5 border-b flex justify-between items-start flex-shrink-0'>
          <div>
            <h2 className='text-xl font-bold text-gray-800'>
              ⏱ Tiempos y Materiales {isMulti ? `— ${orders.length} Pedidos` : `— Pedido #${orders[0].order_number}`}
            </h2>
            <p className='text-sm text-gray-500 mt-1'>
              {isMulti
                ? `${orders.map(o => `#${o.order_number}`).join(', ')} · ${totalItems} productos`
                : `${orders[0].customer_name} · ${totalItems} producto${totalItems > 1 ? 's' : ''}`
              }
            </p>
          </div>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600 text-2xl leading-none'>×</button>
        </div>

        {/* Content */}
        <div className='flex-1 overflow-y-auto p-5 space-y-4'>
          {/* Time Summary */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <div className='bg-purple-50 rounded-xl p-4 text-center'>
              <p className='text-xs text-purple-600 font-medium'>Tiempo Total</p>
              <p className='text-2xl font-bold text-purple-900'>{fmtTime(grand.tiempoMin)}</p>
              <p className='text-xs text-purple-500'>~{(grand.tiempoMin / 60 / 8).toFixed(1)} días</p>
            </div>
            <div className='bg-red-50 rounded-xl p-4 text-center'>
              <p className='text-xs text-red-600 font-medium'>Láser</p>
              <p className='text-2xl font-bold text-red-900'>{fmtTime(grand.tiempoLaser)}</p>
            </div>
            <div className='bg-blue-50 rounded-xl p-4 text-center'>
              <p className='text-xs text-blue-600 font-medium'>Mano de Obra</p>
              <p className='text-2xl font-bold text-blue-900'>{fmtTime(grand.tiempoMO)}</p>
            </div>
            <div className='bg-gray-100 rounded-xl p-4 text-center'>
              <p className='text-xs text-gray-600 font-medium'>Overhead</p>
              <p className='text-2xl font-bold text-gray-900'>{fmtTime(grand.tiempoOH)}</p>
            </div>
          </div>

          {/* Materials Summary */}
          <div className='bg-amber-50 rounded-xl p-4'>
            <h3 className='text-sm font-bold text-amber-800 mb-3'>🧮 Materiales Totales</h3>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm'>
              {Object.entries(grandMat).filter(([, v]) => v > 0).map(([mat, cm2]) => (
                <div key={mat} className='bg-white rounded-lg p-2'>
                  <p className='font-semibold text-gray-800'>{MATERIAL_LABELS[mat]}</p>
                  <p className='text-gray-600'>{cm2.toFixed(0)} cm² usados</p>
                  <p className='text-amber-700 text-xs font-medium'>
                    Comprar: {sheetsNeeded(cm2)} lámina{sheetsNeeded(cm2) > 1 ? 's' : ''} 4×8
                  </p>
                  <p className='text-gray-400 text-xs'>Uso: {sheetPct(cm2)}% de lámina</p>
                </div>
              ))}
              {grandGesso > 0 && (
                <div className='bg-white rounded-lg p-2'>
                  <p className='font-semibold text-gray-800'>Gesso</p>
                  <p className='text-gray-600'>{grandGesso.toFixed(1)} ml</p>
                </div>
              )}
              {grandPintBase > 0 && (
                <div className='bg-white rounded-lg p-2'>
                  <p className='font-semibold text-gray-800'>Pintura Base</p>
                  <p className='text-gray-600'>{grandPintBase.toFixed(1)} ml</p>
                </div>
              )}
              {grandPintDec > 0 && (
                <div className='bg-white rounded-lg p-2'>
                  <p className='font-semibold text-gray-800'>Pintura Decorativa</p>
                  <p className='text-gray-600'>{grandPintDec.toFixed(1)} ml</p>
                </div>
              )}
              {grandHerrajes > 0 && (
                <div className='bg-white rounded-lg p-2'>
                  <p className='font-semibold text-gray-800'>Herrajes</p>
                  <p className='text-gray-600'>{grandHerrajes} sets</p>
                </div>
              )}
              {grandPega > 0 && (
                <div className='bg-white rounded-lg p-2'>
                  <p className='font-semibold text-gray-800'>Pega Loca</p>
                  <p className='text-gray-600'>{grandPega} uds</p>
                </div>
              )}
            </div>
          </div>

          {/* Per-order sections */}
          {orderResults.map(({ order, items, itemResults, totals }, orderIdx) => (
            <div key={order.id} className='border rounded-xl overflow-hidden'>
              {/* Order header */}
              <div
                className='flex items-center justify-between p-4 bg-white cursor-pointer hover:bg-gray-50 transition-colors border-b'
                onClick={() => setExpandedOrder(expandedOrder === orderIdx ? null : orderIdx)}
              >
                <div className='flex items-center gap-3'>
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedOrder === orderIdx ? 'rotate-180' : ''}`} fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                  </svg>
                  <span className='text-lg font-bold text-gray-800'>Pedido #{order.order_number}</span>
                  <span className='text-sm text-gray-500'>{order.customer_name}</span>
                  <span className='text-sm text-gray-400'>· {items.length} producto{items.length > 1 ? 's' : ''}</span>
                </div>
                <div className='flex gap-4 text-sm'>
                  <span className='text-purple-700 font-semibold'>⏱ {fmtTime(totals.tiempoMin)}</span>
                  <span className='text-red-600'>Láser: {fmtTime(totals.tiempoLaser)}</span>
                  <span className='text-blue-600'>MO: {fmtTime(totals.tiempoMO)}</span>
                </div>
              </div>

              {/* Order items */}
              {expandedOrder === orderIdx && (
                <div className='p-4 space-y-3 bg-gray-50/50'>
                  {items.map((item, itemIdx) => {
                    const r = itemResults[itemIdx]
                    const itemKey = `${orderIdx}-${itemIdx}`
                    const isExpanded = expandedItem === itemKey

                    return (
                      <div key={item.id} className='bg-white border rounded-lg overflow-hidden'>
                        {/* Item header */}
                        <div
                          className='flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors'
                          onClick={() => setExpandedItem(isExpanded ? null : itemKey)}
                        >
                          <div className='flex items-center gap-3 flex-1'>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                            </svg>
                            <span className='font-semibold text-gray-800'>{item.name}</span>
                            <span className='text-sm text-gray-500'>×{item.quantity}</span>
                            {item.width > 0 && item.length > 0 ? (
                              <span className='text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full'>
                                {item.width}×{item.length} cm
                              </span>
                            ) : (
                              <span className='text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full'>
                                ⚠️ Sin medidas
                              </span>
                            )}
                          </div>
                          <div className='flex gap-3 text-sm'>
                            <span className='text-purple-700 font-medium'>⏱ {fmtTime(r.tiempoTotalLote)}</span>
                            <span className='text-gray-500'>{r.areaCm2.toFixed(0)} cm²</span>
                          </div>
                        </div>

                        {/* Expanded item params */}
                        {isExpanded && (
                          <div className='p-4 border-t bg-gray-50/50 space-y-4'>
                            {/* Dimensions */}
                            <div>
                              <h4 className='text-xs font-bold text-gray-500 uppercase mb-2'>📐 Dimensiones</h4>
                              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                                <div>
                                  <label className='text-xs text-gray-500'>Ancho (cm)</label>
                                  <input type='number' min={0} step={0.1} value={item.width}
                                    onChange={e => updateField(orderIdx, itemIdx, 'width', parseFloat(e.target.value) || 0)}
                                    className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                </div>
                                <div>
                                  <label className='text-xs text-gray-500'>Largo (cm)</label>
                                  <input type='number' min={0} step={0.1} value={item.length}
                                    onChange={e => updateField(orderIdx, itemIdx, 'length', parseFloat(e.target.value) || 0)}
                                    className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                </div>
                                <div>
                                  <label className='text-xs text-gray-500'>Área</label>
                                  <div className='px-2 py-1.5 bg-white border rounded-lg text-sm text-gray-600'>
                                    {r.areaCm2.toFixed(0)} cm²
                                  </div>
                                </div>
                                <div>
                                  <label className='text-xs text-gray-500'>Cantidad</label>
                                  <div className='px-2 py-1.5 bg-white border rounded-lg text-sm text-gray-600'>
                                    {item.quantity}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* MDF Layers */}
                            <div>
                              <h4 className='text-xs font-bold text-gray-500 uppercase mb-2'>🪵 Capas de MDF</h4>
                              {[1, 2, 3].map(n => (
                                <div key={n} className='grid grid-cols-2 gap-3 mb-2'>
                                  <div>
                                    <label className='text-xs text-gray-500'>Capa {n}</label>
                                    <select
                                      value={item.params[`materialCapa${n}`]}
                                      onChange={e => updateParam(orderIdx, itemIdx, `materialCapa${n}`, e.target.value)}
                                      className='w-full px-2 py-1.5 border rounded-lg text-sm'
                                    >
                                      {MATERIAL_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{MATERIAL_LABELS[opt]}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className='text-xs text-gray-500'>Cobertura %</label>
                                    <input type='number' min={0} max={100}
                                      value={item.params[`coberturaCapa${n}`]}
                                      onChange={e => updateParam(orderIdx, itemIdx, `coberturaCapa${n}`, parseFloat(e.target.value) || 0)}
                                      className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Extras */}
                            <div>
                              <h4 className='text-xs font-bold text-gray-500 uppercase mb-2'>🔩 Extras</h4>
                              <div className='grid grid-cols-2 gap-3'>
                                <div>
                                  <label className='text-xs text-gray-500'>Herrajes (sets)</label>
                                  <input type='number' min={0}
                                    value={item.params.herrajes}
                                    onChange={e => updateParam(orderIdx, itemIdx, 'herrajes', parseInt(e.target.value) || 0)}
                                    className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                </div>
                                <div>
                                  <label className='text-xs text-gray-500'>Pega loca (uds)</label>
                                  <input type='number' min={0}
                                    value={item.params.pegaLoca}
                                    onChange={e => updateParam(orderIdx, itemIdx, 'pegaLoca', parseInt(e.target.value) || 0)}
                                    className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                </div>
                              </div>
                            </div>

                            {/* Times */}
                            <div>
                              <h4 className='text-xs font-bold text-gray-500 uppercase mb-2'>⏱ Tiempos (minutos)</h4>
                              <div className='grid grid-cols-3 gap-3'>
                                <div>
                                  <label className='text-xs text-gray-500'>Láser</label>
                                  <input type='number' min={0}
                                    value={item.params.tiempoLaser}
                                    onChange={e => updateParam(orderIdx, itemIdx, 'tiempoLaser', parseInt(e.target.value) || 0)}
                                    className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                </div>
                                <div>
                                  <label className='text-xs text-gray-500'>Mano de obra</label>
                                  <input type='number' min={0}
                                    value={item.params.tiempoManoObra}
                                    onChange={e => updateParam(orderIdx, itemIdx, 'tiempoManoObra', parseInt(e.target.value) || 0)}
                                    className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                </div>
                                <div>
                                  <label className='text-xs text-gray-500'>Overhead</label>
                                  <input type='number' min={0}
                                    value={item.params.tiempoOverhead}
                                    onChange={e => updateParam(orderIdx, itemIdx, 'tiempoOverhead', parseInt(e.target.value) || 0)}
                                    className='w-full px-2 py-1.5 border rounded-lg text-sm' />
                                </div>
                              </div>
                            </div>

                            {/* Per-item summary */}
                            <div className='bg-white rounded-lg p-3 border'>
                              <h4 className='text-xs font-bold text-gray-500 uppercase mb-2'>Resumen del Producto (×{item.quantity})</h4>
                              <div className='grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs'>
                                <div>
                                  <span className='text-gray-500'>Tiempo total:</span>
                                  <span className='ml-1 font-semibold text-purple-700'>{fmtTime(r.tiempoTotalLote)}</span>
                                </div>
                                {Object.entries(r.matUsageLote).filter(([, v]) => v > 0).map(([mat, cm2]) => (
                                  <div key={mat}>
                                    <span className='text-gray-500'>{MATERIAL_LABELS[mat]}:</span>
                                    <span className='ml-1 font-semibold'>{cm2.toFixed(0)} cm² ({sheetPct(cm2)}%)</span>
                                  </div>
                                ))}
                                {r.gessoMlLote > 0 && (
                                  <div>
                                    <span className='text-gray-500'>Gesso:</span>
                                    <span className='ml-1 font-semibold'>{r.gessoMlLote.toFixed(1)} ml</span>
                                  </div>
                                )}
                                {r.pinturaBaseMlLote > 0 && (
                                  <div>
                                    <span className='text-gray-500'>Pintura base:</span>
                                    <span className='ml-1 font-semibold'>{r.pinturaBaseMlLote.toFixed(1)} ml</span>
                                  </div>
                                )}
                                {r.pinturaDecMlLote > 0 && (
                                  <div>
                                    <span className='text-gray-500'>Pintura dec:</span>
                                    <span className='ml-1 font-semibold'>{r.pinturaDecMlLote.toFixed(1)} ml</span>
                                  </div>
                                )}
                                {r.herrajesLote > 0 && (
                                  <div>
                                    <span className='text-gray-500'>Herrajes:</span>
                                    <span className='ml-1 font-semibold'>{r.herrajesLote} sets</span>
                                  </div>
                                )}
                                {r.pegaLocaLote > 0 && (
                                  <div>
                                    <span className='text-gray-500'>Pega loca:</span>
                                    <span className='ml-1 font-semibold'>{r.pegaLocaLote} uds</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className='p-5 border-t flex justify-between items-center flex-shrink-0 bg-white'>
          <p className='text-xs text-gray-400'>
            Los datos se guardan por pedido en Supabase
          </p>
          <div className='flex gap-3'>
            <button
              onClick={onClose}
              className='px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium'
            >
              Cerrar
            </button>
            <button
              onClick={saveCalculatorData}
              disabled={saving}
              className='px-5 py-2.5 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] disabled:opacity-50 transition-all shadow-md'
            >
              {saving ? 'Guardando...' : '💾 Guardar Datos'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
