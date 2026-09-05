import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { createMachine, deleteMachine, fetchBusinessMachines, updateMachine } from '../data/machines'
import { daysBetween, moneyNIO, nicaraguaDay, nicaraguaToday, summarisePayments } from '../utils/finance'

const formInitial = { name: '', monthly_amount: '', cycle_day: '1', notes: '', is_active: true }

const storageKey = (businessId) => `machine-goal:${businessId}`

const toIsoDay = (date) => date.toISOString().slice(0, 10)

/**
 * The billing cycle containing today, shifted by `offset` cycles.
 * A cycle_day of 4 yields "4 sep → 3 oct"; the cycle that contains today only
 * starts this month once the roll-over day has already passed.
 */
function cycleRange(cycleDay, offset, today) {
  const [year, month, day] = today.split('-').map(Number)
  const startMonth = month - 1 + (day >= cycleDay ? 0 : -1) + offset
  return {
    start: toIsoDay(new Date(Date.UTC(year, startMonth, cycleDay))),
    end: toIsoDay(new Date(Date.UTC(year, startMonth + 1, cycleDay - 1))),
  }
}

const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-NI', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function MachineGoals({ businessId, payments }) {
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [cycleOffset, setCycleOffset] = useState(0)
  const [showManager, setShowManager] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(formInitial)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedId('')
    setCycleOffset(0)
    setShowManager(false)
    if (businessId != null) loadMachines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  const loadMachines = async () => {
    setLoading(true)
    const { data, error } = await fetchBusinessMachines(businessId)
    if (error) toast.error(`No se pudieron cargar las máquinas: ${error.message}`)
    else {
      const rows = data || []
      setMachines(rows)
      // Restore the last machine watched for this business, if it still exists.
      const stored = localStorage.getItem(storageKey(businessId))
      setSelectedId(rows.some((m) => m.id === stored) ? stored : '')
    }
    setLoading(false)
  }

  const selectMachine = (id) => {
    setSelectedId(id)
    setCycleOffset(0)
    if (id) localStorage.setItem(storageKey(businessId), id)
    else localStorage.removeItem(storageKey(businessId))
  }

  const selected = machines.find((m) => m.id === selectedId) || null

  const goal = useMemo(() => {
    if (!selected) return null
    const today = nicaraguaToday()
    const { start, end } = cycleRange(selected.cycle_day, cycleOffset, today)
    const { net } = summarisePayments(
      payments.filter((p) => {
        const day = nicaraguaDay(p.paid_at)
        return day >= start && day <= end
      }),
    )
    const target = Number(selected.monthly_amount || 0)
    const missing = Math.max(0, target - net)
    // Today counts as a day you can still sell in, so the remaining span is inclusive.
    const daysLeft = Math.max(0, daysBetween(today, end) + 1)
    const isClosed = today > end
    return {
      start,
      end,
      net,
      target,
      missing,
      daysLeft,
      isClosed,
      pct: target > 0 ? Math.min(100, (net / target) * 100) : 0,
      perDay: daysLeft > 0 ? missing / daysLeft : 0,
    }
  }, [selected, cycleOffset, payments])

  const openForm = (machine) => {
    setEditing(machine)
    setForm(
      machine
        ? {
            name: machine.name,
            monthly_amount: String(machine.monthly_amount),
            cycle_day: String(machine.cycle_day),
            notes: machine.notes || '',
            is_active: machine.is_active,
          }
        : formInitial,
    )
  }

  const submitForm = async (event) => {
    event.preventDefault()
    const amount = Number(form.monthly_amount)
    if (!form.name.trim()) return toast.error('Ponele un nombre a la máquina.')
    if (!Number.isFinite(amount) || amount < 0) return toast.error('El monto mensual no es válido.')

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      monthly_amount: amount,
      cycle_day: Number(form.cycle_day),
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    }
    const { data, error } = editing
      ? await updateMachine(editing.id, payload, businessId)
      : await createMachine(payload, businessId)
    setSaving(false)

    if (error) return toast.error(`No se pudo guardar: ${error.message}`)
    toast.success(editing ? 'Máquina actualizada' : 'Máquina registrada')
    setEditing(null)
    setForm(formInitial)
    await loadMachines()
    if (!editing && data) selectMachine(data.id)
  }

  const removeMachine = async (machine) => {
    const { error } = await deleteMachine(machine.id, businessId)
    if (error) return toast.error(`No se pudo eliminar: ${error.message}`)
    toast.success('Máquina eliminada')
    if (machine.id === selectedId) selectMachine('')
    await loadMachines()
  }

  if (loading) return null

  return (
    <div className='bg-white rounded-2xl shadow-soft p-5'>
      <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
        <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Meta de máquina</p>
        <div className='flex items-center gap-2'>
          <select
            value={selectedId}
            onChange={(e) => selectMachine(e.target.value)}
            className='px-3 py-1.5 text-sm border border-gray-200 rounded-xl bg-white font-medium text-gray-700 focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
          >
            <option value=''>Sin máquina</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
                {machine.is_active ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowManager(true)}
            className='text-xs font-semibold text-gray-500 hover:text-[#51c879] px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors'
          >
            Gestionar
          </button>
        </div>
      </div>

      {machines.length === 0 ? (
        <p className='text-sm text-gray-400 text-center py-6'>
          Todavía no registrás máquinas. Agregá una para seguir cuánto falta para pagarla este ciclo.
        </p>
      ) : !selected ? (
        <p className='text-sm text-gray-400 text-center py-6'>
          Elegí una máquina para ver cuánto te falta vender en su ciclo.
        </p>
      ) : (
        <>
          <div className='flex items-center justify-between gap-3 mb-4'>
            <button
              onClick={() => setCycleOffset((offset) => offset - 1)}
              className='text-gray-400 hover:text-[#51c879] px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors'
              aria-label='Ciclo anterior'
            >
              ‹
            </button>
            <p className='text-sm font-semibold text-gray-700'>
              {dayLabel(goal.start)} → {dayLabel(goal.end)}
              {goal.isClosed && <span className='ml-2 text-xs font-normal text-gray-400'>ciclo cerrado</span>}
            </p>
            <button
              onClick={() => setCycleOffset((offset) => Math.min(0, offset + 1))}
              disabled={cycleOffset >= 0}
              className='text-gray-400 hover:text-[#51c879] px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent'
              aria-label='Ciclo siguiente'
            >
              ›
            </button>
          </div>

          <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
            <div className='bg-gradient-to-br from-slate-50 to-slate-100 p-4 rounded-xl'>
              <p className='text-xs text-gray-500 font-medium mb-1'>Meta del ciclo</p>
              <p className='text-xl font-bold text-gray-900'>{moneyNIO(goal.target)}</p>
            </div>
            <div className='bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-xl'>
              <p className='text-xs text-emerald-600 font-medium mb-1'>Neto en el ciclo</p>
              <p className='text-xl font-bold text-emerald-900'>{moneyNIO(goal.net)}</p>
              <p className='text-[11px] text-emerald-500 mt-0.5'>{goal.pct.toFixed(0)}% de la meta</p>
            </div>
            <div
              className={`p-4 rounded-xl col-span-2 sm:col-span-1 ${
                goal.missing > 0.009
                  ? 'bg-gradient-to-br from-red-50 to-red-100'
                  : 'bg-gradient-to-br from-[#51c879]/10 to-[#50bfe6]/10'
              }`}
            >
              <p className={`text-xs font-medium mb-1 ${goal.missing > 0.009 ? 'text-red-500' : 'text-emerald-600'}`}>
                {goal.missing > 0.009 ? 'Falta' : 'Meta cumplida'}
              </p>
              <p className={`text-xl font-bold ${goal.missing > 0.009 ? 'text-red-900' : 'text-emerald-900'}`}>
                {goal.missing > 0.009 ? moneyNIO(goal.missing) : `+${moneyNIO(goal.net - goal.target)}`}
              </p>
              <p className='text-[11px] text-gray-400 mt-0.5'>
                {goal.missing <= 0.009
                  ? 'De sobra sobre la meta'
                  : goal.isClosed
                    ? 'El ciclo cerró sin cubrirse'
                    : `${goal.daysLeft} día${goal.daysLeft !== 1 ? 's' : ''} · ${moneyNIO(goal.perDay)}/día`}
              </p>
            </div>
          </div>

          <div className='h-2.5 bg-gray-100 rounded-full overflow-hidden mt-4'>
            <div
              className={`h-2.5 rounded-full transition-all ${goal.missing > 0.009 ? 'bg-[#51c879]' : 'bg-emerald-500'}`}
              style={{ width: `${Math.round(goal.pct)}%` }}
            />
          </div>
          <p className='text-[11px] text-gray-400 mt-2'>
            Cuenta el neto recibido (pagos del ciclo menos comisión de tarjeta).
          </p>
        </>
      )}

      {showManager && (
        <MachineManager
          machines={machines}
          editing={editing}
          form={form}
          saving={saving}
          onChange={setForm}
          onOpenForm={openForm}
          onSubmit={submitForm}
          onDelete={removeMachine}
          onClose={() => {
            setShowManager(false)
            setEditing(null)
            setForm(formInitial)
          }}
        />
      )}
    </div>
  )
}

