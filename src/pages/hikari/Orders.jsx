import ThreadOrderDeliveryFields from '../../components/ThreadOrderDeliveryFields'
import { threadOrderDeliveryFields } from '../../utils/orderDraftFromThread'
import useThreadOrderDraft from '../../hooks/useThreadOrderDraft'
import ThreadOrderDraftNotice from '../../components/ThreadOrderDraftNotice'
import useThreadOrderImport from '../../hooks/useThreadOrderImport'
import ThreadConversionNotice from '../../components/ThreadConversionNotice'
import useOrderDeepLink from '../../hooks/useOrderDeepLink'
import OrderItemOptions from '../../components/OrderItemOptions'
import { catalogOrderItem, orderItemOptions, orderItemDetailLines } from '../../utils/productPresentations'
import { useEffect, useMemo, useState } from 'react'
import AdminLogin from '../../components/AdminLogin'
import { supabase } from '../../config/supabaseClient'
import { useBusiness } from '../../context/BusinessContext'
import {
  fetchOrdersForBusiness,
  fetchOrderProducts,
  createOrder,
  updateOrder,
  deleteOrder as deleteOrderRow,
  deleteOrderItems,
  insertOrderItems,
} from '../../data/orders'
import { addPayment, deletePayment as deletePaymentRow } from '../../data/payments'
import toast from 'react-hot-toast'

const STATUSES = [
  { key: 'pending', label: 'Pendiente', dot: 'bg-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-800' },
  { key: 'in_progress', label: 'Imprimiendo', dot: 'bg-violet-400', bg: 'bg-violet-50', text: 'text-violet-800' },
  { key: 'completed', label: 'Completado', dot: 'bg-green-400', bg: 'bg-green-50', text: 'text-green-800' },
  { key: 'canceled', label: 'Cancelado', dot: 'bg-gray-300', bg: 'bg-gray-50', text: 'text-gray-500' },
]

const emptyItem = () => ({ product_name: '', material: '', color: '', hours_needed: '', weight_grams: '', quantity: 1, unit_price: '' })

const today = () => new Date().toISOString().split('T')[0]

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const money = (v) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(v || 0))

const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: 'short' }) : '—')

function paymentStatusOf(totalAmount, payments) {
  const paid = (payments || []).reduce((s, p) => s + num(p.amount), 0)
  if (paid > 0.009 && paid + 0.009 >= num(totalAmount)) return 'paid'
  if (paid > 0.009) return 'partial'
  return 'unpaid'
}

const initialForm = { customer_phone: '', client_id: null, notes: '', customer_name: '', order_date: today(), status: 'pending', items: [emptyItem()] }

/**
 * Hikari Studio (3D printing) order log. Lighter than Magic Arte's order form —
 * no gift/delivery/recipient fields — but supports multiple print-job line
 * items per order (modelo, material, color, horas, gramos) and partial payments.
 */
