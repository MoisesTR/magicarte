import { useEffect, useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Description } from '@headlessui/react'
import { addInventoryMovement, fetchItemInventoryMovements } from '../data/inventory'
import { filamentDetails, openSpoolAdjustment, stockSummary } from '../utils/filamentWall'
import { SpoolIllustration } from './SpoolCard'

const formatMoney = value => `C$ ${Number(value).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatAmount = value => Number(value).toLocaleString('es-NI', { maximumFractionDigits: 3 })
const movementNames = { opening: 'Saldo inicial', purchase: 'Compra', sale: 'Venta', consumption: 'Uso en pedido', adjustment: 'Ajuste', return: 'Devolución' }

export default function FilamentDetail({ item, businessId, onClose, onEdit, onRefresh }) {
  const details = filamentDetails(item)
  const stock = stockSummary(item)
  const [recent, setRecent] = useState([])
  const [historyStatus, setHistoryStatus] = useState('loading')
  const [historyVersion, setHistoryVersion] = useState(0)
  const [unit, setUnit] = useState('percent')
  const [value, setValue] = useState(() => String(stock.openGrams / stock.gramsPerSpool * 100))
  const [pending, setPending] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let active = true
    setHistoryStatus('loading')
    const load = async () => {
      try {
        const { data, error } = await fetchItemInventoryMovements(businessId, item.id)
        if (!active) return
        setRecent(error ? [] : data || [])
        setHistoryStatus(error ? 'error' : 'ready')
      } catch {
        if (active) setHistoryStatus('error')
      }
    }
    load()
    return () => { active = false }
  }, [businessId, item.id, historyVersion])

  useEffect(() => {
    setPending(null)
    setValue(String(unit === 'percent' ? stock.openGrams / stock.gramsPerSpool * 100 : stock.openGrams))
    // A refreshed total invalidates an old confirmation; changing units converts separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.current_stock, item.grams_per_spool])

  const changeValue = next => {
    setValue(next)
    setPending(null)
    setMessage('')
    setSaveError('')
  }
  const changeUnit = next => {
    if (next === unit) return
    const grams = unit === 'percent' ? Number(value) / 100 * stock.gramsPerSpool : Number(value)
    setValue(String(next === 'percent' ? grams / stock.gramsPerSpool * 100 : Math.round(grams * 1000) / 1000))
    setUnit(next)
    setPending(null)
    setSaveError('')
  }
  const previewAdjustment = event => {
    event.preventDefault()
    setSaveError('')
    try {
      const movement = openSpoolAdjustment(item, value, unit)
      if (movement.quantity_delta === 0) { setMessage('La existencia ya coincide.'); return }
      setPending({ movement, previousStock: Number(item.current_stock) })
    } catch (error) { setSaveError(error.message) }
  }
  const confirmAdjustment = async () => {
    if (!pending || saving || !item.is_active) return
    if (pending.previousStock !== Number(item.current_stock)) {
      setPending(null)
      setSaveError('La existencia cambió. Revisa el ajuste otra vez.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const { error } = await addInventoryMovement(pending.movement, businessId)
      if (error) throw error
      setPending(null)
      setMessage('Existencia actualizada.')
      await onRefresh()
      setHistoryVersion(version => version + 1)
    } catch { setSaveError('No pudimos guardar el ajuste. Intenta de nuevo.') }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={() => !saving && onClose()} className='filament-drawer relative z-50'>
      <DialogBackdrop className='fixed inset-0 bg-slate-950/45 backdrop-blur-sm' />
      <div className='fixed inset-0 flex justify-end'>
        <DialogPanel className='filament-drawer-panel relative h-full w-full max-w-lg overflow-y-auto overscroll-contain bg-[#fffefa] p-5 shadow-2xl sm:p-7'>
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0'>
              <p className='text-xs font-semibold uppercase tracking-widest text-gray-500'>{details.materialLabel}</p>
              <DialogTitle className='mt-1 break-words text-2xl font-bold text-gray-900'>{details.spanishName}</DialogTitle>
              <Description className='mt-1 text-sm text-gray-500'><span lang='en'>{details.englishName}</span>{details.bambuCode && ` · Bambu ${details.bambuCode}`}</Description>
            </div>
            <button type='button' disabled={saving} onClick={onClose} aria-label='Cerrar detalle' className='filament-action min-w-10 shrink-0 text-lg'>×</button>
          </div>
          {item.product_image_url ? <figure className='my-4'>
            <img src={item.product_image_url} loading='lazy' alt={`Foto oficial de Bambu: ${item.filament_material || ''} ${details.englishName}`} className='h-56 w-full rounded-2xl bg-white object-contain' />
            <figcaption className='mt-2 text-center text-xs text-gray-500'>Foto oficial de Bambu Lab</figcaption>
          </figure> : <div className='flex justify-center py-3'><SpoolIllustration item={item} large /></div>}
          {item.product_url && <a href={item.product_url} target='_blank' rel='noopener noreferrer' className='filament-action filament-action-primary my-4 flex w-full items-center justify-center'>Ver en Bambu</a>}
          <dl className='filament-detail-grid'>
            <div><dt>Existencia</dt><dd>{formatAmount(stock.kg)} kg · {stock.rolls} {stock.rolls === 1 ? 'rollo' : 'rollos'}</dd></div>
            <div><dt>Peso por rollo</dt><dd>{formatAmount(stock.gramsPerSpool)} g</dd></div>
            <div><dt>Costo promedio / kg</dt><dd>{formatMoney(stock.costPerKg)}</dd></div>
            <div><dt>Valor en stock</dt><dd>{formatMoney(stock.stockValue)}</dd></div>
            <div><dt>Alerta de existencia</dt><dd>{formatAmount(item.low_stock_threshold || 0)} g</dd></div>
            <div><dt>Estado</dt><dd>{!item.is_active ? 'Inactivo' : stock.exhausted ? 'Agotado' : stock.low ? 'Poco' : 'Disponible'}</dd></div>
          </dl>
          <form onSubmit={previewAdjustment} className='mt-6 space-y-3 rounded-2xl border border-gray-200 p-4'>
            <h3 className='font-bold text-gray-800'>Ajustar lo que queda</h3>
            <p className='text-xs leading-relaxed text-gray-500'>Solo cambia el rollo abierto. Conservaremos {stock.closedSpools} {stock.closedSpools === 1 ? 'rollo cerrado' : 'rollos cerrados'} ({formatAmount(stock.closedSpools * stock.gramsPerSpool)} g).</p>
            <div role='group' aria-label='Unidad del ajuste' className='flex flex-wrap gap-2'>
              <button type='button' disabled={saving} aria-pressed={unit === 'percent'} onClick={() => changeUnit('percent')} className='filament-pill'>Porcentaje</button>
              <button type='button' disabled={saving} aria-pressed={unit === 'g'} onClick={() => changeUnit('g')} className='filament-pill'>Gramos</button>
            </div>
            <label className='block text-xs font-semibold text-gray-600' htmlFor='open-spool-number'>Queda en el rollo abierto ({unit === 'percent' ? '%' : 'g'})</label>
            <input id='open-spool-slider' aria-label='Queda en el rollo abierto' type='range' min='0' max={unit === 'percent' ? 100 : stock.gramsPerSpool} step={unit === 'percent' ? 0.1 : 1} disabled={saving || !item.is_active} value={value || 0} onChange={event => changeValue(event.target.value)} className='h-10 w-full accent-violet-600' />
            <input id='open-spool-number' type='number' inputMode='decimal' required min='0' max={unit === 'percent' ? 100 : stock.gramsPerSpool} step='any' disabled={saving || !item.is_active} value={value} onChange={event => changeValue(event.target.value)} className='field min-h-10 w-full min-w-0' />
            {!pending && <button type='submit' disabled={saving || !item.is_active} className='filament-action w-full'>Revisar ajuste</button>}
            {pending && <div className='space-y-3 rounded-xl bg-amber-50 p-3' role='group' aria-label='Confirmación del ajuste'>
              <p className='text-sm text-amber-950'>La existencia pasará de <strong>{formatAmount(stock.grams)} g</strong> a <strong>{formatAmount(stock.grams + pending.movement.quantity_delta)} g</strong>. Se registrará un ajuste de {pending.movement.quantity_delta > 0 ? '+' : ''}{formatAmount(pending.movement.quantity_delta)} g.</p>
              <div className='flex flex-wrap gap-2'>
                <button type='button' disabled={saving} onClick={() => setPending(null)} className='filament-action'>Volver</button>
                <button type='button' disabled={saving} onClick={confirmAdjustment} className='filament-action filament-action-primary'>{saving ? 'Guardando…' : 'Confirmar ajuste'}</button>
              </div>
            </div>}
            {message && <p role='status' className='text-sm font-medium text-emerald-800'>{message}</p>}
            {saveError && <p role='alert' className='text-sm text-red-700'>{saveError}</p>}
          </form>
          <section className='mt-6' aria-label='Movimientos recientes del filamento'>
            <h3 className='font-bold text-gray-800'>Movimientos recientes</h3>
            {historyStatus === 'loading' ? <p role='status' className='py-3 text-sm text-gray-500'>Cargando movimientos…</p> : historyStatus === 'error' ? <div className='py-3'><p role='alert' className='text-sm text-red-700'>No pudimos cargar los movimientos.</p><button type='button' onClick={() => setHistoryVersion(version => version + 1)} className='filament-action mt-2'>Reintentar</button></div> : recent.length === 0 ? <p className='py-3 text-sm text-gray-500'>Todavía no hay movimientos.</p> : <ul className='mt-2 divide-y divide-gray-100'>
              {recent.map(movement => <li key={movement.id} className='flex flex-wrap justify-between gap-2 py-3 text-sm'>
                <div className='min-w-0'><p className='font-medium text-gray-700'>{movementNames[movement.movement_type] || 'Movimiento'}</p><p className='text-xs text-gray-500'>{new Date(movement.occurred_at).toLocaleDateString('es-NI', { dateStyle: 'medium' })}</p>{movement.note && <p className='mt-1 break-words text-xs text-gray-500'>{movement.note}</p>}</div>
                <span className={`font-semibold ${Number(movement.quantity_delta) > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>{Number(movement.quantity_delta) > 0 ? '+' : ''}{formatAmount(movement.quantity_delta)} g</span>
              </li>)}
            </ul>}
          </section>
          <button type='button' disabled={saving} onClick={() => onEdit(item)} className='filament-action mt-5 w-full'>Editar filamento</button>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
