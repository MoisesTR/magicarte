import { useState, useEffect } from 'react'
import { supabase } from '../config/supabaseClient'
import { useLocation } from 'react-router-dom'
import AdminLogin from '../components/AdminLogin'
import { useBusiness } from '../context/BusinessContext'
import {
  fetchOrdersForBusiness,
  fetchOrderProducts,
  createOrder,
  updateOrder,
  deleteOrder as deleteOrderRow,
  deleteOrderItems,
  insertOrderItems,
} from '../data/orders'
import {
  searchClientsByName,
  fetchClientById,
  findClientByPhone,
  createClientReturning,
} from '../data/clients'
import { addPayment as addPaymentRow, deletePayment as deletePaymentRow } from '../data/payments'
import toast from 'react-hot-toast'

export default function Orders() {
  const location = useLocation()
  const { currentBusinessId, currentBusiness } = useBusiness()
  // In-person business (engraving): no delivery / recipient / gift fields.
  const isInPerson = currentBusiness?.slug === 'joyeria-trigueros'
  // Current month (YYYY-MM) in Nicaragua time, regardless of where the app runs.
  const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' }).slice(0, 7)
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [products, setProducts] = useState([])
  const [filterStatus, setFilterStatus] = useState('active')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [selectedOrders, setSelectedOrders] = useState(new Set())
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('ordersViewMode') || 'list')
  const [filterMonth, setFilterMonth] = useState(currentMonth)
  const [filterDelivery, setFilterDelivery] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [draggedOrderId, setDraggedOrderId] = useState(null)
  const [filterGift, setFilterGift] = useState('no_gifts')
  const [filterPayment, setFilterPayment] = useState('all')
  const [filterClientId, setFilterClientId] = useState(null)
  const [filterClientName, setFilterClientName] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [clientMatches, setClientMatches] = useState([])
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const [clientSearchLoading, setClientSearchLoading] = useState(false)
  const [openWhatsAppMenuId, setOpenWhatsAppMenuId] = useState(null)
  const [editPayments, setEditPayments] = useState([])
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'transferencia',
    paid_at: new Date().toISOString().split('T')[0],
    note: ''
  })
  const ITEMS_PER_PAGE = 10
  const COMMISSION_RATE = 0.0675
  // Temporary UI toggles. Flip to true to bring these back.
  const SHOW_SOCIAL_MEDIA = false
  const SHOW_WHATSAPP_REMINDER = false
  const [formData, setFormData] = useState({
    client_id: null,
    customer_name: '',
    customer_phone: '',
    customer_social_media: '',
    delivery_address: '',
    delivery_method: 'delivery',
    order_date: new Date().toISOString().split('T')[0],
    status: 'pending',
    priority: 'normal',
    payment_status: 'unpaid',
    payment_method: 'not_specified',
    follow_up_reason: '',
    follow_up_date: '',
    notes: '',
    estimated_delivery_date: '',
    delivery_fee: 0,
    recipient_name: '',
    recipient_phone: '',
    is_gift: false,
    items: []
  })

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setCheckingAuth(false)
    }

    checkUser()
  }, [])

  // Fetch ONLY once we know the user AND the real business id, and refetch when
  // the business changes. Guarding on currentBusinessId avoids the race where a
  // null id (before businesses load) would pull every business's orders.
  useEffect(() => {
    if (user && currentBusinessId) {
      fetchOrders()
      fetchProducts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, user])

  // Engraving is a log of completed jobs → show all by default; otherwise active.
  useEffect(() => {
    setFilterStatus(isInPerson ? 'all' : 'active')
  }, [isInPerson])

  useEffect(() => {
    if (location.state?.clientId) {
      setFilterClientId(location.state.clientId)
      setFilterClientName(location.state.clientName || '')
      setFilterStatus('all')
      setFilterMonth('all')
      setFilterGift('all')
      setFilterPayment('all')
      setSearchQuery('')
      window.history.replaceState({}, '')
    } else if (location.state?.search) {
      setSearchQuery(location.state.search)
      setFilterStatus('all')
      setFilterMonth('all')
      window.history.replaceState({}, '')
    }
  }, [location.state])

  useEffect(() => {
    setCurrentPage(1)
  }, [filterStatus, filterPriority, filterMonth, filterDelivery, sortBy, searchQuery, filterGift, filterPayment, filterClientId, selectedDay])

  useEffect(() => {
    const query = formData.customer_name.trim()
    let ignore = false

    if (!showForm || query.length < 2) {
      setClientMatches([])
      setClientSearchLoading(false)
      setClientSearchOpen(false)
      return
    }

    setClientSearchLoading(true)
    const timeoutId = setTimeout(async () => {
      const { data, error } = await searchClientsByName(query, currentBusinessId)

      if (!ignore && !error) {
        setClientMatches(data || [])
      }
      if (!ignore) {
        setClientSearchLoading(false)
      }
    }, 300)

    return () => {
      ignore = true
      clearTimeout(timeoutId)
    }
  }, [formData.customer_name, showForm, currentBusinessId])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const { data, error } = await fetchOrdersForBusiness(currentBusinessId)

      if (error) throw error
      setOrders(data || [])
    } catch (error) {
      toast.error('Error al cargar pedidos: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    const { data } = await fetchOrderProducts(currentBusinessId)
    setProducts(data || [])
  }

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        _key: crypto.randomUUID(),
        product_id: null,
        product_query: '',
        product_open: false,
        product_active_index: -1,
        product_name: '',
        product_description: '',
        quantity: 1,
        unit_price: 0,
        hours_needed: 0,
        rush_fee: 0,
        is_custom: false,
        material: '',
        engraving_minutes: ''
      }]
    })
  }

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    })
  }

  const toNumber = (value, fallback = 0) => {
    if (value === '' || value === null || value === undefined) return fallback
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const toQuantity = (value) => Math.max(1, toNumber(value, 1))

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items]
    newItems[index][field] = value

    if (field === 'product_query') {
      const query = value?.trim() || ''
      if (query !== newItems[index].product_name) {
        newItems[index].product_id = null
        newItems[index].product_name = ''
        newItems[index].unit_price = 0
      }
      newItems[index].product_open = true
      newItems[index].product_active_index = 0
    }

    if (field === 'product_id' && value) {
      const product = products.find(p => p.id === value)
      if (product) {
        newItems[index].product_name = product.name
        newItems[index].unit_price = product.price
        newItems[index].product_query = product.name
        newItems[index].product_open = false
        newItems[index].product_active_index = -1
      }
    }

    if (field === 'is_custom') {
      if (value) {
        newItems[index].product_id = null
        newItems[index].product_query = ''
        newItems[index].product_open = false
        newItems[index].product_active_index = -1
        newItems[index].product_name = ''
        newItems[index].product_description = ''
        newItems[index].unit_price = 0
      }
    }
    
    setFormData({ ...formData, items: newItems })
  }

  const selectProduct = (index, product) => {
    const newItems = [...formData.items]
    newItems[index].product_id = product.id
    newItems[index].product_name = product.name
    newItems[index].unit_price = product.price
    newItems[index].product_query = product.name
    newItems[index].product_open = false
    newItems[index].product_active_index = -1
    setFormData({ ...formData, items: newItems })
  }

  const highlightMatch = (name, query) => {
    const q = query.trim()
    if (!q) return name
    const idx = name.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return name
    const before = name.slice(0, idx)
    const match = name.slice(idx, idx + q.length)
    const after = name.slice(idx + q.length)
    return (
      <>
        {before}
        <span className='text-blue-700 bg-blue-100 rounded px-0.5'>{match}</span>
        {after}
      </>
    )
  }

  const handleProductKeyDown = (index, e, matches) => {
    if (!matches.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      updateItem(index, 'product_active_index', Math.min((formData.items[index].product_active_index ?? 0) + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      updateItem(index, 'product_active_index', Math.max((formData.items[index].product_active_index ?? 0) - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const active = formData.items[index].product_active_index ?? 0
      const product = matches[active]
      if (product) selectProduct(index, product)
    } else if (e.key === 'Escape') {
      updateItem(index, 'product_open', false)
      updateItem(index, 'product_active_index', -1)
    }
  }

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => {
      return sum + (toQuantity(item.quantity) * toNumber(item.unit_price)) + toNumber(item.rush_fee)
    }, 0)
  }

  const displayName = (order) => order.clients?.name || order.customer_name

  const getOrderChargeTotal = (order) => toNumber(order.total_amount) + toNumber(order.delivery_fee)

  const getPaymentSummary = (payments, total) => {
    const list = payments || []
    const paid = list.reduce((s, p) => s + toNumber(p.amount), 0)
    const paidCard = list
      .filter(p => p.method === 'tarjeta')
      .reduce((s, p) => s + toNumber(p.amount), 0)
    const commission = paidCard * COMMISSION_RATE
    const net = paid - commission
    const balance = Math.max(0, toNumber(total) - paid)

    let status = 'unpaid'
    if (paid > 0.009 && paid + 0.009 >= toNumber(total)) status = 'paid'
    else if (paid > 0.009) status = 'partial'

    return { payments: list, paid, paidCard, commission, net, balance, status }
  }

  const selectClient = (client) => {
    setFormData(prev => ({
      ...prev,
      client_id: client.id,
      customer_name: client.name || '',
      customer_phone: client.phone || '',
      customer_social_media: client.social_media || '',
      delivery_address: client.delivery_address || '',
    }))
    setClientMatches([])
    setClientSearchOpen(false)
  }

  const syncLinkedClient = async () => {
    if (!formData.client_id) return

    const { data, error } = await fetchClientById(formData.client_id)

    if (error || !data) {
      toast.error('No se pudo sincronizar el cliente')
      return
    }

    setFormData(prev => ({
      ...prev,
      customer_name: data.name || '',
      customer_phone: data.phone || '',
      customer_social_media: data.social_media || '',
      delivery_address: data.delivery_address || '',
    }))
    toast.success('Datos del cliente sincronizados')
  }

  const saveOrderCustomerAsClient = async () => {
    const name = formData.customer_name.trim()
    if (!name) {
      toast.error('Agrega el nombre del cliente primero')
      return
    }

    const phone = formData.customer_phone || null

    try {
      if (phone) {
        const { data: existingClient, error: findError } = await findClientByPhone(phone, currentBusinessId)

        if (findError) throw findError

        if (existingClient) {
          selectClient(existingClient)
          toast.success('Cliente existente vinculado')
          return
        }
      }

      const { data, error } = await createClientReturning(
        {
          name,
          phone,
          social_media: formData.customer_social_media || null,
          delivery_address: formData.delivery_address || null,
          notes: 'Creado desde un pedido',
        },
        currentBusinessId,
      )

      if (error) throw error

      selectClient(data)
      toast.success('Cliente creado y vinculado')
    } catch (error) {
      toast.error('Error al guardar cliente: ' + error.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const orderData = {
        client_id: formData.client_id || null,
        customer_name: formData.customer_name,
        customer_phone: isInPerson ? null : (formData.customer_phone || null),
        customer_social_media: formData.customer_social_media || null,
        delivery_address: isInPerson ? null : (formData.delivery_address || null),
        delivery_method: isInPerson ? 'pickup' : formData.delivery_method,
        order_date: formData.order_date,
        status: formData.status,
        priority: formData.priority,
        payment_status: formData.payment_status,
        payment_method: formData.payment_method,
        follow_up_reason: formData.follow_up_reason || null,
        follow_up_date: formData.follow_up_date || null,
        notes: formData.notes || null,
        estimated_delivery_date: formData.estimated_delivery_date || null,
        delivery_fee: (!isInPerson && formData.delivery_method === 'delivery') ? toNumber(formData.delivery_fee) : 0,
        recipient_name: (!isInPerson && formData.delivery_method === 'delivery') ? (formData.recipient_name || null) : null,
        recipient_phone: (!isInPerson && formData.delivery_method === 'delivery') ? (formData.recipient_phone || null) : null,
        is_gift: isInPerson ? false : formData.is_gift,
        total_amount: calculateTotal()
      }

      let orderId
      if (editingOrder) {
        const { error } = await updateOrder(editingOrder.id, orderData)

        if (error) throw error
        orderId = editingOrder.id

        await deleteOrderItems(orderId)
      } else {
        const { data, error } = await createOrder(orderData, currentBusinessId)

        if (error) throw error
        orderId = data[0].id
      }

      const items = formData.items.map(item => {
        const row = {
          order_id: orderId,
          product_id: (isInPerson || item.is_custom) ? null : item.product_id,
          product_name: item.product_name,
          product_description: item.product_description || null,
          quantity: toQuantity(item.quantity),
          unit_price: toNumber(item.unit_price),
          hours_needed: item.hours_needed === '' ? null : toNumber(item.hours_needed, 0) || null,
          rush_fee: toNumber(item.rush_fee),
          subtotal: (toQuantity(item.quantity) * toNumber(item.unit_price)) + toNumber(item.rush_fee)
        }
        // Only engraving (Joyería) writes these columns, so other businesses
        // don't depend on the engraving_item_fields migration.
        if (isInPerson) {
          row.material = item.material || null
          row.engraving_minutes = item.engraving_minutes !== '' && item.engraving_minutes != null
            ? parseInt(item.engraving_minutes, 10)
            : null
        }
        return row
      })

      const { error: itemsError } = await insertOrderItems(items)

      if (itemsError) throw itemsError

      toast.success(editingOrder ? 'Pedido actualizado!' : 'Pedido creado!')
      resetForm()
      fetchOrders()
    } catch (error) {
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      client_id: null,
      customer_name: '',
      customer_phone: '',
      customer_social_media: '',
      delivery_address: '',
      delivery_method: 'delivery',
      order_date: new Date().toISOString().split('T')[0],
      status: 'pending',
      priority: 'normal',
      payment_status: 'unpaid',
      payment_method: 'not_specified',
      follow_up_reason: '',
      follow_up_date: '',
      notes: '',
      estimated_delivery_date: '',
      delivery_fee: 0,
      recipient_name: '',
      recipient_phone: '',
      is_gift: false,
      items: []
    })
    setEditingOrder(null)
    setEditPayments([])
    setClientMatches([])
    setClientSearchOpen(false)
    setShowForm(false)
  }

  const editOrder = (order) => {
    setFormData({
      client_id: order.client_id || null,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || '',
      customer_social_media: order.customer_social_media || '',
      delivery_address: order.delivery_address || '',
      delivery_method: order.delivery_method || 'delivery',
      order_date: order.order_date || new Date().toISOString().split('T')[0],
      status: order.status,
      priority: order.priority,
      payment_status: order.payment_status || 'unpaid',
      payment_method: order.payment_method || 'not_specified',
      follow_up_reason: order.follow_up_reason || '',
      follow_up_date: order.follow_up_date || '',
      notes: order.notes || '',
      estimated_delivery_date: order.estimated_delivery_date || '',
      delivery_fee: order.delivery_fee || 0,
      recipient_name: order.recipient_name || '',
      recipient_phone: order.recipient_phone || '',
      is_gift: order.is_gift || false,
      items: order.order_items.map(item => ({
        _key: item.id || crypto.randomUUID(),
        product_id: item.product_id,
        product_query: item.product_id ? item.product_name : '',
        product_open: false,
        product_active_index: -1,
        product_name: item.product_name,
        product_description: item.product_description || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        hours_needed: item.hours_needed || 0,
        rush_fee: item.rush_fee || 0,
        is_custom: !item.product_id,
        material: item.material || '',
        engraving_minutes: item.engraving_minutes ?? ''
      }))
    })
    setEditPayments(order.order_payments || [])
    setPaymentForm({
      amount: '',
      method: 'transferencia',
      paid_at: new Date().toISOString().split('T')[0],
      note: ''
    })
    setEditingOrder(order)
    setShowForm(true)
  }

  const deleteOrder = async (id) => {
    const { error } = await deleteOrderRow(id)

    if (error) {
      toast.error('Error al eliminar')
    } else {
      toast.success('Pedido eliminado')
      setConfirmDeleteId(null)
      fetchOrders()
    }
  }

  const updateOrderStatus = async (id, status) => {
    const updateData = { status }
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error } = await updateOrder(id, updateData)

    if (error) {
      toast.error('Error al actualizar estado')
    } else {
      fetchOrders()
    }
  }

  const handleBoardDrop = (newStatus) => {
    if (!draggedOrderId) return
    const order = orders.find(o => o.id === draggedOrderId)
    if (order && order.status !== newStatus) {
      // Optimistic update
      setOrders(prev => prev.map(o => o.id === draggedOrderId ? { ...o, status: newStatus } : o))
      updateOrderStatus(draggedOrderId, newStatus)
    }
    setDraggedOrderId(null)
  }

  const addPayment = async () => {
    if (!editingOrder) return
    const amount = toNumber(paymentForm.amount)
    if (amount <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    const { data, error } = await addPaymentRow(
      {
        order_id: editingOrder.id,
        amount,
        method: paymentForm.method,
        paid_at: paymentForm.paid_at || new Date().toISOString().split('T')[0],
        note: paymentForm.note.trim() || null
      },
      currentBusinessId,
    )

    if (error) {
      toast.error('Error al registrar pago: ' + error.message)
      return
    }

    setEditPayments(prev => [...prev, data[0]])
    setPaymentForm({
      amount: '',
      method: paymentForm.method,
      paid_at: new Date().toISOString().split('T')[0],
      note: ''
    })
    toast.success('Pago registrado')
    fetchOrders()
  }

  const deletePayment = async (paymentId) => {
    const { error } = await deletePaymentRow(paymentId)

    if (error) {
      toast.error('Error al eliminar pago')
      return
    }

    setEditPayments(prev => prev.filter(p => p.id !== paymentId))
    toast.success('Pago eliminado')
    fetchOrders()
  }

  const openFollowUpWhatsApp = (order, reasonOverride = null) => {
    let phone = order.customer_phone
    if (!phone) {
      toast.error('Este pedido no tiene número de teléfono registrado')
      return
    }

    const reason = reasonOverride || order.follow_up_reason

    if (!reason) {
      toast.error('Selecciona un tipo de mensaje para WhatsApp')
      return
    }

    phone = phone.replace(/\D/g, '')

    const customerName = displayName(order) || 'cliente'
    const itemsList = order.order_items?.length
      ? order.order_items.map(item => {
        const quantity = Number(item.quantity) > 1 ? ` x${item.quantity}` : ''
        const details = item.product_description ? ` (${item.product_description})` : ''
        return `- ${item.product_name}${quantity}${details}`
      }).join('\n')
      : ''

    const deliveryLines = [
      `- Dirección: ${order.delivery_address || 'pendiente de confirmar'}`,
      `- Recibe: ${order.recipient_name || displayName(order) || 'pendiente de confirmar'}`,
      `- Teléfono de contacto: ${order.recipient_phone || order.customer_phone || 'pendiente de confirmar'}`
    ].join('\n')

    const followUpMessages = {
      deposit_request: `Hola ${customerName}! Te escribe MagicArte. Para avanzar con tu pedido, necesitamos confirmar el anticipo del 50%. Cuando tengas oportunidad, nos puedes enviar el comprobante por este medio.`,
      confirm_delivery_details: `Hola ${customerName}! Te escribe MagicArte. Queremos confirmar los datos de entrega de tu pedido:\n\n${deliveryLines}\n\nMe confirmas por favor si todo está correcto o si debemos ajustar algún dato.`,
      notify_ready: `Hola ${customerName}! Te escribe MagicArte. Tu pedido ya está listo. Cuando puedas, nos confirmas si prefieres coordinar entrega o retiro.`,
      waiting_customer_response: `Hola ${customerName}! Te escribe MagicArte. Quedamos pendientes de tu confirmación para poder continuar con tu pedido. Cuando tengas oportunidad, nos respondes por este medio.`,
      delivery_received_check: `Hola ${customerName}! Te escribe MagicArte. Solo queríamos confirmar si tu pedido llegó bien y si todo quedó como esperabas. Nos ayudaría mucho saber si todo está correcto.`
    }

    const messageParts = [
      followUpMessages[reason] || `Hola ${customerName}! Te escribo de MagicArte para dar seguimiento a tu pedido.`,
      reason !== 'delivery_received_check' && itemsList ? `Detalle del pedido:\n${itemsList}` : null,
      reason === 'delivery_received_check' ? 'Muchas gracias!' : 'Gracias!'
    ].filter(Boolean)

    const encodedMessage = encodeURIComponent(messageParts.join('\n\n'))
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank')
  }

  const getStatusColor = (status) => {
    const colors = {
      backlog: 'bg-gray-100 text-gray-500',
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-purple-100 text-purple-800',
      ready: 'bg-teal-100 text-teal-800',
      completed: 'bg-green-100 text-green-800',
      canceled: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      normal: 'bg-gray-100 text-gray-800',
      urgent: 'bg-orange-100 text-orange-800'
    }
    return colors[priority] || 'bg-gray-100 text-gray-800'
  }

  const getPaymentColor = (paymentStatus) => {
    const colors = {
      unpaid: 'bg-red-100 text-red-800',
      partial: 'bg-orange-100 text-orange-800',
      paid: 'bg-green-100 text-green-800'
    }
    return colors[paymentStatus] || 'bg-gray-100 text-gray-800'
  }

  const getFollowUpColor = (followUpDate) => {
    if (!followUpDate) return 'bg-gray-100 text-gray-600'
    if (followUpDate < today) return 'bg-red-600 text-white'
    if (followUpDate === today) return 'bg-amber-500 text-white'
    return 'bg-sky-100 text-sky-800 border border-sky-300'
  }

  const statusLabels = {
    backlog: 'Backlog',
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    in_progress: 'En Proceso',
    ready: 'Listo para Entregar',
    completed: 'Completado',
    canceled: 'Cancelado'
  }

  const priorityLabels = {
    low: 'Baja',
    normal: 'Normal',
    urgent: 'Urgente'
  }

  const paymentStatusLabels = {
    unpaid: 'No Pagado',
    partial: 'Pago Parcial',
    paid: 'Pagado'
  }

  const payMethodLabels = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta'
  }

  const payMethodColor = {
    efectivo: 'bg-emerald-100 text-emerald-800',
    transferencia: 'bg-sky-100 text-sky-800',
    tarjeta: 'bg-violet-100 text-violet-800'
  }

  const followUpReasonLabels = {
    deposit_request: 'Pedir anticipo 50%',
    confirm_delivery_details: 'Confirmar datos de entrega',
    notify_ready: 'Avisar que está listo',
    waiting_customer_response: 'Cliente quedó en responder',
    delivery_received_check: 'Confirmar si llegó bien'
  }

  const deliveryMethodLabels = {
    delivery: 'Entrega a Domicilio',
    pickup: 'Recoger en Tienda'
  }

  const getDeliveryCountdown = (deliveryDate, status) => {
    if (!deliveryDate || status === 'completed' || status === 'canceled') return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const delivery = new Date(deliveryDate + 'T00:00:00')
    const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return { text: `Vencido (${Math.abs(diffDays)}d)`, color: 'bg-red-700 text-white' }
    if (diffDays === 0) return { text: 'Hoy', color: 'bg-red-600 text-white' }
    if (diffDays === 1) return { text: 'Mañana', color: 'bg-orange-600 text-white' }
    if (diffDays <= 3) return { text: `${diffDays} días`, color: 'bg-amber-500 text-white' }
    if (diffDays <= 7) return { text: `${diffDays} días`, color: 'bg-sky-100 text-sky-800 border border-sky-300' }
    return { text: `${diffDays} días`, color: 'bg-emerald-100 text-emerald-800 border border-emerald-300' }
  }

  const fmtPhone = (p) => p?.replace(/\D/g, '').replace(/(.{4})/g, '$1-').replace(/-$/, '') || ''

  const printLabels = (ordersToPrint) => {
    const labelHtml = ordersToPrint.map(order => {
      const items = order.order_items.map(i =>
        `<div class="item">- ${i.product_name} <span class="qty">×${i.quantity}</span></div>`
      ).join('')
      const labelName = order.recipient_name || displayName(order)
      const labelPhone = order.recipient_name ? (order.recipient_phone || order.customer_phone) : order.customer_phone

      return `<div class="label">
        <div class="brand">MagicArte Nicaragua</div>
        <div class="spacer"></div>
        <div class="customer">${labelName}</div>
        ${labelPhone ? `<div class="phone">Telefono: ${fmtPhone(labelPhone)}</div>` : ''}
        <div class="divider"></div>
        <div class="section-title">Productos</div>
        <div class="items">${items}</div>
        <div class="divider"></div>
        ${order.delivery_method === 'pickup'
          ? `<div class="detail">Recoger en Tienda</div>`
          : order.delivery_address
            ? `<div class="section-title">Dirección de Entrega</div><div class="detail">${order.delivery_address}</div>`
            : ''
        }
        ${order.notes ? `<div class="notes">${order.notes}</div>` : ''}
        <div class="footer-row">
          <div class="thanks">¡Gracias por tu compra! ✨</div>
          <div class="qr-wrap">
            <div class="qr-label">Visitanos</div>
            <img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=https://magicarte.net" alt="QR" />
          </div>
        </div>
      </div>`
    }).join('')

    const win = window.open('', '_blank', 'width=500,height=300')
    win.document.write(`<!DOCTYPE html>
<html><head><title>Etiquetas MagicArte</title>
<style>
  @page { size: 4in 2in; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .label {
    width: 4in; height: 2in; padding: 5px 10px;
    page-break-after: auto; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .label:last-child { page-break-after: avoid; }
  .brand { text-align: center; font-size: 14px; font-weight: bold; letter-spacing: 1px; margin-bottom: 1px; }
  .spacer { height: 4px; }
  .customer { font-size: 13px; font-weight: bold; text-align: center; }
  .phone { font-size: 11px; text-align: center; }
  .divider { border-top: 1px solid #000; margin: 4px 0; }
  .items { margin-top: 2px; }
  .item { font-size: 12px; line-height: 1.4; }
  .qty { }
  .detail { font-size: 11px; text-align: center; margin-top: 1px; }
  .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
  .notes { font-size: 10px; text-align: center; margin-top: 2px; font-style: italic; }
  .footer-row { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 3px; }
  .thanks { font-size: 10px; font-style: italic; }
  .qr-wrap { text-align: center; flex-shrink: 0; }
  .qr-label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px; }
  .qr { width: 45px; height: 45px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>${labelHtml}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print() }, 300)
  }

  const printLabels4x6 = (ordersToPrint) => {
    const labelHtml = ordersToPrint.map(order => {
      const items = order.order_items.map(i =>
        `<div class="item">- ${i.product_name} <span class="qty">×${i.quantity}</span></div>`
      ).join('')
      const labelName = order.recipient_name || displayName(order)
      const labelPhone = order.recipient_name ? (order.recipient_phone || order.customer_phone) : order.customer_phone

      return `<div class="label">
        <div class="brand">MagicArte Nicaragua</div>
        <div class="tagline">Creaciones únicas en madera</div>
        <div class="divider"></div>
        <div class="customer">${labelName}</div>
        ${labelPhone ? `<div class="phone">Telefono: ${fmtPhone(labelPhone)}</div>` : ''}
        <div class="divider"></div>
        <div class="section-title">Productos</div>
        <div class="items">${items}</div>
        <div class="divider"></div>
        ${order.delivery_method === 'pickup'
          ? `<div class="detail">Recoger en Tienda</div>`
          : order.delivery_address
            ? `<div class="section-title">Dirección de Entrega</div><div class="detail">${order.delivery_address}</div>`
            : ''
        }
        ${order.notes ? `<div class="notes">${order.notes}</div>` : ''}
        <div class="qr-section">
          <img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://magicarte.net" alt="QR" />
          <div class="qr-label">magicarte.net</div>
        </div>
        <div class="thanks">¡Gracias por tu compra! ✨</div>
      </div>`
    }).join('')

    const win = window.open('', '_blank', 'width=500,height=700')
    win.document.write(`<!DOCTYPE html>
<html><head><title>Etiquetas MagicArte 4x6</title>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .label {
    width: 4in; height: 6in; padding: 16px 20px;
    page-break-after: auto; overflow: hidden;
    display: flex; flex-direction: column; align-items: center;
  }
  .label:last-child { page-break-after: avoid; }
  .brand { text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; }
  .tagline { text-align: center; font-size: 12px; font-style: italic; color: #555; margin-top: 2px; letter-spacing: 0.5px; }
  .customer { font-size: 20px; font-weight: bold; text-align: center; }
  .phone { font-size: 16px; text-align: center; margin-top: 4px; }
  .divider { border-top: 1px solid #000; margin: 10px 0; width: 100%; }
  .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; margin-bottom: 6px; }
  .items { margin-top: 4px; width: 100%; }
  .item { font-size: 16px; line-height: 1.6; }
  .detail { font-size: 14px; text-align: center; margin-top: 4px; }
  .notes { font-size: 13px; text-align: center; margin-top: 6px; font-style: italic; }
  .qr-section { text-align: center; margin-top: auto; padding-top: 12px; }
  .qr { width: 100px; height: 100px; }
  .qr-label { font-size: 11px; margin-top: 4px; letter-spacing: 0.5px; color: #333; }
  .thanks { font-size: 14px; font-style: italic; text-align: center; margin-top: 10px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>${labelHtml}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print() }, 300)
  }

  const toggleOrderSelection = (orderId) => {
    setSelectedOrders(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)))
    }
  }

  const selectedOrderObjects = orders.filter(o => selectedOrders.has(o.id))

  const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready']

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // Current week: Monday to Sunday (local time)
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  const weekEnd = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: d, dateStr }
  })

  const filteredOrders = orders.filter(order => {
    if (filterStatus === 'active' && !ACTIVE_STATUSES.includes(order.status)) return false
    if (filterStatus !== 'all' && filterStatus !== 'active' && order.status !== filterStatus) return false
    if (filterPriority !== 'all' && order.priority !== filterPriority) return false
    if (filterMonth !== 'all' && !searchQuery.trim() && !filterClientId) {
      // Month filter only restricts settled history. Anything still active or
      // with money to collect always shows, even from other months.
      // When a search is active we skip the month filter entirely so you see
      // all of a client's orders regardless of when they were placed.
      const isActive = ACTIVE_STATUSES.includes(order.status)
      const hasPendingBalance = getPaymentSummary(order.order_payments, getOrderChargeTotal(order)).balance > 0.009
      if (!isActive && !hasPendingBalance) {
        const orderDate = order.order_date || order.created_at
        if (!orderDate || !orderDate.startsWith(filterMonth)) return false
      }
    }
    if (filterDelivery === 'today' && order.estimated_delivery_date !== today) return false
    if (filterDelivery === 'week' && (!order.estimated_delivery_date || order.estimated_delivery_date < weekStart || order.estimated_delivery_date > weekEnd)) return false
    if (filterDelivery === 'overdue' && (!order.estimated_delivery_date || order.estimated_delivery_date >= today || ['completed', 'canceled'].includes(order.status))) return false
    if (filterGift === 'no_gifts' && order.is_gift) return false
    if (filterGift === 'only_gifts' && !order.is_gift) return false
    if (filterPayment !== 'all' && getPaymentSummary(order.order_payments, getOrderChargeTotal(order)).status !== filterPayment) return false
    if (selectedDay && order.estimated_delivery_date !== selectedDay) return false
    if (filterClientId && order.client_id !== filterClientId) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchesName = order.customer_name?.toLowerCase().includes(q)
      const matchesClientName = order.clients?.name?.toLowerCase().includes(q)
      const matchesPhone = order.customer_phone?.toLowerCase().includes(q)
      const matchesNumber = String(order.order_number).includes(q)
      if (!matchesName && !matchesClientName && !matchesPhone && !matchesNumber) return false
    }
    return true
  }).sort((a, b) => {
    // Primary: payment status (paid first, then partial, then unpaid)
    const paymentOrder = { paid: 0, partial: 1, unpaid: 2 }
    const aStatus = getPaymentSummary(a.order_payments, getOrderChargeTotal(a)).status
    const bStatus = getPaymentSummary(b.order_payments, getOrderChargeTotal(b)).status
    const payDiff = (paymentOrder[aStatus] ?? 2) - (paymentOrder[bStatus] ?? 2)
    if (payDiff !== 0) return payDiff

    // Secondary: selected sort criteria
    if (sortBy === 'priority') {
      const priorityOrder = { urgent: 0, normal: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    } else if (sortBy === 'delivery_date') {
      if (!a.estimated_delivery_date) return 1
      if (!b.estimated_delivery_date) return -1
      return new Date(a.estimated_delivery_date) - new Date(b.estimated_delivery_date)
    } else if (sortBy === 'created_at') {
      return new Date(b.created_at) - new Date(a.created_at)
    } else if (sortBy === 'order_date') {
      return new Date(b.order_date) - new Date(a.order_date)
    }
    return 0
  })

  // Count deliveries per weekday using all filters except selectedDay
  const weekDayCounts = (() => {
    const base = orders.filter(order => {
      if (filterStatus === 'active' && !ACTIVE_STATUSES.includes(order.status)) return false
      if (filterStatus !== 'all' && filterStatus !== 'active' && order.status !== filterStatus) return false
      if (filterPriority !== 'all' && order.priority !== filterPriority) return false
      if (filterGift === 'no_gifts' && order.is_gift) return false
      if (filterGift === 'only_gifts' && !order.is_gift) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!order.customer_name?.toLowerCase().includes(q) && !order.customer_phone?.toLowerCase().includes(q) && !String(order.order_number).includes(q)) return false
      }
      return true
    })
    const counts = {}
    weekDays.forEach(({ dateStr }) => { counts[dateStr] = base.filter(o => o.estimated_delivery_date === dateStr).length })
    return counts
  })()

	  const stats = {
    total: filteredOrders.length,
    pending: filteredOrders.filter(o => o.status === 'pending').length,
    in_progress: filteredOrders.filter(o => o.status === 'in_progress').length,
    completed: filteredOrders.filter(o => o.status === 'completed').length,
  }

  // Build available months from orders for the dropdown
  const availableMonths = [...new Set([currentMonth, ...orders.map(o => {
    const d = o.order_date || o.created_at
    return d ? d.slice(0, 7) : null
  }).filter(Boolean)])].sort().reverse()

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE)
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879] mx-auto mb-4'></div>
          <p className='text-gray-600'>Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AdminLogin onLogin={(userData) => setUser(userData)} />
  }

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='max-w-7xl mx-auto px-4'>
        {/* Header */}
        <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-5'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4'>
            <div>
              <h1 className='text-xl font-bold text-gray-800'>Gestión de Pedidos</h1>
              <p className='text-xs text-gray-400 mt-0.5'>{user.email}</p>
            </div>
          </div>

          {/* Stats */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <div className='bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-xl'>
              <p className='text-xs text-blue-600 font-medium'>Total</p>
              <p className='text-2xl font-bold text-blue-900'>{stats.total}</p>
            </div>
            <div className='bg-gradient-to-br from-yellow-50 to-yellow-100 p-3 rounded-xl'>
              <p className='text-xs text-yellow-600 font-medium'>Pendientes</p>
              <p className='text-2xl font-bold text-yellow-900'>{stats.pending}</p>
            </div>
            <div className='bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-xl'>
              <p className='text-xs text-purple-600 font-medium'>En Proceso</p>
              <p className='text-2xl font-bold text-purple-900'>{stats.in_progress}</p>
            </div>
            <div className='bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-xl'>
              <p className='text-xs text-green-600 font-medium'>Completados</p>
              <p className='text-2xl font-bold text-green-900'>{stats.completed}</p>
            </div>
          </div>
        </div>

        {!showForm ? (
          <>
            {/* Week Calendar */}
            <div className='bg-white rounded-2xl shadow-soft p-4 mb-5'>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-sm font-semibold text-gray-500 uppercase tracking-wide'>Entregas esta semana</h3>
                {selectedDay && (
                  <button
                    onClick={() => setSelectedDay(null)}
                    className='text-xs px-2.5 py-1 bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg font-medium transition-colors'
                  >
                    Quitar filtro
                  </button>
                )}
              </div>
              <div className='grid grid-cols-7 gap-2'>
                {weekDays.map(({ date, dateStr }) => {
                  const isToday = dateStr === today
                  const isSelected = selectedDay === dateStr
                  const dayName = date.toLocaleDateString('es', { weekday: 'short' })
                  const count = weekDayCounts[dateStr] || 0
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                      className={`flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-[#51c879] text-white shadow-md'
                          : isToday
                            ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-300'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className='text-[10px] font-semibold uppercase'>{dayName}</span>
                      <span className='text-lg font-bold'>{date.getDate()}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 rounded-full ${
                          isSelected ? 'bg-white/30' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Filters and Actions */}
            <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-5 space-y-4'>
              {/* Row 1: Action + Search */}
              <div className='flex flex-wrap items-center gap-3'>
                <button
                  onClick={() => setShowForm(true)}
                  className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all shadow-lg'
                >
                  + Nuevo Pedido
                </button>

                <div className='relative flex-1 min-w-[240px] max-w-md'>
                  <svg className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' /></svg>
                  <input
                    type='text'
                    placeholder='Buscar cliente, teléfono o # pedido...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='w-full px-4 py-3 pl-10 pr-8 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-[#51c879] transition-colors'
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className='flex items-center gap-2 ml-auto'>
                  <button
                    onClick={() => { const next = viewMode === 'list' ? 'board' : 'list'; setViewMode(next); localStorage.setItem('ordersViewMode', next) }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${viewMode === 'board' ? 'bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {viewMode === 'board' ? 'Vista Lista' : 'Vista Tablero'}
                  </button>
                </div>
              </div>

              {/* Row 2: Delivery quick filters */}
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1'>Entregas:</span>
                {[
                  { key: 'all',     label: 'Todas'       },
                  { key: 'today',   label: 'Hoy'         },
                  { key: 'week',    label: 'Esta semana' },
                  { key: 'overdue', label: 'Vencidos'    },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFilterDelivery(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterDelivery === opt.key
                      ? opt.key === 'overdue' ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : 'bg-[#51c879]/15 text-[#3a9e5c] ring-1 ring-[#51c879]/40'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Row 3: Filters */}
              <div className='flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100'>
                <span className='text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1'>Filtros:</span>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#51c879] transition-colors ${filterStatus !== 'all' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700'}`}
                >
                  <option value='all'>Todos los estados</option>
                  <option value='active'>Activos (sin backlog)</option>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className={`px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#51c879] transition-colors ${filterPriority !== 'all' ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-gray-300 text-gray-700'}`}
                >
                  <option value='all'>Todas las prioridades</option>
                  {Object.entries(priorityLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className={`px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#51c879] transition-colors ${filterMonth !== 'all' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-300 text-gray-700'}`}
                >
                  <option value='all'>Todos los meses</option>
                  {availableMonths.map(m => {
                    const [y, mo] = m.split('-')
                    return (
                      <option key={m} value={m}>
                        {new Date(y, mo - 1).toLocaleDateString('es', { year: 'numeric', month: 'long' })}
                      </option>
                    )
                  })}
                </select>

                <select
                  value={filterGift}
                  onChange={(e) => setFilterGift(e.target.value)}
                  className={`px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#51c879] transition-colors ${filterGift !== 'no_gifts' ? 'bg-pink-50 border-pink-300 text-pink-700' : 'border-gray-300 text-gray-700'}`}
                >
                  <option value='no_gifts'>Sin regalos</option>
                  <option value='all'>Todos</option>
                  <option value='only_gifts'>🎁 Solo regalos</option>
                </select>

                <select
                  value={filterPayment}
                  onChange={(e) => setFilterPayment(e.target.value)}
                  className={`px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#51c879] transition-colors ${filterPayment !== 'all' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-300 text-gray-700'}`}
                >
                  <option value='all'>Todos los pagos</option>
                  <option value='unpaid'>No pagado</option>
                  <option value='partial'>Pago parcial</option>
                  <option value='paid'>Pagado</option>
                </select>

                <div className='h-6 w-px bg-gray-200 mx-1 hidden sm:block' />

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className='px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#51c879] text-gray-700'
                >
                  <option value='created_at'>↕ Más recientes</option>
                  <option value='order_date'>↕ Fecha de encargo</option>
                  <option value='priority'>↕ Prioridad</option>
                  <option value='delivery_date'>↕ Fecha de entrega</option>
                </select>

                {filterClientId && (
                  <div className='flex items-center gap-1.5 px-3 py-1.5 bg-[#51c879]/10 border border-[#51c879]/30 rounded-lg text-sm'>
                    <span className='text-[#51c879] font-semibold'>{filterClientName || 'Cliente'}</span>
                    <button
                      onClick={() => { setFilterClientId(null); setFilterClientName(''); setFilterStatus('active'); setFilterMonth(currentMonth) }}
                      className='text-[#51c879] hover:text-red-500 font-bold leading-none'
                      title='Quitar filtro de cliente'
                    >✕</button>
                  </div>
                )}
	                {(filterStatus !== 'active' || filterPriority !== 'all' || filterMonth !== currentMonth || filterDelivery !== 'all' || filterGift !== 'no_gifts' || filterPayment !== 'all' || filterClientId || selectedDay || searchQuery) && (
	                  <button
	                    onClick={() => { setFilterStatus('active'); setFilterPriority('all'); setFilterMonth(currentMonth); setFilterDelivery('all'); setFilterGift('no_gifts'); setFilterPayment('all'); setFilterClientId(null); setFilterClientName(''); setSelectedDay(null); setSearchQuery('') }}
                    className='px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors'
                  >
                    ✕ Limpiar filtros
                  </button>
                )}
              </div>

              {/* Selection controls */}
              <div className='flex flex-wrap items-center gap-4 mt-4 pt-4 border-t'>
                <label className='flex items-center gap-2 cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                    onChange={toggleSelectAll}
                    className='w-4 h-4 rounded border-gray-300 text-[#51c879] focus:ring-[#51c879]'
                  />
                  <span className='text-sm text-gray-600'>
                    {selectedOrders.size > 0 ? `${selectedOrders.size} seleccionado${selectedOrders.size > 1 ? 's' : ''}` : 'Seleccionar todos'}
                  </span>
                </label>

                {selectedOrders.size > 0 && (
                  <>
                    <button
                      onClick={() => printLabels(selectedOrderObjects)}
                      className='bg-gray-700 text-white px-5 py-2 rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-md'
                    >
                      🖨️ 4×2 ({selectedOrders.size})
                    </button>
                    <button
                      onClick={() => printLabels4x6(selectedOrderObjects)}
                      className='bg-gray-700 text-white px-5 py-2 rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-md'
                    >
                      🖨️ 4×6 ({selectedOrders.size})
                    </button>
                    <button
                      onClick={() => setSelectedOrders(new Set())}
                      className='text-sm text-gray-500 hover:text-gray-700 underline'
                    >
                      Limpiar selección
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Orders View */}
            {loading ? (
              <div className='text-center py-12'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879] mx-auto mb-4'></div>
                <p className='text-gray-600'>Cargando pedidos...</p>
              </div>
            ) : viewMode === 'board' ? (
              /* Kanban Board */
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                {[
                  { key: 'pending',     label: 'Pendiente',           dot: 'bg-yellow-400', headerBg: 'bg-yellow-50',  textColor: 'text-yellow-800', border: 'border-yellow-100', badgeBg: 'bg-yellow-100' },
                  { key: 'confirmed',   label: 'Confirmado',          dot: 'bg-blue-400',   headerBg: 'bg-blue-50',    textColor: 'text-blue-800',   border: 'border-blue-100',   badgeBg: 'bg-blue-100'   },
                  { key: 'in_progress', label: 'En Proceso',          dot: 'bg-purple-400', headerBg: 'bg-purple-50',  textColor: 'text-purple-800', border: 'border-purple-100', badgeBg: 'bg-purple-100' },
                  { key: 'ready',       label: 'Listo para Entregar', dot: 'bg-teal-400',   headerBg: 'bg-teal-50',    textColor: 'text-teal-800',   border: 'border-teal-100',   badgeBg: 'bg-teal-100'   }
                ].map(col => {
                  const colOrders = filteredOrders
                    .filter(o => o.status === col.key)
                    .sort((a, b) => {
                      const priorityOrder = { urgent: 0, normal: 1, low: 2 }
                      const pDiff = (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
                      if (pDiff !== 0) return pDiff
                      if (!a.estimated_delivery_date) return 1
                      if (!b.estimated_delivery_date) return -1
                      return new Date(a.estimated_delivery_date) - new Date(b.estimated_delivery_date)
                    })

                  return (
                    <div key={col.key} className='flex flex-col rounded-xl border border-gray-200 overflow-hidden'>
                      <div className={`${col.headerBg} border-b ${col.border} px-3 py-2.5 flex items-center justify-between`}>
                        <div className='flex items-center gap-2'>
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />
                          <span className={`font-semibold text-sm ${col.textColor}`}>{col.label}</span>
                        </div>
                        <span className={`${col.badgeBg} ${col.textColor} px-2 py-0.5 rounded-full text-xs font-bold`}>{colOrders.length}</span>
                      </div>
                      <div
                        className={`bg-gray-50 p-2 space-y-2 min-h-[200px] max-h-[70vh] overflow-y-auto transition-colors ${draggedOrderId ? 'ring-2 ring-inset ring-gray-300 ring-dashed' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-gray-100') }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('bg-gray-100') }}
                        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-gray-100'); handleBoardDrop(col.key) }}
                      >
                        {colOrders.length === 0 && (
                          <p className='text-center text-gray-400 text-xs py-8'>Sin pedidos</p>
                        )}
                        {colOrders.map(order => {
                          const countdown = getDeliveryCountdown(order.estimated_delivery_date, order.status)
                          const paySummary = getPaymentSummary(order.order_payments, getOrderChargeTotal(order))
                          const payMethodsUsed = [...new Set((order.order_payments || []).map(p => p.method))]
                          return (
                            <div
                              key={order.id}
                              draggable
                              onDragStart={() => setDraggedOrderId(order.id)}
                              onDragEnd={() => setDraggedOrderId(null)}
                              className={`bg-white rounded-xl p-3 border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing ${draggedOrderId === order.id ? 'opacity-40 scale-95' : ''}`}
                              onClick={() => editOrder(order)}
                            >
                              <div className='flex items-start justify-between gap-1 mb-1.5'>
                                <span className='font-semibold text-sm text-gray-800 leading-tight'>{displayName(order)}</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${getPriorityColor(order.priority)}`}>
                                  {priorityLabels[order.priority]}
                                </span>
                              </div>
                              <div className='text-xs text-gray-400 mb-2'>
                                {order.order_items?.length || 0} producto{(order.order_items?.length || 0) !== 1 ? 's' : ''}
                                <span className='mx-1'>·</span>
                                <span className='font-medium text-gray-600'>C$ {parseFloat(order.total_amount).toFixed(0)}</span>
                              </div>
                              <div className='flex items-center justify-between gap-1 flex-wrap'>
                                <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${getPaymentColor(paySummary.status)}`}>
                                  {paymentStatusLabels[paySummary.status]}
                                </span>
                                {payMethodsUsed.map(m => (
                                  <span key={m} className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${payMethodColor[m]}`}>
                                    {payMethodLabels[m]}
                                  </span>
                                ))}
                                {SHOW_WHATSAPP_REMINDER && order.follow_up_reason && order.follow_up_date && (
                                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${getFollowUpColor(order.follow_up_date)}`}>
                                    {followUpReasonLabels[order.follow_up_reason] || 'Recordatorio'}
                                  </span>
                                )}
                                {countdown && (
                                  <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${countdown.color}`}>
                                    {countdown.text}
                                  </span>
                                )}
                              </div>
	                              {order.estimated_delivery_date && (
	                                <div className='text-xs text-gray-400 mt-1.5'>
	                                  {new Date(order.estimated_delivery_date + 'T00:00:00').toLocaleDateString('es-NI')}
	                                </div>
	                              )}
                              {SHOW_WHATSAPP_REMINDER && order.customer_phone && order.follow_up_reason && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openFollowUpWhatsApp(order)
                                  }}
                                  className='mt-2 w-full px-2 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors'
                                  title='Enviar mensaje guardado por WhatsApp'
                                >
                                  WhatsApp: {followUpReasonLabels[order.follow_up_reason] || 'Mensaje'}
                                </button>
                              )}
	                            </div>
	                          )
	                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className='space-y-4'>
                {paginatedOrders.map((order) => {
                  const paySummary = getPaymentSummary(order.order_payments, getOrderChargeTotal(order))
                  const payMethodsUsed = [...new Set((order.order_payments || []).map(p => p.method))]
                  return (
                  <div key={order.id} className={`bg-white rounded-2xl shadow-soft p-4 sm:p-5 hover:shadow-md transition-shadow ${selectedOrders.has(order.id) ? 'ring-2 ring-amber-400' : ''}`}>
                    <div className='flex justify-between items-start mb-4'>
                      <div className='flex-1'>
                        <div className='flex items-center gap-2 flex-wrap mb-2'>
                          <input
                            type='checkbox'
                            checked={selectedOrders.has(order.id)}
                            onChange={() => toggleOrderSelection(order.id)}
                            className='w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 flex-shrink-0'
                          />
                          <h3 className='text-base font-bold text-gray-800'>Pedido #{order.order_number}</h3>
                          <div className='flex items-center gap-1.5 flex-wrap'>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                              {statusLabels[order.status]}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getPriorityColor(order.priority)}`}>
                              {priorityLabels[order.priority]}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getPaymentColor(paySummary.status)}`}>
                              {paymentStatusLabels[paySummary.status]}
                            </span>
                            {payMethodsUsed.map(m => (
                              <span key={m} className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${payMethodColor[m]}`}>
                                {payMethodLabels[m]}
                              </span>
                            ))}
                            {SHOW_WHATSAPP_REMINDER && order.follow_up_reason && order.follow_up_date && (
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getFollowUpColor(order.follow_up_date)}`}>
                                {followUpReasonLabels[order.follow_up_reason] || 'Recordatorio'}
                              </span>
                            )}
                            {order.is_gift && (
                              <span className='px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-100 text-pink-800'>
                                Regalo
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm text-gray-600'>
                          <p><strong>Cliente:</strong> {displayName(order)}</p>
                          {order.customer_phone && <p><strong>Teléfono:</strong> {order.customer_phone}</p>}
                          {SHOW_SOCIAL_MEDIA && order.customer_social_media && <p><strong>Red Social:</strong> {order.customer_social_media}</p>}
                          {order.delivery_address && <p><strong>Dirección:</strong> {order.delivery_address}</p>}
                          {order.recipient_name && (
                            <p><strong>Recibe:</strong> {order.recipient_name}{order.recipient_phone ? ` — ${order.recipient_phone}` : ''}</p>
                          )}
                          <p><strong>Modalidad:</strong> {deliveryMethodLabels[order.delivery_method] || 'Entrega a Domicilio'}</p>
                          <p>
                            <strong>Pagado:</strong> C$ {paySummary.paid.toFixed(2)} / C$ {getOrderChargeTotal(order).toFixed(2)}
                            {paySummary.balance > 0.009 && <span className='text-red-600'> · saldo C$ {paySummary.balance.toFixed(2)}</span>}
                          </p>
                          {SHOW_WHATSAPP_REMINDER && order.follow_up_reason && order.follow_up_date && (
                            <p><strong>Recordatorio WhatsApp:</strong> {followUpReasonLabels[order.follow_up_reason]} · {new Date(order.follow_up_date + 'T00:00:00').toLocaleDateString('es-NI')}</p>
                          )}
                          {order.order_date && <p><strong>Encargo:</strong> {new Date(order.order_date + 'T00:00:00').toLocaleDateString('es-NI')}</p>}
                        </div>
                      </div>
                      
                      <div className='text-right ml-4'>
                        <p className='text-xl font-bold text-gray-900'>C$ {parseFloat(order.total_amount).toFixed(2)}</p>
                        {order.delivery_fee > 0 && (
                          <p className='text-xs text-gray-500'>+ Delivery: C$ {parseFloat(order.delivery_fee).toFixed(2)}</p>
                        )}
                        {order.delivery_fee > 0 && (
                          <p className='text-sm font-semibold text-gray-700'>Total cliente: C$ {(parseFloat(order.total_amount) + parseFloat(order.delivery_fee)).toFixed(2)}</p>
                        )}
                        {paySummary.commission > 0.009 && (
                          <p className='text-xs text-gray-500'>
                            Comisión: − C$ {paySummary.commission.toFixed(2)} · Neto: <span className='font-semibold text-[#51c879]'>C$ {paySummary.net.toFixed(2)}</span>
                          </p>
                        )}
                        <p className='text-sm text-gray-500 mt-1'>{new Date(order.created_at).toLocaleDateString('es-NI')}</p>
                        {order.estimated_delivery_date && (
                          <div className='mt-1'>
                            <p className='text-sm text-gray-600'>
                              Entrega: {new Date(order.estimated_delivery_date + 'T00:00:00').toLocaleDateString('es-NI')}
                            </p>
                            {getDeliveryCountdown(order.estimated_delivery_date, order.status) && (
                              <span className={`inline-block mt-1 px-3 py-1 rounded-lg text-sm font-bold ${getDeliveryCountdown(order.estimated_delivery_date, order.status).color}`}>
                                {getDeliveryCountdown(order.estimated_delivery_date, order.status).text}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Products */}
                    <div className='mb-4 bg-gray-50 rounded-xl p-4'>
                      <p className='text-base font-semibold text-gray-700 mb-3'>Productos:</p>
                      <div className='space-y-3'>
                        {order.order_items.map((item, idx) => (
                          <div key={idx} className='flex justify-between items-start text-base'>
                            <div className='flex-1 pr-4'>
                              <div className='font-medium text-gray-800'>• {item.product_name}</div>
                              {item.product_description && (
                                <div className='text-gray-500 ml-4 text-sm'>({item.product_description})</div>
                              )}
                              <div className='ml-4 mt-1 flex flex-wrap gap-3 text-sm'>
                                <span className='text-gray-600'>Cantidad: {item.quantity}</span>
                                {item.hours_needed > 0 && (
                                  <span className='text-gray-500'>
                                    ⏱ {item.hours_needed * item.quantity} {item.hours_needed * item.quantity === 1 ? 'hora' : 'horas'} total ({item.hours_needed} {item.hours_needed === 1 ? 'hora' : 'horas'} c/u)
                                  </span>
                                )}
                                {item.rush_fee > 0 && (
                                  <span className='text-orange-600 font-medium'>⚡ Urgencia: +C$ {parseFloat(item.rush_fee).toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                            <span className='font-bold text-gray-900 text-base whitespace-nowrap'>C$ {parseFloat(item.subtotal).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {order.notes && (
                      <div className='mb-4 p-4 bg-blue-50 rounded-lg'>
                        <p className='text-base text-gray-700 whitespace-pre-wrap'><strong>Notas:</strong> {order.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className='flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100'>
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        className='px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      >
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <button
                        type='button'
                        onClick={() => editOrder(order)}
                        className={`px-3 py-1.5 text-sm font-semibold border rounded-lg hover:opacity-80 transition-opacity ${getPaymentColor(paySummary.status)}`}
                        title='Registrar o ver pagos'
                      >
                        {paymentStatusLabels[paySummary.status]} · Pagos
                      </button>
                      <div className='flex items-center gap-1 ml-auto'>
                        {SHOW_WHATSAPP_REMINDER && order.customer_phone && (
                          <div className='relative'>
                            <button
                              type='button'
                              onClick={() => setOpenWhatsAppMenuId(openWhatsAppMenuId === order.id ? null : order.id)}
                              className='px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 bg-white hover:border-[#25D366] hover:bg-green-50 focus:ring-2 focus:ring-[#25D366]/30 focus:border-transparent transition-colors'
                              title='Enviar mensaje rápido por WhatsApp'
                            >
                              WhatsApp rápido
                            </button>
                            {openWhatsAppMenuId === order.id && (
                              <div className='absolute right-0 bottom-full mb-2 w-64 bg-white border border-gray-100 rounded-xl shadow-lg p-1.5 z-30'>
                                {Object.entries(followUpReasonLabels).map(([key, label]) => (
                                  <button
                                    key={key}
                                    type='button'
                                    onClick={() => {
                                      setOpenWhatsAppMenuId(null)
                                      openFollowUpWhatsApp(order, key)
                                    }}
                                    className='w-full text-left px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-green-50 hover:text-green-700 transition-colors'
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
		                        <button
	                          onClick={() => editOrder(order)}
	                          className='p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'
                          title='Editar pedido'
                        >
                          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' />
                          </svg>
                        </button>
                        <button
                          onClick={() => printLabels([order])}
                          className='p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'
                          title='Etiqueta 4×2'
                        >
                          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z' />
                          </svg>
                        </button>
                        <button
                          onClick={() => printLabels4x6([order])}
                          className='p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'
                          title='Etiqueta 4×6'
                        >
                          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
                          </svg>
                        </button>
                        {confirmDeleteId === order.id ? (
                          <div className='flex items-center gap-1.5'>
                            <span className='text-xs text-gray-500'>¿Eliminar?</span>
                            <button
                              onClick={() => deleteOrder(order.id)}
                              className='text-xs bg-red-500 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-red-600 transition-colors'
                            >
                              Sí
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className='text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg font-medium hover:bg-gray-200 transition-colors'
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(order.id)}
                            className='p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors'
                            title='Eliminar pedido'
                          >
                            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  )
                })}

                {totalPages > 1 && (
                  <div className='flex items-center justify-between bg-white rounded-2xl shadow-soft px-5 py-3 mt-2'>
                    <p className='text-sm text-gray-500'>
                      Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredOrders.length)} de {filteredOrders.length} pedidos
                    </p>
                    <div className='flex items-center gap-2'>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className='px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                      >
                        ← Anterior
                      </button>
                      <span className='text-gray-700 font-medium px-2'>
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className='px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                      >
                        Siguiente →
                      </button>
                    </div>
                  </div>
                )}

                {filteredOrders.length === 0 && (
                  <div className='bg-white rounded-2xl shadow-soft p-12 text-center'>
                    <div className='text-6xl mb-4'>📦</div>
                    <p className='text-xl text-gray-500'>No hay pedidos que mostrar</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'>
            <div className='bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col'>
              <div className='flex justify-between items-center p-5 border-b'>
                <div>
                  <h2 className='text-base font-bold text-gray-800'>
                    {editingOrder ? `Pedido #${editingOrder.order_number}` : 'Nuevo Pedido'}
                  </h2>
                  {editingOrder && (
                    <p className='text-xs text-gray-400 mt-0.5'>{editingOrder.customer_name}</p>
                  )}
                </div>
                <button
                  onClick={resetForm}
                  className='text-gray-400 hover:text-gray-600 transition-colors'
                >
                  <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className='flex flex-col flex-1 overflow-hidden'>
                <div className='flex-1 overflow-y-auto p-5 space-y-5'>

                  {/* Cliente */}
                  <div>
                    <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3'>Cliente</p>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1.5'>Nombre *</label>
                        <div className='relative'>
                          <input
                            type='text'
                            required
                            value={formData.customer_name}
                            onChange={(e) => {
                              setFormData({ ...formData, client_id: null, customer_name: e.target.value })
                              setClientSearchOpen(true)
                            }}
                            onFocus={() => {
                              if (clientMatches.length > 0) setClientSearchOpen(true)
                            }}
                            onBlur={() => setTimeout(() => setClientSearchOpen(false), 140)}
                            className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                            placeholder='Busca o escribe un cliente...'
                            autoComplete='off'
                          />

                          {clientSearchOpen && (clientMatches.length > 0 || clientSearchLoading) && (
                            <div
                              className='absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl'
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              {clientSearchLoading ? (
                                <div className='px-4 py-3 text-sm text-gray-400'>Buscando clientes...</div>
                              ) : (
                                clientMatches.map((client) => (
                                  <button
                                    key={client.id}
                                    type='button'
                                    onClick={() => selectClient(client)}
                                    className='w-full text-left px-4 py-3 hover:bg-[#51c879]/10 transition-colors'
                                  >
                                    <div className='flex items-start justify-between gap-3'>
                                      <div>
                                        <p className='text-sm font-semibold text-gray-800'>{client.name}</p>
                                        <p className='text-xs text-gray-400'>
                                          {[client.phone, client.social_media].filter(Boolean).join(' · ') || 'Sin teléfono'}
                                        </p>
                                      </div>
                                      <span className='text-xs font-semibold text-[#51c879]'>Usar</span>
                                    </div>
                                    {client.delivery_address && (
                                      <p className='text-xs text-gray-500 mt-1 line-clamp-1'>{client.delivery_address}</p>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        {formData.client_id ? (
                          <div className='mt-1.5 flex flex-wrap items-center justify-between gap-2'>
                            <p className='text-xs font-medium text-[#51c879]'>
                              {editingOrder
                                ? 'Cliente seleccionado. Guarda para aplicar el vínculo.'
                                : 'Cliente seleccionado. Se vinculará al crear el pedido.'}
                            </p>
                            <div className='flex items-center gap-2'>
                              <button
                                type='button'
                                onClick={syncLinkedClient}
                                className='text-xs font-semibold text-sky-600 hover:text-sky-700'
                              >
                                Sincronizar datos
                              </button>
                              <button
                                type='button'
                                onClick={() => setFormData({ ...formData, client_id: null })}
                                className='text-xs font-medium text-gray-400 hover:text-red-500'
                              >
                                Desvincular
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className='mt-1.5 flex flex-wrap items-center justify-between gap-2'>
                            <p className='text-xs text-gray-400'>Sin cliente vinculado.</p>
                            {formData.customer_name.trim() && (
                              <button
                                type='button'
                                onClick={saveOrderCustomerAsClient}
                                className='text-xs font-semibold text-[#51c879] hover:text-[#45b86b]'
                              >
                                Guardar como cliente
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {!isInPerson && (
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1.5'>
                          Teléfono
                          {formData.customer_phone && formData.customer_phone.length !== 8 && (
                            <span className='ml-1.5 text-orange-400 font-normal'>{formData.customer_phone.length}/8</span>
                          )}
                        </label>
                        <input
                          type='text'
                          value={formData.customer_phone}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '')
                            const phone = digits.startsWith('505') && digits.length > 8 ? digits.slice(3) : digits
                            setFormData({ ...formData, customer_phone: phone.slice(0, 8) })
                          }}
                          className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                          placeholder='88881234'
                        />
                      </div>
                      )}
                      {SHOW_SOCIAL_MEDIA && (
                        <div>
                          <label className='block text-xs font-medium text-gray-600 mb-1.5'>Red Social</label>
                          <input
                            type='text'
                            value={formData.customer_social_media}
                            onChange={(e) => setFormData({ ...formData, customer_social_media: e.target.value })}
                            className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                            placeholder='Facebook, Instagram...'
                          />
                        </div>
                      )}
                      {!isInPerson && (
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1.5'>Dirección de Entrega</label>
                        <input
                          type='text'
                          value={formData.delivery_address}
                          onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                          className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                        />
                      </div>
                      )}
                    </div>
                  </div>

                  {/* Estado del Pedido */}
                  <div className='border-t border-gray-100 pt-5 space-y-4'>
                    <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Estado del Pedido</p>

                    {/* Estado pills */}
                    <div>
                      <label className='block text-xs font-medium text-gray-600 mb-2'>Estado</label>
                      <div className='flex flex-wrap gap-2'>
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <button
                            key={key}
                            type='button'
                            onClick={() => setFormData({ ...formData, status: key })}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border-2 ${
                              formData.status === key
                                ? `${getStatusColor(key)} border-transparent shadow-sm`
                                : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {formData.status === 'backlog' && (
                        <p className='text-xs text-gray-400 mt-1.5'>Los productos son opcionales.</p>
                      )}
                    </div>

                    {/* Prioridad pills */}
                    <div>
                      <label className='block text-xs font-medium text-gray-600 mb-2'>Prioridad</label>
                      <div className='flex gap-2'>
                        {Object.entries(priorityLabels).map(([key, label]) => (
                          <button
                            key={key}
                            type='button'
                            onClick={() => setFormData({ ...formData, priority: key })}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border-2 ${
                              formData.priority === key
                                ? `${getPriorityColor(key)} border-transparent shadow-sm`
                                : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fecha de entrega */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                      <div>
                        <div className='flex items-center justify-between mb-1.5'>
                          <label className='block text-xs font-medium text-gray-600'>Fecha de Entrega</label>
                          <div className='flex gap-1'>
                            {[7, 15].map((days) => (
                              <button
                                key={days}
                                type='button'
                                onClick={() => {
                                  const base = formData.order_date ? new Date(formData.order_date + 'T00:00:00') : new Date()
                                  base.setDate(base.getDate() + days)
                                  const dateStr = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
                                  setFormData({ ...formData, estimated_delivery_date: dateStr })
                                }}
                                className='text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-[#51c879] hover:text-white transition-colors'
                              >
                                +{days}d
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type='date'
                          value={formData.estimated_delivery_date}
                          onChange={(e) => setFormData({ ...formData, estimated_delivery_date: e.target.value })}
                          className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                        />
                      </div>
                    </div>

                    {/* Pagos */}
                    {(() => {
                      const draftTotal = calculateTotal() + (formData.delivery_method === 'delivery' ? toNumber(formData.delivery_fee) : 0)
                      const summary = getPaymentSummary(editPayments, draftTotal)
                      return (
                        <div className='border border-gray-200 rounded-xl p-4'>
                          <div className='flex items-center justify-between mb-3'>
                            <p className='text-sm font-semibold text-gray-700'>Pagos</p>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${draftTotal < 0.009 ? 'bg-gray-100 text-gray-500' : getPaymentColor(summary.status)}`}>
                              {draftTotal < 0.009 ? 'Sin costo' : paymentStatusLabels[summary.status]}
                            </span>
                          </div>

                          {!editingOrder ? (
                            <p className='text-sm text-gray-400'>Guarda el pedido para registrar pagos.</p>
                          ) : (
                            <>
                              {editPayments.length === 0 ? (
                                <p className='text-sm text-gray-400 mb-3'>Sin pagos registrados.</p>
                              ) : (
                                <div className='space-y-2 mb-3'>
                                  {editPayments.map((p) => (
                                    <div key={p.id} className='flex items-center gap-2 text-sm'>
                                      <span className='text-gray-400 w-14 flex-shrink-0'>
                                        {new Date(p.paid_at + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: 'short' })}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${payMethodColor[p.method]}`}>
                                        {payMethodLabels[p.method]}
                                      </span>
                                      <span className='font-semibold text-gray-800 flex-shrink-0'>C$ {toNumber(p.amount).toFixed(2)}</span>
                                      {p.note && <span className='text-gray-400 truncate'>{p.note}</span>}
                                      <button
                                        type='button'
                                        onClick={() => deletePayment(p.id)}
                                        className='ml-auto px-2 py-1 flex items-center gap-1 text-xs font-medium text-red-500 hover:text-white hover:bg-red-500 border border-red-200 rounded-lg transition-colors flex-shrink-0'
                                        title='Eliminar este pago'
                                      >
                                        Borrar
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className='text-sm border-t border-gray-100 pt-3 mb-3 space-y-0.5'>
                                <div className='flex justify-between'>
                                  <span className='text-gray-500'>Pagado</span>
                                  <span className='font-semibold text-gray-800'>C$ {summary.paid.toFixed(2)} / C$ {draftTotal.toFixed(2)}</span>
                                </div>
                                {summary.balance > 0.009 && (
                                  <div className='flex justify-between'>
                                    <span className='text-gray-500'>Saldo pendiente</span>
                                    <span className='font-semibold text-red-600'>C$ {summary.balance.toFixed(2)}</span>
                                  </div>
                                )}
                                {summary.commission > 0.009 && (
                                  <>
                                    <div className='flex justify-between'>
                                      <span className='text-gray-500'>Comisión tarjeta (6.75%)</span>
                                      <span className='text-gray-500'>− C$ {summary.commission.toFixed(2)}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                      <span className='text-gray-600 font-medium'>Neto recibido</span>
                                      <span className='font-bold text-[#51c879]'>C$ {summary.net.toFixed(2)}</span>
                                    </div>
                                  </>
                                )}
                              </div>

                              {summary.balance > 0.009 ? (
                              <div className='flex flex-wrap items-end gap-2'>
                                <div className='flex-1 min-w-[100px]'>
                                  <div className='flex items-center justify-between mb-1'>
                                    <label className='block text-xs text-gray-500'>Monto</label>
                                    <button
                                      type='button'
                                      onClick={() => setPaymentForm({ ...paymentForm, amount: summary.balance.toFixed(2) })}
                                      className='text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-[#51c879] hover:text-white transition-colors'
                                      title='Usar el saldo pendiente'
                                    >
                                      Saldo C$ {summary.balance.toFixed(0)}
                                    </button>
                                  </div>
                                  <input
                                    type='number'
                                    min='0'
                                    step='0.01'
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    className='w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                                    placeholder='0.00'
                                  />
                                </div>
                                <div className='min-w-[130px]'>
                                  <label className='block text-xs text-gray-500 mb-1'>Método</label>
                                  <select
                                    value={paymentForm.method}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                                    className='w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                                  >
                                    {Object.entries(payMethodLabels).map(([key, label]) => (
                                      <option key={key} value={key}>{label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className='min-w-[140px]'>
                                  <label className='block text-xs text-gray-500 mb-1'>Fecha</label>
                                  <input
                                    type='date'
                                    value={paymentForm.paid_at}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, paid_at: e.target.value })}
                                    className='w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                                  />
                                </div>
                                <div className='flex-1 min-w-[120px]'>
                                  <label className='block text-xs text-gray-500 mb-1'>Nota (opcional)</label>
                                  <input
                                    type='text'
                                    value={paymentForm.note}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                                    className='w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                                    placeholder='anticipo, saldo...'
                                  />
                                </div>
                                <button
                                  type='button'
                                  onClick={addPayment}
                                  className='px-4 py-2 bg-[#51c879] text-white rounded-lg text-sm font-semibold hover:bg-[#45b56a] transition-colors'
                                >
                                  + Pago
                                </button>
                              </div>
                              ) : (
                                draftTotal < 0.009
                                  ? <p className='text-sm text-gray-400'>Pedido sin costo (C$0) — no se requiere pago.</p>
                                  : <p className='text-sm text-gray-400'>Pedido pagado por completo. Para ajustar, usa el botón Borrar de un pago en la lista de arriba.</p>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Entrega */}
                  <div className='border-t border-gray-100 pt-5'>
                    <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3'>{isInPerson ? 'Fecha' : 'Entrega'}</p>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                      {!isInPerson && (
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1.5'>Modalidad *</label>
                        <select
                          value={formData.delivery_method}
                          onChange={(e) => setFormData({ ...formData, delivery_method: e.target.value })}
                          className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                        >
                          {Object.entries(deliveryMethodLabels).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                      )}
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1.5'>Fecha del Encargo *</label>
                        <input
                          type='date'
                          required
                          value={formData.order_date}
                          onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                          className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                        />
                      </div>
                    </div>
                    {!isInPerson && formData.delivery_method === 'delivery' && (
                      <div className='grid grid-cols-1 md:grid-cols-3 gap-3 mt-3'>
                        <div>
                          <label className='block text-xs font-medium text-gray-600 mb-1.5'>Costo Delivery (C$)</label>
                          <input
                            type='number'
                            step='0.01'
                            min='0'
                            value={formData.delivery_fee}
                            onChange={(e) => setFormData({ ...formData, delivery_fee: e.target.value })}
                            className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                            placeholder='0.00'
                          />
                        </div>
                        <div>
                          <label className='block text-xs font-medium text-gray-600 mb-1.5'>Persona que Recibe</label>
                          <input
                            type='text'
                            value={formData.recipient_name}
                            onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                            className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                            placeholder='Si es diferente al cliente'
                          />
                        </div>
                        <div>
                          <label className='block text-xs font-medium text-gray-600 mb-1.5'>
                            Teléfono de quien Recibe
                            {formData.recipient_phone && formData.recipient_phone.length !== 8 && (
                              <span className='ml-1.5 text-orange-400 font-normal'>{formData.recipient_phone.length}/8</span>
                            )}
                          </label>
                          <input
                            type='text'
                            value={formData.recipient_phone}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '')
                              const phone = digits.startsWith('505') && digits.length > 8 ? digits.slice(3) : digits
                              setFormData({ ...formData, recipient_phone: phone.slice(0, 8) })
                            }}
                            className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                            placeholder='Si es diferente al cliente'
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recordatorio de WhatsApp */}
                  {SHOW_WHATSAPP_REMINDER && (
                  <div className='border-t border-gray-100 pt-5'>
                    <div className='flex items-center justify-between gap-3 mb-3'>
                      <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Recordatorio WhatsApp</p>
                      {(formData.follow_up_reason || formData.follow_up_date) && (
                        <button
                          type='button'
                          onClick={() => setFormData({ ...formData, follow_up_reason: '', follow_up_date: '' })}
                          className='text-xs font-medium text-gray-400 hover:text-red-500'
                        >
                          Limpiar recordatorio
                        </button>
                      )}
                    </div>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1.5'>Mensaje sugerido</label>
                        <select
                          value={formData.follow_up_reason}
                          onChange={(e) => setFormData({ ...formData, follow_up_reason: e.target.value })}
                          className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                        >
                          <option value=''>Sin recordatorio</option>
                          {Object.entries(followUpReasonLabels).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className='flex items-center justify-between mb-1.5'>
                          <label className='block text-xs font-medium text-gray-600'>Recordar el</label>
                          <div className='flex gap-1'>
                            {formData.estimated_delivery_date && (
                              <button
                                type='button'
                                onClick={() => {
                                  const base = new Date(formData.estimated_delivery_date + 'T00:00:00')
                                  base.setDate(base.getDate() - 1)
                                  const dateStr = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
                                  setFormData({
                                    ...formData,
                                    follow_up_reason: formData.follow_up_reason || 'confirm_delivery_details',
                                    follow_up_date: dateStr
                                  })
                                }}
                                className='text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors'
                              >
                                1d antes entrega
                              </button>
                            )}
                            {[1, 2, 3].map((days) => (
                              <button
                                key={days}
                                type='button'
                                onClick={() => {
                                  const base = new Date()
                                  base.setDate(base.getDate() + days)
                                  const dateStr = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
                                  setFormData({ ...formData, follow_up_date: dateStr })
                                }}
                                className='text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-amber-500 hover:text-white transition-colors'
                              >
                                +{days}d
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type='date'
                          value={formData.follow_up_date}
                          onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                          className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                        />
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Notas y regalo */}
                  <div className='border-t border-gray-100 pt-5 space-y-3'>
                    <div>
                      <label className='block text-xs font-medium text-gray-600 mb-1.5'>Notas</label>
                      <textarea
                        rows={2}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm resize-none'
                        placeholder='Instrucciones especiales, detalles del diseño...'
                      />
                    </div>
                    {!isInPerson && (
                    <button
                      type='button'
                      onClick={() => setFormData({ ...formData, is_gift: !formData.is_gift })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        formData.is_gift
                          ? 'bg-pink-50 border-pink-200 text-pink-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <svg className='w-4 h-4' fill={formData.is_gift ? 'currentColor' : 'none'} stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v13m0-13V6a2 2 0 112.83 2.83L12 12m0-4V6a2 2 0 10-2.83 2.83L12 12m0 0l-2.83-2.83M12 12l2.83-2.83M4 12h16v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z' />
                      </svg>
                      {formData.is_gift ? 'Es un regalo' : 'Marcar como regalo'}
                    </button>
                    )}
                  </div>

                  {/* Productos */}
                  <div className='border-t border-gray-100 pt-5'>
                    <div className='flex items-center justify-between mb-3'>
                      <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Productos</p>
                      <button
                        type='button'
                        onClick={addItem}
                        className='flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity'
                      >
                        <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
                        </svg>
                        Agregar
                      </button>
                    </div>

                    <div className='space-y-3'>
                      {formData.items.map((item, index) => (
                        <div key={item._key || index} className='bg-gray-50 p-3 rounded-xl border border-gray-200'>
                          <div className='flex items-center justify-between mb-3'>
                            {isInPerson ? (
                              <span className='text-xs font-semibold text-gray-600'>Trabajo de grabado</span>
                            ) : (
                              <label className='flex items-center gap-2 cursor-pointer'>
                                <input
                                  type='checkbox'
                                  checked={item.is_custom}
                                  onChange={(e) => updateItem(index, 'is_custom', e.target.checked)}
                                  className='w-3.5 h-3.5 rounded border-gray-300 text-[#51c879] focus:ring-[#51c879]'
                                />
                                <span className='text-xs font-medium text-gray-600'>Producto personalizado</span>
                              </label>
                            )}
                            <button
                              type='button'
                              onClick={() => removeItem(index)}
                              className='p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors'
                              title='Eliminar producto'
                            >
                              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                              </svg>
                            </button>
                          </div>

                          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                            {!(isInPerson || item.is_custom) ? (
                              <div className='md:col-span-2'>
                                <label className='block text-xs font-medium text-gray-600 mb-1.5'>Producto del Catálogo</label>
                                <div className='relative'>
                                  {(() => {
                                    const query = (item.product_query || '').trim().toLowerCase()
                                    const matches = query
                                      ? products.filter(p => p.name.toLowerCase().includes(query))
                                      : products
                                    const visible = matches.slice(0, 8)
                                    const activeIndex = item.product_active_index ?? 0
                                    return (
                                      <>
                                        <div className='relative'>
                                          <input
                                            type='text'
                                            value={item.product_query || ''}
                                            onChange={(e) => updateItem(index, 'product_query', e.target.value)}
                                            onFocus={() => updateItem(index, 'product_open', true)}
                                            onBlur={() => {
                                              setTimeout(() => {
                                                updateItem(index, 'product_open', false)
                                                updateItem(index, 'product_active_index', -1)
                                              }, 120)
                                            }}
                                            onKeyDown={(e) => handleProductKeyDown(index, e, visible)}
                                            className='w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent bg-white text-sm'
                                            placeholder='Busca un producto...'
                                            role='combobox'
                                            aria-expanded={item.product_open ? 'true' : 'false'}
                                            aria-controls={`product-list-${index}`}
                                          />
                                          <svg className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                                          </svg>
                                        </div>

                                        {item.product_id && (
                                          <div className='mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200'>
                                            {item.product_name} · C$ {toNumber(item.unit_price).toFixed(2)}
                                          </div>
                                        )}

                                        {item.product_open && (
                                          <div
                                            id={`product-list-${index}`}
                                            role='listbox'
                                            className='absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl'
                                            onMouseDown={(e) => e.preventDefault()}
                                          >
                                            {visible.length === 0 ? (
                                              <div className='px-4 py-3 text-sm text-gray-400'>Sin resultados.</div>
                                            ) : (
                                              visible.map((p, i) => (
                                                <button
                                                  key={p.id}
                                                  type='button'
                                                  role='option'
                                                  aria-selected={item.product_id === p.id}
                                                  onClick={() => selectProduct(index, p)}
                                                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 text-sm transition-colors ${
                                                    i === activeIndex ? 'bg-[#51c879]/10' : 'bg-white'
                                                  } hover:bg-[#51c879]/10`}
                                                >
                                                  <span className='truncate font-medium text-gray-800'>
                                                    {highlightMatch(p.name, item.product_query || '')}
                                                  </span>
                                                  <span className='text-gray-500 flex-shrink-0'>C$ {parseFloat(p.price).toFixed(2)}</span>
                                                </button>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )
                                  })()}
                                </div>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <label className='block text-xs font-medium text-gray-600 mb-1.5'>Nombre</label>
                                  <input
                                    type='text'
                                    value={item.product_name}
                                    onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                                    className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                                    placeholder='Ej: Piñata personalizada'
                                  />
                                </div>
                                <div>
                                  <label className='block text-xs font-medium text-gray-600 mb-1.5'>Descripción</label>
                                  <input
                                    type='text'
                                    value={item.product_description}
                                    onChange={(e) => updateItem(index, 'product_description', e.target.value)}
                                    className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                                    placeholder='Detalles del producto'
                                  />
                                </div>
                              </>
                            )}

                            <div>
                              <label className='block text-xs font-medium text-gray-600 mb-1.5'>Cantidad</label>
	                              <input
	                                type='number'
	                                min='1'
	                                value={item.quantity}
	                                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
	                                className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
	                              />
                            </div>

                            <div>
                              <label className='block text-xs font-medium text-gray-600 mb-1.5'>Precio Unitario (C$)</label>
                              <input
                                type='number'
                                step='0.01'
	                                min='0'
	                                value={item.unit_price}
	                                onFocus={(e) => e.target.select()}
	                                onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
	                                className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
	                              />
                            </div>

                            <div>
                              <label className='block text-xs font-medium text-gray-600 mb-1.5'>Cargo Urgencia (C$)</label>
                              <input
                                type='number'
                                step='0.01'
	                                min='0'
	                                value={item.rush_fee}
	                                onFocus={(e) => e.target.select()}
	                                onChange={(e) => updateItem(index, 'rush_fee', e.target.value)}
	                                className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
	                              />
                            </div>
                          </div>

	                          <div className='mt-2 text-right'>
	                            <span className='text-xs font-semibold text-gray-600'>
	                              Subtotal: C$ {((toQuantity(item.quantity) * toNumber(item.unit_price)) + toNumber(item.rush_fee)).toFixed(2)}
	                            </span>
	                          </div>
                        </div>
                      ))}

                      {formData.items.length === 0 && (
                        <div className='text-center py-6 border-2 border-dashed border-gray-200 rounded-xl'>
                          <p className='text-sm text-gray-400'>
                            {formData.status === 'backlog' ? 'Puedes guardar sin productos por ahora.' : 'Agrega al menos un ítem para crear el pedido. Puede ser un “Producto personalizado” (ej. un grabado).'}
                          </p>
                        </div>
                      )}
                    </div>

                    {formData.items.length > 0 && (
                      <div className='mt-4 flex items-center justify-between bg-gradient-to-r from-[#51c879]/10 to-[#50bfe6]/10 px-4 py-3 rounded-xl'>
                        <div className='text-sm text-gray-600 space-y-0.5'>
                          <p>Productos: <span className='font-semibold'>C$ {calculateTotal().toFixed(2)}</span></p>
                          {formData.delivery_method === 'delivery' && toNumber(formData.delivery_fee) > 0 && (
                            <p>Delivery: <span className='font-semibold'>C$ {toNumber(formData.delivery_fee).toFixed(2)}</span></p>
                          )}
                        </div>
                        <p className='text-xl font-bold text-gray-900'>
                          C$ {(calculateTotal() + (formData.delivery_method === 'delivery' ? toNumber(formData.delivery_fee) : 0)).toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>

                </div>
                <div className='flex gap-3 p-4 border-t bg-white rounded-b-2xl'>
                  <button
                    type='button'
                    onClick={resetForm}
                    className='px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold'
                  >
                    Cancelar
                  </button>
                  <button
                    type='submit'
                    disabled={loading || (formData.items.length === 0 && formData.status !== 'backlog')}
                    className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all'
                  >
                    {loading ? 'Guardando...' : editingOrder ? 'Actualizar' : 'Crear Pedido'}
                  </button>
                </div>
              </form>
          </div>
          </div>
        )}

      </div>
    </div>
  )
}
