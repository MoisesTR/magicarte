import { useState } from 'react'
import toast from 'react-hot-toast'
import { createOrder, updateOrder, deleteOrderItems, insertOrderItems } from '../data/orders'
import { addPayment, updatePayment } from '../data/payments'
import { ENGRAVING_MATERIALS } from '../utils/constants'

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const today = () => new Date().toISOString().split('T')[0]

/**
 * Lightweight job log for the engraving business (Joyería). Captures just the
 * essentials — description, total, material reimbursement, and a snapshot of
 * the profit split — and saves it as a completed + paid order. The displayed
 * amounts are derived from those facts, so the partner settlement stays sound.
 * Pass `editingOrder` (a row from fetchOrdersForBusiness, with its order_items
 * and order_payments) to edit an existing job instead of creating a new one.
 */
export default function QuickEngravingForm({
  businessId,
  partnerName = 'Papá',
  partnerSplitPct = 50,
  editingOrder = null,
  onClose,
  onSaved,
}) {
  const existingItem = editingOrder?.order_items?.[0]
  const existingPayment = editingOrder?.order_payments?.[0]

  // Legacy jobs (created before the Cliente/Nota split) never had a
  // product_description — their customer_name is actually old note text, not a
  // real client name. Only trust customer_name as a client name when this order
  // already has a product_description (i.e. it was saved with the split fields).
  const isLegacyJob = Boolean(editingOrder) && !existingItem?.product_description
  const legacyNote = isLegacyJob ? editingOrder?.customer_name || '' : ''

  const [date, setDate] = useState(editingOrder?.order_date || today())
  const [clientName, setClientName] = useState(isLegacyJob ? '' : editingOrder?.customer_name || '')
  const [description, setDescription] = useState(existingItem?.product_description || legacyNote)
  const [total, setTotal] = useState(editingOrder ? String(editingOrder.total_amount ?? '') : '')
  const [material, setMaterial] = useState(existingItem?.material || ENGRAVING_MATERIALS[0])
  const [minutes, setMinutes] = useState(existingItem?.engraving_minutes ?? '')
  const [materialCost, setMaterialCost] = useState(editingOrder ? String(editingOrder.material_cost ?? 0) : '')
  const [materialPaidBy, setMaterialPaidBy] = useState(editingOrder?.material_paid_by || 'us')
  const [splitPct, setSplitPct] = useState(
    editingOrder?.partner_split_pct ?? String(partnerSplitPct ?? 50),
  )
  const [method, setMethod] = useState(existingPayment?.method || 'efectivo')
  const [saving, setSaving] = useState(false)

  const partnerShort = partnerName.split(' ')[0] || 'Papá'

  const effectiveTotal = num(total)
  const effectiveMaterialCost = num(materialCost)
  const effectiveSplitPct = Math.min(100, Math.max(0, num(splitPct)))
  const profit = effectiveTotal - effectiveMaterialCost
  const partnerTake = profit * (effectiveSplitPct / 100) + (materialPaidBy === 'partner' ? effectiveMaterialCost : 0)
  const myTake = profit * (1 - effectiveSplitPct / 100) + (materialPaidBy === 'us' ? effectiveMaterialCost : 0)

  const handleSave = async () => {
    if (effectiveTotal <= 0) {
      toast.error('Escribe el total')
      return
    }
    if (effectiveMaterialCost > effectiveTotal) {
      toast.error('El costo de material no puede superar el total cobrado')
      return
    }
    // Client name is optional — fall back to the note, then the material, then a generic label.
    const note = description.trim()
    const displayName = clientName.trim() || note || material || 'Grabado'

    setSaving(true)
    try {
      let orderId
      if (editingOrder) {
        const { error: orderErr } = await updateOrder(editingOrder.id, {
          customer_name: displayName,
          order_date: date,
          total_amount: effectiveTotal,
          material_cost: effectiveMaterialCost,
          material_paid_by: materialPaidBy,
          partner_split_pct: effectiveSplitPct,
        })
        if (orderErr) throw orderErr
        orderId = editingOrder.id

        const { error: delErr } = await deleteOrderItems(orderId)
        if (delErr) throw delErr
      } else {
        const { data: orderRows, error: orderErr } = await createOrder(
          {
            customer_name: displayName,
            order_date: date,
            status: 'completed',
            priority: 'normal',
            payment_status: 'paid',
            delivery_method: 'pickup',
            delivery_fee: 0,
            is_gift: false,
            total_amount: effectiveTotal,
            material_cost: effectiveMaterialCost,
            material_paid_by: materialPaidBy,
            partner_split_pct: effectiveSplitPct,
            completed_at: new Date().toISOString(),
          },
          businessId,
        )
        if (orderErr) throw orderErr
        orderId = orderRows[0].id
      }

      const { error: itemErr } = await insertOrderItems([
        {
          order_id: orderId,
          product_id: null,
          product_name: displayName,
          product_description: note || null,
          quantity: 1,
          unit_price: effectiveTotal,
          hours_needed: null,
          rush_fee: 0,
          subtotal: effectiveTotal,
          material,
          engraving_minutes: minutes === '' ? null : parseInt(minutes, 10),
        },
      ])
      if (itemErr) throw itemErr

      if (existingPayment) {
        const { error: payErr } = await updatePayment(existingPayment.id, {
          amount: effectiveTotal,
          method,
          paid_at: date,
        })
        if (payErr) throw payErr
      } else {
        const { error: payErr } = await addPayment(
          { order_id: orderId, amount: effectiveTotal, method, paid_at: date, note: null },
          businessId,
        )
        if (payErr) throw payErr
      }

      toast.success(editingOrder ? 'Grabado actualizado' : 'Grabado registrado')
      onSaved?.()
      onClose?.()
    } catch (e) {
      toast.error('Error al guardar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <div className='w-full max-w-md rounded-2xl bg-white shadow-xl'>
        <div className='flex items-center justify-between border-b border-gray-100 p-5'>
          <h2 className='text-lg font-bold text-gray-800'>{editingOrder ? 'Editar grabado' : 'Registro rápido de grabado'}</h2>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600'>
            <svg className='h-6 w-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
            </svg>
          </button>
        </div>

        <div className='space-y-4 p-5'>
          <div>
            <label className='mb-1.5 block text-xs font-medium text-gray-600'>Cliente <span className='font-normal text-gray-400'>(opcional)</span></label>
            <input
              type='text'
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder='Ej. Juan Pérez'
              className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
            />
          </div>

          <div>
            <label className='mb-1.5 block text-xs font-medium text-gray-600'>Nota <span className='font-normal text-gray-400'>(opcional)</span></label>
            <input
              type='text'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Ej. anillo de bodas'
              className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
            />
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='mb-1.5 block text-xs font-medium text-gray-600'>Material / pieza</label>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
              >
                {ENGRAVING_MATERIALS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className='mb-1.5 block text-xs font-medium text-gray-600'>Minutos de grabado</label>
              <input
                type='number'
                step='1'
                min='0'
                value={minutes}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder='Ej. 15'
                className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
              />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='mb-1.5 block text-xs font-medium text-gray-600'>Fecha</label>
              <input
                type='date'
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
              />
            </div>
            <div>
              <label className='mb-1.5 block text-xs font-medium text-gray-600'>Total (C$)</label>
              <input
                type='number'
                step='0.01'
                min='0'
                value={total}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setTotal(e.target.value)}
                placeholder='600'
                className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
              />
            </div>
          </div>

          <div className='rounded-xl border border-amber-200 bg-amber-50 p-3'>
            <p className='mb-3 text-xs font-semibold uppercase tracking-wide text-amber-800'>Material y reparto de utilidad</p>
            <div className='grid grid-cols-2 gap-3'>
              <div>
                <label className='mb-1 block text-[11px] text-gray-600'>Costo de material (C$)</label>
                <input
                  type='number'
                  step='0.01'
                  min='0'
                  value={materialCost}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setMaterialCost(e.target.value)}
                  placeholder='0'
                  className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
                />
              </div>
              <div>
                <label className='mb-1 block text-[11px] text-gray-600'>¿Quién lo pagó?</label>
                <select value={materialPaidBy} onChange={(e) => setMaterialPaidBy(e.target.value)} className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'>
                  <option value='us'>Nosotros</option>
                  <option value='partner'>{partnerShort}</option>
                </select>
              </div>
              <div className='col-span-2'>
                <label className='mb-1 block text-[11px] text-gray-600'>Porcentaje para {partnerShort} de la utilidad</label>
                <div className='relative'>
                  <input
                    type='number'
                    step='0.01'
                    min='0'
                    max='100'
                    value={splitPct}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setSplitPct(e.target.value)}
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
                  />
                  <span className='pointer-events-none absolute right-3 top-2.5 text-sm text-gray-400'>%</span>
                </div>
              </div>
            </div>
            <div className='mt-3 grid grid-cols-2 gap-3 border-t border-amber-200 pt-3 text-sm'>
              <div><p className='text-[11px] text-amber-800'>Tu parte</p><p className='font-bold text-green-700'>C$ {myTake.toFixed(2)}</p></div>
              <div><p className='text-[11px] text-amber-800'>Parte de {partnerShort}</p><p className='font-bold text-amber-900'>C$ {partnerTake.toFixed(2)}</p></div>
            </div>
            <p className='mt-2 text-[11px] text-amber-800/80'>Utilidad a repartir: C$ {Math.max(0, profit).toFixed(2)}. El material se reembolsa a quien lo pagó.</p>
          </div>

          <div>
            <label className='mb-1.5 block text-xs font-medium text-gray-600'>Método de pago</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#B08A3C]'
            >
              <option value='efectivo'>Efectivo</option>
              <option value='transferencia'>Transferencia</option>
              <option value='tarjeta'>Tarjeta</option>
            </select>
          </div>
        </div>

        <div className='flex gap-3 border-t border-gray-100 p-5'>
          <button
            onClick={onClose}
            className='rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className='flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
            style={{ backgroundColor: '#B08A3C' }}
          >
            {saving ? 'Guardando...' : editingOrder ? 'Actualizar grabado' : 'Registrar grabado'}
          </button>
        </div>
      </div>
    </div>
  )
}