function MachineManager({ machines, editing, form, saving, onChange, onOpenForm, onSubmit, onDelete, onClose }) {
  const field = (key) => (event) =>
    onChange({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })

  return (
    <div className='fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4'>
      <div className='w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl'>
        <div className='sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4'>
          <h2 className='font-bold text-gray-800'>Máquinas</h2>
          <button onClick={onClose} className='text-sm text-gray-400 hover:text-gray-700'>
            Cerrar
          </button>
        </div>

        <div className='divide-y divide-gray-100'>
          {machines.length === 0 ? (
            <p className='px-5 py-6 text-center text-sm text-gray-400'>Sin máquinas registradas.</p>
          ) : (
            machines.map((machine) => (
              <div key={machine.id} className='flex items-center gap-3 px-5 py-3'>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-semibold text-gray-800 truncate'>
                    {machine.name}
                    {!machine.is_active && <span className='ml-2 text-xs font-normal text-gray-400'>inactiva</span>}
                  </p>
                  <p className='text-xs text-gray-400'>
                    {moneyNIO(machine.monthly_amount)} · ciclo del {machine.cycle_day}
                  </p>
                </div>
                <button
                  onClick={() => onOpenForm(machine)}
                  className='text-xs text-gray-400 hover:text-[#51c879] px-2 py-1 rounded-lg hover:bg-gray-50'
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(machine)}
                  className='text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50'
                >
                  Eliminar
                </button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmit} className='space-y-3 border-t border-gray-100 px-5 py-4'>
          <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>
            {editing ? 'Editar máquina' : 'Nueva máquina'}
          </p>
          <input
            value={form.name}
            onChange={field('name')}
            placeholder='Nombre (ej. Impresora 3D)'
            className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
          />
          <div className='grid grid-cols-2 gap-3'>
            <label className='block'>
              <span className='text-xs text-gray-500'>Monto mensual (C$)</span>
              <input
                type='number'
                min='0'
                step='0.01'
                value={form.monthly_amount}
                onChange={field('monthly_amount')}
                className='mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
              />
            </label>
            <label className='block'>
              <span className='text-xs text-gray-500'>Día de corte</span>
              <select
                value={form.cycle_day}
                onChange={field('cycle_day')}
                className='mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            value={form.notes}
            onChange={field('notes')}
            rows={2}
            placeholder='Notas (opcional)'
            className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
          />
          <label className='flex items-center gap-2 text-sm text-gray-600'>
            <input type='checkbox' checked={form.is_active} onChange={field('is_active')} className='rounded' />
            Activa
          </label>
          <div className='flex gap-2'>
            <button
              type='submit'
              disabled={saving}
              className='flex-1 rounded-xl bg-[#51c879] px-4 py-2 text-sm font-semibold text-white hover:bg-[#45b06a] disabled:opacity-50'
            >
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar máquina'}
            </button>
            {editing && (
              <button
                type='button'
                onClick={() => onOpenForm(null)}
                className='rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50'
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