export default function HikariOrders() {
  const { currentBusinessId, currentBusiness } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [catalogBusinessId, setCatalogBusinessId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const orderDraft = useThreadOrderDraft(initialForm, { businessId: currentBusinessId, products, catalogBusinessId, getSession: () => supabase.auth.getSession() })
  const { formData, setFormData } = orderDraft
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [payingOrderId, setPayingOrderId] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('efectivo')
  const threadImport = useThreadOrderImport((prefilled, thread) => { setEditingOrder(null); orderDraft.begin(prefilled, thread); setShowForm(true) }, currentBusinessId, Boolean(user && currentBusinessId))

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser)
      setCheckingAuth(false)
    })
  }, [])

  // Fetch only once we know the user AND the real business id; refetch on switch.
  useEffect(() => {
    let active = true
    if (user && currentBusinessId) {
      fetchOrders()
      fetchOrderProducts(currentBusinessId).then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('Error al cargar productos: ' + error.message)
        setProducts(error ? [] : data || [])
        setCatalogBusinessId(currentBusinessId)
      })
    }
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, user])

  const fetchOrders = async () => {
    setLoading(true)
    const { data, error } = await fetchOrdersForBusiness(currentBusinessId)
    if (error) toast.error('Error al cargar: ' + error.message)
    else setOrders(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    threadImport.clearImport()
    orderDraft.clear()
    setShowForm(false)
    setEditingOrder(null)
    setFormData(initialForm)
  }

  const openCreate = () => {
    threadImport.clearImport()
    orderDraft.clear()
    setEditingOrder(null)
    setFormData(initialForm)
    setShowForm(true)
  }

  const openEdit = (order) => {
    threadImport.clearImport()
    orderDraft.clear()
    setEditingOrder(order)
    setFormData({
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      client_id: order.client_id || null,
      notes: order.notes || '',
      order_date: order.order_date || today(),
      status: order.status || 'pending',
      items: (order.order_items || []).length
        ? order.order_items.map((i) => ({
            product_id: i.product_id || null,
            ...orderItemOptions(i),
            product_name: i.product_name || '',
            product_description: i.product_description || '',
            material: i.material || '',
            color: i.color || '',
            hours_needed: i.hours_needed ?? '',
            weight_grams: i.weight_grams ?? '',
            quantity: i.quantity ?? 1,
            unit_price: i.unit_price ?? '',
          }))
        : [emptyItem()],
    })
    setShowForm(true)
  }

  useOrderDeepLink(orders, openEdit, currentBusinessId, Boolean(user && currentBusinessId))

  const updateItem = (idx, field, value) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }))
  }

  const addItem = () => setFormData((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }))

  const removeItem = (idx) =>
    setFormData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))

  const total = useMemo(
    () => formData.items.reduce((s, it) => s + num(it.unit_price) * num(it.quantity || 1), 0),
    [formData.items],
  )

  const handleSave = async (e) => {
    e.preventDefault()
    if (!formData.customer_name.trim()) {
      toast.error('Escribe el nombre del cliente')
      return
    }
    const validItems = formData.items.filter((it) => it.product_name.trim())
    if (validItems.length === 0) {
      toast.error('Agrega al menos un modelo')
      return
    }

    const importedDelivery = orderDraft.isImported ? threadOrderDeliveryFields(formData) : {}
    orderDraft.cancelPending()
    setSaving(true)
    try {
      const orderData = {
        customer_name: formData.customer_name.trim(),
        customer_phone: formData.customer_phone || null,
        client_id: formData.client_id || null,
        notes: formData.notes || null,
        order_date: formData.order_date,
        status: formData.status,
        total_amount: total,
      }

      let orderId
      if (editingOrder) {
        const { error } = await updateOrder(editingOrder.id, orderData)
        if (error) throw error
        orderId = editingOrder.id
        const { error: delErr } = await deleteOrderItems(orderId)
        if (delErr) throw delErr
      } else {
        const { data, error } = await createOrder(
          { ...orderData, payment_status: 'unpaid', priority: 'normal', is_gift: false, delivery_method: 'pickup', delivery_fee: 0, ...importedDelivery },
          currentBusinessId,
        )
        if (error) throw error
        orderId = data[0].id
      }

      const { error: itemsErr } = await insertOrderItems(
        validItems.map((it) => ({
          order_id: orderId,
          product_id: it.product_id || null,
          ...orderItemOptions(it),
          product_name: it.product_name.trim(),
          product_description: it.product_description || null,
          material: it.material || null,
          color: it.color || null,
          hours_needed: it.hours_needed === '' ? null : num(it.hours_needed),
          weight_grams: it.weight_grams === '' ? null : num(it.weight_grams),
          quantity: num(it.quantity) || 1,
          unit_price: num(it.unit_price),
          subtotal: num(it.unit_price) * (num(it.quantity) || 1),
        })),
        currentBusinessId,
      )
      if (itemsErr) throw itemsErr

      if (!editingOrder) await threadImport.completeConversion(orderId)
      toast.success(editingOrder ? 'Pedido actualizado' : 'Pedido creado')
      resetForm()
      fetchOrders()
    } catch (err) {
      toast.error('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const { error } = await deleteOrderRow(id)
    if (error) toast.error('Error al eliminar: ' + error.message)
    else {
      toast.success('Pedido eliminado')
      setConfirmDeleteId(null)
      fetchOrders()
    }
  }

  const openPay = (order) => {
    setPayingOrderId(order.id)
    setPayAmount('')
    setPayMethod('efectivo')
  }

  const handleAddPayment = async (order) => {
    const amount = num(payAmount)
    if (amount <= 0) {
      toast.error('Escribe un monto')
      return
    }
    try {
      const { error } = await addPayment(
        { order_id: order.id, amount, method: payMethod, paid_at: today() },
        currentBusinessId,
      )
      if (error) throw error
      const nextPayments = [...(order.order_payments || []), { amount, method: payMethod }]
      const nextStatus = paymentStatusOf(order.total_amount, nextPayments)
      const { error: updErr } = await updateOrder(order.id, { payment_status: nextStatus })
      if (updErr) throw updErr
      toast.success('Pago registrado')
      setPayingOrderId(null)
      fetchOrders()
    } catch (err) {
      toast.error('Error al registrar pago: ' + err.message)
    }
  }

  const handleDeletePayment = async (order, paymentId) => {
    try {
      const { error } = await deletePaymentRow(paymentId)
      if (error) throw error
      const nextPayments = (order.order_payments || []).filter((p) => p.id !== paymentId)
      const nextStatus = paymentStatusOf(order.total_amount, nextPayments)
      await updateOrder(order.id, { payment_status: nextStatus })
      fetchOrders()
    } catch (err) {
      toast.error('Error al eliminar pago: ' + err.message)
    }
  }

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37] mx-auto'></div>
      </div>
    )
  }
  if (!user) return <AdminLogin onLogin={(u) => setUser(u)} />

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <ThreadConversionNotice conversion={threadImport} />
      <div className='max-w-4xl mx-auto px-4'>
        <div className='admin-page-header bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold text-gray-800'>Pedidos de impresión 3D</h1>
            <p className='text-xs text-gray-400 mt-0.5'>
              {orders.length} pedido{orders.length !== 1 ? 's' : ''} · {currentBusiness?.name}
            </p>
          </div>
          <button
            onClick={openCreate}
            className='rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90'
            style={{ backgroundColor: '#D4AF37' }}
          >
            + Nuevo pedido
          </button>
        </div>

        <div className='bg-white rounded-2xl shadow-soft overflow-hidden'>
          {loading ? (
            <div className='p-10 text-center text-gray-400 text-sm'>Cargando...</div>
          ) : orders.length === 0 ? (
            <div className='p-10 text-center text-gray-400 text-sm'>Aún no hay pedidos. Crea el primero arriba.</div>
          ) : (
            <ul className='divide-y divide-gray-100'>
              {orders.map((o) => {
                const st = STATUSES.find((s) => s.key === o.status) || STATUSES[0]
                const paid = (o.order_payments || []).reduce((s, p) => s + num(p.amount), 0)
                const balance = Math.max(0, num(o.total_amount) - paid)
                return (
                  <li key={o.id} className='px-4 py-3'>
                    <div className='flex items-center gap-3 text-sm'>
                      <div className='w-12 shrink-0 text-center text-[11px] font-semibold uppercase text-gray-400'>
                        {fmtDate(o.order_date)}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate font-semibold text-gray-800'>{o.customer_name}</p>
                        <p className='truncate text-xs text-gray-400'>
                          {(o.order_items || []).map((i) => i.product_name).join(', ') || '—'}
                        </p>
                        {(o.order_items || []).map((item, itemIndex) => orderItemDetailLines(item).length > 0 && <div key={item.id || itemIndex} className='mt-1 text-xs text-gray-500'>{orderItemDetailLines(item).map((line, lineIndex) => <p key={lineIndex} className='break-words'>{line}{lineIndex === 0 && item.presentation_label && !item.presentation_id && <span className='ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700'>especial</span>}</p>)}</div>)}
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                      <div className='shrink-0 text-right'>
                        <p className='font-bold text-gray-800'>{money(o.total_amount)}</p>
                        {balance > 0.009 ? (
                          <p className='text-[11px] text-red-500'>debe {money(balance)}</p>
                        ) : (
                          <p className='text-[11px] text-green-600'>pagado</p>
                        )}
                      </div>
                      <div className='flex shrink-0 items-center gap-1'>
                        <button onClick={() => openPay(o)} className='rounded-lg p-1.5 text-gray-300 hover:bg-gray-50 hover:text-[#D4AF37]' title='Registrar pago'>
                          <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2' />
                            <circle cx='12' cy='12' r='9' strokeWidth={2} />
                          </svg>
                        </button>
                        <button onClick={() => openEdit(o)} className='rounded-lg p-1.5 text-gray-300 hover:bg-gray-50 hover:text-gray-600' title='Editar'>
                          <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' />
                          </svg>
                        </button>
                        {confirmDeleteId === o.id ? (
                          <>
                            <button onClick={() => handleDelete(o.id)} className='rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100'>Sí</button>
                            <button onClick={() => setConfirmDeleteId(null)} className='rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-50'>No</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(o.id)} className='rounded-lg p-1.5 text-gray-300 hover:bg-gray-50 hover:text-red-500' title='Eliminar'>
                            <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {payingOrderId === o.id && (
                      <div className='mt-2 ml-14 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-2'>
                        {(o.order_payments || []).length > 0 && (
                          <div className='w-full flex flex-wrap gap-1.5 mb-1'>
                            {o.order_payments.map((p) => (
                              <span key={p.id} className='inline-flex items-center gap-1 rounded-lg bg-white border border-gray-200 px-2 py-1 text-[11px] text-gray-600'>
                                {money(p.amount)} ({p.method})
                                <button onClick={() => handleDeletePayment(o, p.id)} className='text-gray-300 hover:text-red-500'>×</button>
                              </span>
                            ))}
                          </div>
                        )}
                        <input
                          type='number'
                          step='0.01'
                          min='0'
                          value={payAmount}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder={`Saldo ${money(balance)}`}
                          className='w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-sm'
                        />
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className='rounded-lg border border-gray-200 px-2 py-1.5 text-sm'>
                          <option value='efectivo'>Efectivo</option>
                          <option value='transferencia'>Transferencia</option>
                          <option value='tarjeta'>Tarjeta</option>
                        </select>
                        <button onClick={() => handleAddPayment(o)} className='rounded-lg px-3 py-1.5 text-xs font-semibold text-white' style={{ backgroundColor: '#D4AF37' }}>
                          Registrar
                        </button>
                        <button onClick={() => setPayingOrderId(null)} className='rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-100'>
                          Cerrar
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {showForm && (
        <div className='admin-modal-backdrop'>
          <form onSubmit={handleSave} role='dialog' aria-modal='true' aria-labelledby='hikari-order-form-title' className='admin-modal-panel max-w-2xl bg-white'>


            <div className='admin-modal-header flex items-center justify-between border-b border-gray-100 p-5'>
              <h2 id='hikari-order-form-title' className='text-lg font-bold text-gray-800'>{editingOrder ? 'Editar pedido' : 'Nuevo pedido'}</h2>
              <button type='button' onClick={resetForm} aria-label='Cerrar' className='rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'>
                <svg className='h-6 w-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                </svg>
              </button>
            </div>

            <div className='admin-modal-body space-y-4 p-5'>
              <ThreadOrderDraftNotice draft={orderDraft} />
              {orderDraft.isImported && <ThreadOrderDeliveryFields form={formData} onChange={changes => setFormData(previous => ({ ...previous, ...changes }))} />}
                <div className='space-y-3'>
                  <label className='block text-xs font-medium text-gray-500'>Teléfono<input type='tel' value={formData.customer_phone || ''} onChange={e => setFormData(p => ({ ...p, customer_phone:e.target.value }))} className='mt-1 min-h-10 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm' /></label>
                  <label className='block text-xs font-medium text-gray-500'>Notas<textarea value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes:e.target.value }))} className='mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm' rows={3} /></label>
                </div>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                <div className='sm:col-span-2'>
                  <label className='mb-1.5 block text-xs font-medium text-gray-600'>Cliente</label>
                  <input
                    type='text'
                    value={formData.customer_name}
                    onChange={(e) => setFormData((p) => ({ ...p, customer_name: e.target.value }))}
                    placeholder='Nombre del cliente'
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                  />
                </div>
                <div>
                  <label className='mb-1.5 block text-xs font-medium text-gray-600'>Fecha</label>
                  <input
                    type='date'
                    value={formData.order_date}
                    onChange={(e) => setFormData((p) => ({ ...p, order_date: e.target.value }))}
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                  />
                </div>
              </div>

              <div>
                <label className='mb-1.5 block text-xs font-medium text-gray-600'>Estado</label>
                <div className='flex flex-wrap gap-2'>
                  {STATUSES.map((s) => (
                    <button
                      key={s.key}
                      type='button'
                      onClick={() => setFormData((p) => ({ ...p, status: s.key }))}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        formData.status === s.key ? `${s.bg} ${s.text} ring-1 ring-inset ring-current` : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className='mb-2 flex items-center justify-between'>
                  <label className='text-xs font-medium text-gray-600'>Modelos a imprimir</label>
                  <button type='button' onClick={addItem} className='text-xs font-semibold text-[#D4AF37] hover:underline'>
                    + Agregar modelo
                  </button>
                </div>
                <div className='space-y-3'>
                  {formData.items.map((it, idx) => (
                    <div key={idx} className='min-w-0 rounded-xl border border-gray-200 p-3'>
                      {products.some(product => product.presentations?.length || product.designs?.length || product.id === it.product_id) && <label className='mb-3 block text-xs font-medium text-gray-600'>Producto del catálogo
                        <select value={it.product_id || ''} onChange={event => setFormData(previous => ({ ...previous, items:previous.items.map((row, i) => i === idx ? catalogOrderItem(products.find(product => product.id === event.target.value), row) : row) }))} className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm'>
                          <option value=''>Modelo personalizado</option>
                          {products.filter(product => product.presentations?.length || product.designs?.length || product.id === it.product_id).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                      </label>}
                      <div className='flex items-start gap-2'>
                        <input
                          type='text'
                          value={it.product_name}
                          onChange={(e) => updateItem(idx, 'product_name', e.target.value)}
                          placeholder='Modelo (ej. soporte de celular)'
                          className='flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                        />
                        {formData.items.length > 1 && (
                          <button type='button' onClick={() => removeItem(idx)} className='shrink-0 rounded-lg p-2 text-gray-300 hover:text-red-500'>
                            <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className='mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2'>
                        <input
                          type='text'
                          value={it.material}
                          onChange={(e) => updateItem(idx, 'material', e.target.value)}
                          placeholder='Material'
                          className='col-span-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs'
                        />
                        <input
                          type='text'
                          value={it.color}
                          onChange={(e) => updateItem(idx, 'color', e.target.value)}
                          placeholder='Color'
                          className='col-span-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs'
                        />
                        <input
                          type='number' step='0.5' min='0'
                          value={it.hours_needed}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(idx, 'hours_needed', e.target.value)}
                          placeholder='Horas'
                          className='col-span-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs'
                        />
                        <input
                          type='number' step='1' min='0'
                          value={it.weight_grams}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(idx, 'weight_grams', e.target.value)}
                          placeholder='Gramos'
                          className='col-span-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs'
                        />
                        <input
                          type='number' step='1' min='1'
                          value={it.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                          placeholder='Cant.'
                          className='col-span-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs'
                        />
                        <input
                          type='number' step='0.01' min='0'
                          value={it.unit_price}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                          placeholder='Precio'
                          className='col-span-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs'
                        />
                      </div>
                      <label className='block text-xs text-gray-600'>Personalización / grabado
                        <textarea value={it.product_description || ''} onChange={event => updateItem(idx, 'product_description', event.target.value)} rows={2} className='mt-1 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm' />
                      </label>
                      <OrderItemOptions item={it} product={products.find(product => product.id === it.product_id)} onChange={changes => setFormData(previous => ({ ...previous, items:previous.items.map((row, i) => i === idx ? { ...row, ...changes } : row) }))} />
                    </div>
                  ))}
                </div>
              </div>

              <div className='flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3'>
                <span className='text-sm font-medium text-gray-600'>Total</span>
                <span className='text-lg font-bold text-gray-800'>{money(total)}</span>
              </div>
            </div>

            <div className='admin-modal-footer flex gap-3 border-t border-gray-100 p-5'>
              <button type='button' onClick={resetForm} className='rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'>
                Cancelar
              </button>
              <button
                type='submit'
                disabled={saving}
                className='flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
                style={{ backgroundColor: '#D4AF37' }}
              >
                {saving ? 'Guardando...' : editingOrder ? 'Actualizar pedido' : 'Crear pedido'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
