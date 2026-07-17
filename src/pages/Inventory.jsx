import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLogin from '../components/AdminLogin'
import { supabase } from '../config/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import {
  addInventoryMovement,
  createInventoryItem,
  fetchInventoryMovements,
  fetchInventoryStock,
  updateInventoryItem,
} from '../data/inventory'

const ITEM_TYPES = {
  material: 'Materia prima',
  finished_good: 'Pieza terminada',
  supply: 'Insumo',
}

const MOVEMENT_TYPES = {
  opening: 'Saldo inicial',
  purchase: 'Compra',
  sale: 'Venta',
  consumption: 'Uso en pedido',
  adjustment: 'Ajuste',
  return: 'Devolución',
}

const itemFormInitial = {
  name: '',
  sku: '',
  item_type: 'material',
  unit: 'unidad',
  opening_quantity: '',
  purchase_cost: '',
  delivery_cost: '',
  low_stock_threshold: '',
  unit_cost: '',
  supplier_name: '',
  notes: '',
  is_active: true,
}

const movementFormInitial = {
  inventory_item_id: '',
  movement_type: 'purchase',
  adjustment_direction: 'in',
  quantity: '',
  unit_cost: '',
  purchase_cost: '',
  delivery_cost: '',
  note: '',
}

const money = (value) => `C$ ${Number(value || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const amount = (value) => Number(value || 0).toLocaleString('es-NI', { maximumFractionDigits: 3 })

function normaliseItem(form) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || null,
    item_type: form.item_type,
    unit: form.unit.trim() || 'unidad',
    low_stock_threshold: Number(form.low_stock_threshold) || 0,
    unit_cost: Number(form.unit_cost) || 0,
    supplier_name: form.supplier_name.trim() || null,
    notes: form.notes.trim() || null,
    is_active: form.is_active,
  }
}

/** Shared, business-scoped stock ledger for Joyería and future businesses. */
export default function Inventory() {
  const { currentBusiness, currentBusinessId } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [items, setItems] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [showMovementForm, setShowMovementForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState(itemFormInitial)
  const [movementForm, setMovementForm] = useState(movementFormInitial)
  const [filter, setFilter] = useState('active')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser)
      setCheckingAuth(false)
    })
  }, [])

  useEffect(() => {
    if (user && currentBusinessId) loadInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentBusinessId])

  const loadInventory = async () => {
    setLoading(true)
    const [stockResult, movementResult] = await Promise.all([
      fetchInventoryStock(currentBusinessId),
      fetchInventoryMovements(currentBusinessId),
    ])
    if (stockResult.error) toast.error(`No se pudo cargar el inventario: ${stockResult.error.message}`)
    else setItems(stockResult.data || [])
    if (movementResult.error) toast.error(`No se pudo cargar el historial: ${movementResult.error.message}`)
    else setMovements(movementResult.data || [])
    setLoading(false)
  }

  const visibleItems = useMemo(() => {
    if (filter === 'low') return items.filter((item) => item.is_low_stock && item.is_active)
    if (filter === 'all') return items
    return items.filter((item) => item.is_active)
  }, [filter, items])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const activeItems = useMemo(() => items.filter((item) => item.is_active), [items])
  const lowStockCount = items.filter((item) => item.is_low_stock && item.is_active).length
  const totalValue = items
    .filter((item) => item.is_active)
    .reduce((total, item) => total + Number(item.current_stock || 0) * Number(item.unit_cost || 0), 0)

  const resetItemForm = () => {
    setShowItemForm(false)
    setEditingItem(null)
    setItemForm(itemFormInitial)
  }

  const resetMovementForm = () => {
    setShowMovementForm(false)
    setMovementForm(movementFormInitial)
  }

  const openCreateItem = () => {
    setEditingItem(null)
    setItemForm(itemFormInitial)
    setShowItemForm(true)
  }

  const openEditItem = (item) => {
    setEditingItem(item)
    setItemForm({
      name: item.name || '',
      sku: item.sku || '',
      item_type: item.item_type,
      unit: item.unit || 'unidad',
      opening_quantity: '',
      purchase_cost: '',
      delivery_cost: '',
      low_stock_threshold: item.low_stock_threshold ?? '',
      unit_cost: item.unit_cost ?? '',
      supplier_name: item.supplier_name || '',
      notes: item.notes || '',
      is_active: item.is_active,
    })
    setShowItemForm(true)
  }

  const openMovement = (item = null) => {
    setMovementForm({
      ...movementFormInitial,
      inventory_item_id: item?.id || '',
      unit_cost: item?.unit_cost ?? '',
    })
    setShowMovementForm(true)
  }

  const saveItem = async (event) => {
    event.preventDefault()
    if (!itemForm.name.trim()) {
      toast.error('Escribe el nombre del artículo')
      return
    }
    const receivedQuantity = Number(itemForm.opening_quantity)
    const packageCost = Number(itemForm.purchase_cost)
    const deliveryCost = Number(itemForm.delivery_cost) || 0
    const hasPackageCost = itemForm.purchase_cost !== ''
    if (receivedQuantity < 0) {
      toast.error('La cantidad recibida no puede ser negativa')
      return
    }
    if (hasPackageCost && !(receivedQuantity > 0)) {
      toast.error('Escribe cuántas unidades recibiste')
      return
    }
    if (hasPackageCost && packageCost < 0) {
      toast.error('El costo del paquete no puede ser negativo')
      return
    }
    if (hasPackageCost && deliveryCost < 0) {
      toast.error('El envío no puede ser negativo')
      return
    }

    setSaving(true)
    try {
      const item = normaliseItem(itemForm)
      if (editingItem) {
        const { error } = await updateInventoryItem(editingItem.id, item)
        if (error) throw error
        toast.success('Artículo actualizado')
      } else {
        const { data, error } = await createInventoryItem(item, currentBusinessId)
        if (error) throw error
        if (receivedQuantity > 0) {
          const { error: movementError } = await addInventoryMovement({
            inventory_item_id: data.id,
            movement_type: hasPackageCost ? 'purchase' : 'opening',
            quantity_delta: receivedQuantity,
            unit_cost: hasPackageCost ? null : item.unit_cost,
            purchase_cost: hasPackageCost ? packageCost : null,
            delivery_cost: hasPackageCost ? deliveryCost : 0,
            note: hasPackageCost ? 'Compra inicial' : 'Saldo inicial',
          }, currentBusinessId)
          if (movementError) throw movementError
        }
        toast.success('Artículo agregado al inventario')
      }
      resetItemForm()
      loadInventory()
    } catch (error) {
      toast.error(`No se pudo guardar: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const saveMovement = async (event) => {
    event.preventDefault()
    const item = itemById.get(movementForm.inventory_item_id)
    const enteredQuantity = Number(movementForm.quantity)
    if (!item) {
      toast.error('Selecciona un artículo')
      return
    }
    if (!(enteredQuantity > 0)) {
      toast.error('La cantidad debe ser mayor que cero')
      return
    }
    const isPurchase = movementForm.movement_type === 'purchase'
    const packageCost = Number(movementForm.purchase_cost)
    const deliveryCost = Number(movementForm.delivery_cost) || 0
    if (isPurchase && movementForm.purchase_cost === '') {
      toast.error('Escribe el costo del paquete')
      return
    }
    if (isPurchase && packageCost < 0) {
      toast.error('El costo del paquete no puede ser negativo')
      return
    }

    const direction =
      movementForm.movement_type === 'adjustment'
        ? movementForm.adjustment_direction === 'out' ? -1 : 1
        : ['sale', 'consumption'].includes(movementForm.movement_type) ? -1 : 1

    setSaving(true)
    try {
      const { error } = await addInventoryMovement({
        inventory_item_id: item.id,
        movement_type: movementForm.movement_type,
        quantity_delta: enteredQuantity * direction,
        unit_cost: isPurchase || movementForm.unit_cost === '' ? null : Number(movementForm.unit_cost),
        purchase_cost: isPurchase ? packageCost : null,
        delivery_cost: isPurchase ? deliveryCost : 0,
        note: movementForm.note.trim() || null,
      }, currentBusinessId)
      if (error) throw error
      toast.success('Movimiento registrado')
      resetMovementForm()
      loadInventory()
    } catch (error) {
      toast.error(`No se pudo registrar: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (checkingAuth) return <Loading />
  if (!user) return <AdminLogin onLogin={(authenticatedUser) => setUser(authenticatedUser)} />
  if (!currentBusinessId) return <Loading />

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='mx-auto max-w-6xl px-4'>
        <div className='mb-5 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-gray-400'>{currentBusiness?.name}</p>
            <h1 className='text-xl font-bold text-gray-800'>Inventario</h1>
            <p className='mt-0.5 text-sm text-gray-500'>Artículos, existencias y movimientos con historial.</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button onClick={() => openMovement()} disabled={!activeItems.length} className='rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'>
              + Movimiento
            </button>
            <button onClick={openCreateItem} className='rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90' style={{ backgroundColor: currentBusiness?.primary_color || '#B08A3C' }}>
              + Nuevo artículo
            </button>
          </div>
        </div>

        <div className='mb-5 grid gap-3 sm:grid-cols-3'>
          <Stat label='Artículos activos' value={items.filter((item) => item.is_active).length} />
          <Stat label='Bajo stock' value={lowStockCount} danger={lowStockCount > 0} />
          <Stat label='Valor estimado' value={money(totalValue)} />
        </div>

        <div className='mb-4 flex flex-wrap gap-2'>
          {[
            ['active', 'Activos'],
            ['low', `Bajo stock${lowStockCount ? ` (${lowStockCount})` : ''}`],
            ['all', 'Todos'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === value ? 'text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}
              style={filter === value ? { backgroundColor: currentBusiness?.primary_color || '#B08A3C' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <Panel>Cargando inventario...</Panel>
        ) : visibleItems.length === 0 ? (
          <Panel>
            {filter === 'low' ? 'No hay artículos con alerta de bajo stock.' : 'Aún no hay artículos. Registra materiales, piezas terminadas o insumos para este negocio.'}
          </Panel>
        ) : (
          <div className='overflow-hidden rounded-2xl bg-white shadow-soft'>
            <div className='overflow-x-auto'>
              <table className='min-w-full text-left text-sm'>
                <thead className='border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400'>
                  <tr>
                    <th className='px-4 py-3 font-semibold'>Artículo</th>
                    <th className='px-4 py-3 font-semibold'>Tipo</th>
                    <th className='px-4 py-3 font-semibold'>Stock</th>
                    <th className='px-4 py-3 font-semibold'>Costo promedio</th>
                    <th className='px-4 py-3 font-semibold'>Estado</th>
                    <th className='px-4 py-3 font-semibold' aria-label='Acciones' />
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-100'>
                  {visibleItems.map((item) => (
                    <tr key={item.id} className={!item.is_active ? 'opacity-55' : ''}>
                      <td className='px-4 py-3'>
                        <p className='font-semibold text-gray-800'>{item.name}</p>
                        <p className='mt-0.5 text-xs text-gray-400'>{item.sku || item.supplier_name || 'Sin código / proveedor'}</p>
                      </td>
                      <td className='px-4 py-3 text-gray-600'>{ITEM_TYPES[item.item_type]}</td>
                      <td className='px-4 py-3'>
                        <span className={`font-semibold ${item.is_low_stock && item.is_active ? 'text-red-600' : 'text-gray-800'}`}>
                          {amount(item.current_stock)} {item.unit}
                        </span>
                        <p className='mt-0.5 text-xs text-gray-400'>Mínimo: {amount(item.low_stock_threshold)}</p>
                      </td>
                      <td className='px-4 py-3 text-gray-600'>{money(item.unit_cost)}</td>
                      <td className='px-4 py-3'>
                        {!item.is_active ? <Badge tone='gray'>Inactivo</Badge> : item.is_low_stock ? <Badge tone='red'>Reponer</Badge> : <Badge tone='green'>Disponible</Badge>}
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex justify-end gap-2'>
                          <button onClick={() => openMovement(item)} disabled={!item.is_active} className='rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'>Movimiento</button>
                          <button onClick={() => openEditItem(item)} className='rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50'>Editar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <section className='mt-6 overflow-hidden rounded-2xl bg-white shadow-soft'>
          <div className='flex items-center justify-between border-b border-gray-100 px-5 py-4'>
            <div>
              <h2 className='font-bold text-gray-800'>Movimientos recientes</h2>
              <p className='text-xs text-gray-400'>El historial no se modifica: los errores se corrigen con un ajuste.</p>
            </div>
          </div>
          {movements.length === 0 ? (
            <p className='p-5 text-sm text-gray-400'>Todavía no hay movimientos.</p>
          ) : (
            <div className='divide-y divide-gray-100'>
              {movements.map((movement) => {
                const item = itemById.get(movement.inventory_item_id)
                const entering = Number(movement.quantity_delta) > 0
                return (
                  <div key={movement.id} className='flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm'>
                    <div className='min-w-44 flex-1'>
                      <p className='font-semibold text-gray-700'>{item?.name || 'Artículo eliminado'}</p>
                      <p className='text-xs text-gray-400'>{new Date(movement.occurred_at).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    </div>
                    <span className='text-gray-500'>{MOVEMENT_TYPES[movement.movement_type]}</span>
                    <span className={`font-bold ${entering ? 'text-emerald-600' : 'text-red-600'}`}>
                      {entering ? '+' : ''}{amount(movement.quantity_delta)} {item?.unit || ''}
                    </span>
                    <span className='max-w-56 truncate text-xs text-gray-400'>
                      {movement.purchase_cost != null
                        ? `${money(movement.purchase_cost)} + envío ${money(movement.delivery_cost)}`
                        : movement.note || '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {showItemForm && (
        <Modal title={editingItem ? 'Editar artículo' : 'Nuevo artículo'} onClose={resetItemForm}>
          <form onSubmit={saveItem} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <Field className='col-span-2' label='Nombre'><input required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} className='field' /></Field>
              <Field label='Código / SKU'><input value={itemForm.sku} onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })} className='field' /></Field>
              <Field label='Tipo'><select value={itemForm.item_type} onChange={(event) => setItemForm({ ...itemForm, item_type: event.target.value })} className='field'>{Object.entries(ITEM_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label='Unidad'><input required value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} placeholder='unidad, gramo, caja...' className='field' /></Field>
              {!editingItem && <>
                <Field label='Cantidad que recibiste'><input type='number' min='0' step='0.001' value={itemForm.opening_quantity} onChange={(event) => setItemForm({ ...itemForm, opening_quantity: event.target.value })} placeholder='Ej. 100' className='field' /></Field>
                <Field label='Costo del paquete (C$)'><input type='number' min='0' step='0.01' value={itemForm.purchase_cost} onChange={(event) => setItemForm({ ...itemForm, purchase_cost: event.target.value })} placeholder='Ej. 1500' className='field' /></Field>
                <Field label='Envío hasta Nicaragua (C$)'><input type='number' min='0' step='0.01' value={itemForm.delivery_cost} onChange={(event) => setItemForm({ ...itemForm, delivery_cost: event.target.value })} placeholder='Ej. 300' className='field' /></Field>
                {itemForm.purchase_cost !== '' && <div className='col-span-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900'><p className='font-semibold'>Costo puesto en Nicaragua: {money((Number(itemForm.purchase_cost) || 0) + (Number(itemForm.delivery_cost) || 0))}</p><p className='mt-0.5 text-xs text-amber-800'>Costo por {itemForm.unit || 'unidad'}: {money(((Number(itemForm.purchase_cost) || 0) + (Number(itemForm.delivery_cost) || 0)) / (Number(itemForm.opening_quantity) || 1))}</p><p className='mt-1 text-xs text-amber-800'>Se registrará como tu primera compra, no necesitas agregar un movimiento aparte.</p></div>}
              </>}
              <Field label='Alerta bajo stock'><input type='number' min='0' step='0.001' value={itemForm.low_stock_threshold} onChange={(event) => setItemForm({ ...itemForm, low_stock_threshold: event.target.value })} placeholder='0' className='field' /></Field>
              <Field label={editingItem ? 'Costo promedio actual (C$)' : 'Costo por unidad manual (opcional)'}><input type='number' min='0' step='0.01' value={itemForm.unit_cost} onChange={(event) => setItemForm({ ...itemForm, unit_cost: event.target.value })} placeholder='0' className='field' /></Field>
              <Field className='col-span-2' label='Proveedor'><input value={itemForm.supplier_name} onChange={(event) => setItemForm({ ...itemForm, supplier_name: event.target.value })} className='field' /></Field>
              <Field className='col-span-2' label='Notas'><textarea rows={2} value={itemForm.notes} onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })} className='field' /></Field>
              {editingItem && <label className='col-span-2 flex items-center gap-2 text-sm text-gray-600'><input type='checkbox' checked={itemForm.is_active} onChange={(event) => setItemForm({ ...itemForm, is_active: event.target.checked })} />Activo en inventario</label>}
            </div>
            <FormActions onCancel={resetItemForm} saving={saving} label={editingItem ? 'Guardar cambios' : 'Agregar artículo'} color={currentBusiness?.primary_color} />
          </form>
        </Modal>
      )}

      {showMovementForm && (
        <Modal title='Registrar movimiento' onClose={resetMovementForm}>
          <form onSubmit={saveMovement} className='space-y-4'>
            <Field label='Artículo'>
              <select required value={movementForm.inventory_item_id} onChange={(event) => {
                const item = itemById.get(event.target.value)
                setMovementForm({ ...movementForm, inventory_item_id: event.target.value, unit_cost: item?.unit_cost ?? '' })
              }} className='field'>
                <option value=''>Selecciona un artículo</option>
                {activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {amount(item.current_stock)} {item.unit}</option>)}
              </select>
            </Field>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Movimiento'><select value={movementForm.movement_type} onChange={(event) => setMovementForm({ ...movementForm, movement_type: event.target.value })} className='field'>{['purchase', 'sale', 'consumption', 'adjustment', 'return'].map((value) => <option key={value} value={value}>{MOVEMENT_TYPES[value]}</option>)}</select></Field>
              {movementForm.movement_type === 'adjustment' ? <Field label='Dirección'><select value={movementForm.adjustment_direction} onChange={(event) => setMovementForm({ ...movementForm, adjustment_direction: event.target.value })} className='field'><option value='in'>Aumentar stock</option><option value='out'>Reducir stock</option></select></Field> : <Field label='Cantidad'><input required type='number' min='0.001' step='0.001' value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })} className='field' /></Field>}
              {movementForm.movement_type === 'adjustment' && <Field label='Cantidad'><input required type='number' min='0.001' step='0.001' value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })} className='field' /></Field>}
              {movementForm.movement_type === 'purchase' ? (
                <>
                  <Field label='Costo del paquete (C$)'><input required type='number' min='0' step='0.01' value={movementForm.purchase_cost} onChange={(event) => setMovementForm({ ...movementForm, purchase_cost: event.target.value })} placeholder='Ej. 1500' className='field' /></Field>
                  <Field label='Envío hasta Nicaragua (C$)'><input type='number' min='0' step='0.01' value={movementForm.delivery_cost} onChange={(event) => setMovementForm({ ...movementForm, delivery_cost: event.target.value })} placeholder='Ej. 300' className='field' /></Field>
                  <div className='col-span-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900'>
                    <p className='font-semibold'>Costo puesto en Nicaragua: {money((Number(movementForm.purchase_cost) || 0) + (Number(movementForm.delivery_cost) || 0))}</p>
                    <p className='mt-0.5 text-xs text-amber-800'>Costo por {itemById.get(movementForm.inventory_item_id)?.unit || 'unidad'}: {money((Number(movementForm.purchase_cost) + (Number(movementForm.delivery_cost) || 0)) / (Number(movementForm.quantity) || 1))}</p>
                  </div>
                </>
              ) : <Field label='Costo unitario (opcional)'><input type='number' min='0' step='0.01' value={movementForm.unit_cost} onChange={(event) => setMovementForm({ ...movementForm, unit_cost: event.target.value })} className='field' /></Field>}
              <Field className='col-span-2' label='Nota'><textarea rows={2} value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} placeholder='Factura, motivo del ajuste, pedido...' className='field' /></Field>
            </div>
            <FormActions onCancel={resetMovementForm} saving={saving} label='Registrar movimiento' color={currentBusiness?.primary_color} />
          </form>
        </Modal>
      )}
    </div>
  )
}

function Field({ label, children, className = '' }) {
  return <label className={className}><span className='mb-1.5 block text-xs font-medium text-gray-600'>{label}</span>{children}</label>
}

function Modal({ title, onClose, children }) {
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <div className='max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl'>
        <div className='flex items-center justify-between border-b border-gray-100 p-5'><h2 className='text-lg font-bold text-gray-800'>{title}</h2><button type='button' onClick={onClose} className='text-2xl leading-none text-gray-400 hover:text-gray-600' aria-label='Cerrar'>×</button></div>
        <div className='p-5'>{children}</div>
      </div>
    </div>
  )
}

function FormActions({ onCancel, saving, label, color }) {
  return <div className='flex gap-3 border-t border-gray-100 pt-5'><button type='button' onClick={onCancel} className='rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'>Cancelar</button><button disabled={saving} className='flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50' style={{ backgroundColor: color || '#B08A3C' }}>{saving ? 'Guardando...' : label}</button></div>
}

function Stat({ label, value, danger = false }) {
  return <div className='rounded-2xl bg-white p-4 shadow-soft'><p className='text-xs font-semibold uppercase tracking-wide text-gray-400'>{label}</p><p className={`mt-1 text-xl font-bold ${danger ? 'text-red-600' : 'text-gray-800'}`}>{value}</p></div>
}

function Panel({ children }) {
  return <div className='rounded-2xl bg-white p-10 text-center text-sm text-gray-400 shadow-soft'>{children}</div>
}

function Badge({ tone, children }) {
  const colors = { gray: 'bg-gray-100 text-gray-500', red: 'bg-red-50 text-red-600', green: 'bg-emerald-50 text-emerald-700' }
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>
}

function Loading() {
  return <div className='flex min-h-screen items-center justify-center bg-gray-50'><div className='h-12 w-12 animate-spin rounded-full border-b-2 border-[#B08A3C]' /></div>
}
