import { useState, useEffect } from 'react'
import { supabase } from '../config/supabaseClient'
import { useNavigate } from 'react-router-dom'
import AdminLogin from '../components/AdminLogin'
import { TABLE } from '../utils/constants'
import OrderCalculator from '../components/OrderCalculator'
import toast from 'react-hot-toast'

export default function Orders() {
  const navigate = useNavigate()
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
  const [calcOrder, setCalcOrder] = useState(null)
  const [selectedOrders, setSelectedOrders] = useState(new Set())
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('ordersViewMode') || 'list')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterDelivery, setFilterDelivery] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [draggedOrderId, setDraggedOrderId] = useState(null)
  const [filterGift, setFilterGift] = useState('no_gifts')
  const [selectedDay, setSelectedDay] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_social_media: '',
    delivery_address: '',
    delivery_method: 'delivery',
    order_date: new Date().toISOString().split('T')[0],
    status: 'pending',
    priority: 'normal',
    payment_status: 'unpaid',
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

      if (user) {
        fetchOrders()
        fetchProducts()
      }
    }

    checkUser()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [filterStatus, filterPriority, filterMonth, filterDelivery, sortBy, searchQuery, filterGift, selectedDay])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(TABLE.ORDERS)
        .select(`
          *,
          order_items (
            *,
            products (name, image_url, width, length)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setOrders(data || [])
    } catch (error) {
      toast.error('Error al cargar pedidos: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    const { data } = await supabase
      .from(TABLE.PRODUCT)
      .select('id, name, price')
      .order('name')
    setProducts(data || [])
  }

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
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
        is_custom: false
      }]
    })
  }

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    })
  }

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
      return sum + (item.quantity * item.unit_price) + (item.rush_fee || 0)
    }, 0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const orderData = {
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone || null,
        customer_social_media: formData.customer_social_media || null,
        delivery_address: formData.delivery_address || null,
        delivery_method: formData.delivery_method,
        order_date: formData.order_date,
        status: formData.status,
        priority: formData.priority,
        payment_status: formData.payment_status,
        notes: formData.notes || null,
        estimated_delivery_date: formData.estimated_delivery_date || null,
        delivery_fee: formData.delivery_method === 'delivery' ? (parseFloat(formData.delivery_fee) || 0) : 0,
        recipient_name: formData.delivery_method === 'delivery' ? (formData.recipient_name || null) : null,
        recipient_phone: formData.delivery_method === 'delivery' ? (formData.recipient_phone || null) : null,
        is_gift: formData.is_gift,
        total_amount: calculateTotal()
      }

      let orderId
      if (editingOrder) {
        const { error } = await supabase
          .from(TABLE.ORDERS)
          .update(orderData)
          .eq('id', editingOrder.id)
        
        if (error) throw error
        orderId = editingOrder.id

        await supabase
          .from(TABLE.ORDER_ITEMS)
          .delete()
          .eq('order_id', orderId)
      } else {
        const { data, error } = await supabase
          .from(TABLE.ORDERS)
          .insert([orderData])
          .select()
        
        if (error) throw error
        orderId = data[0].id
      }

      const items = formData.items.map(item => ({
        order_id: orderId,
        product_id: item.is_custom ? null : item.product_id,
        product_name: item.product_name,
        product_description: item.product_description || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        hours_needed: item.hours_needed || null,
        rush_fee: item.rush_fee || 0,
        subtotal: (item.quantity * item.unit_price) + (item.rush_fee || 0)
      }))

      const { error: itemsError } = await supabase
        .from(TABLE.ORDER_ITEMS)
        .insert(items)

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
      customer_name: '',
      customer_phone: '',
      customer_social_media: '',
      delivery_address: '',
      delivery_method: 'delivery',
      order_date: new Date().toISOString().split('T')[0],
      status: 'pending',
      priority: 'normal',
      payment_status: 'unpaid',
      notes: '',
      estimated_delivery_date: '',
      delivery_fee: 0,
      recipient_name: '',
      recipient_phone: '',
      is_gift: false,
      items: []
    })
    setEditingOrder(null)
    setShowForm(false)
  }

  const editOrder = (order) => {
    setFormData({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || '',
      customer_social_media: order.customer_social_media || '',
      delivery_address: order.delivery_address || '',
      delivery_method: order.delivery_method || 'delivery',
      order_date: order.order_date || new Date().toISOString().split('T')[0],
      status: order.status,
      priority: order.priority,
      payment_status: order.payment_status || 'unpaid',
      notes: order.notes || '',
      estimated_delivery_date: order.estimated_delivery_date || '',
      delivery_fee: order.delivery_fee || 0,
      recipient_name: order.recipient_name || '',
      recipient_phone: order.recipient_phone || '',
      is_gift: order.is_gift || false,
      items: order.order_items.map(item => ({
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
        is_custom: !item.product_id
      }))
    })
    setEditingOrder(order)
    setShowForm(true)
  }

  const deleteOrder = async (id) => {
    if (!confirm('¿Eliminar este pedido?')) return

    const { error } = await supabase
      .from(TABLE.ORDERS)
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Error al eliminar')
    } else {
      toast.success('Pedido eliminado')
      fetchOrders()
    }
  }

  const updateOrderStatus = async (id, status) => {
    const updateData = { status }
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from(TABLE.ORDERS)
      .update(updateData)
      .eq('id', id)

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

  const updatePaymentStatus = async (id, payment_status) => {
    const { error } = await supabase
      .from(TABLE.ORDERS)
      .update({ payment_status })
      .eq('id', id)

    if (error) {
      toast.error('Error al actualizar estado de pago')
    } else {
      fetchOrders()
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    navigate('/admin')
  }

  const openWhatsApp = (order) => {
    let phone = order.customer_phone
    if (!phone) {
      toast.error('Este pedido no tiene número de teléfono registrado')
      return
    }

    // Clean phone number (remove spaces, dashes, etc.)
    phone = phone.replace(/\D/g, '')
    
    // Generate simple message without special characters
    const message = `Hola ${order.customer_name}!

Te escribo sobre tu pedido.

Detalles del pedido:
${order.order_items.map(item => `- ${item.product_name}, cantidad: ${item.quantity}`).join('\n')}

Total productos: C$ ${parseFloat(order.total_amount).toFixed(2)}
${order.delivery_fee > 0 ? `Delivery: C$ ${parseFloat(order.delivery_fee).toFixed(2)}\nTotal: C$ ${(parseFloat(order.total_amount) + parseFloat(order.delivery_fee)).toFixed(2)}` : ''}
${order.estimated_delivery_date ? `Fecha estimada de entrega: ${new Date(order.estimated_delivery_date + 'T00:00:00').toLocaleDateString('es-NI')}` : ''}`

    const encodedMessage = encodeURIComponent(message)
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`
    
    window.open(whatsappUrl, '_blank')
  }

  const getStatusColor = (status) => {
    const colors = {
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

  const statusLabels = {
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
      const payLabel = { paid: 'PAGADO', partial: 'PARCIAL', unpaid: 'NO PAGADO' }[order.payment_status] || 'NO PAGADO'
      const payClass = { paid: 'paid', partial: 'partial', unpaid: 'unpaid' }[order.payment_status] || 'unpaid'
      const delivery = order.estimated_delivery_date
        ? new Date(order.estimated_delivery_date + 'T00:00:00').toLocaleDateString('es-NI')
        : ''
      const method = order.delivery_method === 'pickup' ? 'Recoger en Tienda' : 'Entrega a Domicilio'

      const labelName = order.recipient_name || order.customer_name
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
      const labelName = order.recipient_name || order.customer_name
      const labelPhone = order.recipient_name ? (order.recipient_phone || order.customer_phone) : order.customer_phone

      return `<div class="label">
        <div class="brand">MagicArte Nicaragua</div>
        <div class="tagline">Creaciones únicas en MDF</div>
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
    if (filterMonth !== 'all') {
      const orderDate = order.order_date || order.created_at
      if (!orderDate || !orderDate.startsWith(filterMonth)) return false
    }
    if (filterDelivery === 'today' && order.estimated_delivery_date !== today) return false
    if (filterDelivery === 'week' && (!order.estimated_delivery_date || order.estimated_delivery_date < weekStart || order.estimated_delivery_date > weekEnd)) return false
    if (filterDelivery === 'overdue' && (!order.estimated_delivery_date || order.estimated_delivery_date >= today || ['completed', 'canceled'].includes(order.status))) return false
    if (filterGift === 'no_gifts' && order.is_gift) return false
    if (filterGift === 'only_gifts' && !order.is_gift) return false
    if (selectedDay && order.estimated_delivery_date !== selectedDay) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchesName = order.customer_name?.toLowerCase().includes(q)
      const matchesPhone = order.customer_phone?.toLowerCase().includes(q)
      const matchesNumber = String(order.order_number).includes(q)
      if (!matchesName && !matchesPhone && !matchesNumber) return false
    }
    return true
  }).sort((a, b) => {
    // Primary: payment status (paid first, then partial, then unpaid)
    const paymentOrder = { paid: 0, partial: 1, unpaid: 2 }
    const payDiff = (paymentOrder[a.payment_status] ?? 2) - (paymentOrder[b.payment_status] ?? 2)
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

  const totalRevenue = filteredOrders
    .filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0)

  const stats = {
    total: filteredOrders.length,
    pending: filteredOrders.filter(o => o.status === 'pending').length,
    in_progress: filteredOrders.filter(o => o.status === 'in_progress').length,
    completed: filteredOrders.filter(o => o.status === 'completed').length,
    revenue: totalRevenue,
    expectedRevenue: filteredOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0),
    pending_payment: filteredOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) - totalRevenue
  }

  // Build available months from orders for the dropdown
  const availableMonths = [...new Set(orders.map(o => {
    const d = o.order_date || o.created_at
    return d ? d.slice(0, 7) : null
  }).filter(Boolean))].sort().reverse()

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
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-7xl mx-auto px-4'>
        {/* Header */}
        <div className='bg-white rounded-2xl shadow-lg p-6 mb-8'>
          <div className='flex justify-between items-center mb-6'>
            <div>
              <h1 className='text-3xl font-bold text-gray-800'>Gestión de Pedidos</h1>
              <p className='text-gray-600 mt-2'>{user.email}</p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => navigate('/admin')}
                className='bg-gray-200 text-gray-700 px-4 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-all'
              >
                ← Volver a Admin
              </button>
              <button
                onClick={handleLogout}
                className='bg-gray-200 text-gray-700 px-4 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-all'
              >
                Cerrar Sesión
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className='grid grid-cols-2 md:grid-cols-7 gap-4'>
            <div className='bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl'>
              <p className='text-sm text-blue-600 font-medium'>Total Pedidos</p>
              <p className='text-3xl font-bold text-blue-900'>{stats.total}</p>
            </div>
            <div className='bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-xl'>
              <p className='text-sm text-yellow-600 font-medium'>Pendientes</p>
              <p className='text-3xl font-bold text-yellow-900'>{stats.pending}</p>
            </div>
            <div className='bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl'>
              <p className='text-sm text-purple-600 font-medium'>En Proceso</p>
              <p className='text-3xl font-bold text-purple-900'>{stats.in_progress}</p>
            </div>
            <div className='bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl'>
              <p className='text-sm text-green-600 font-medium'>Completados</p>
              <p className='text-3xl font-bold text-green-900'>{stats.completed}</p>
            </div>
            <div className='bg-gradient-to-br from-[#51c879]/10 to-[#50bfe6]/10 p-4 rounded-xl'>
              <p className='text-sm text-[#51c879] font-medium'>Ingresos</p>
              <p className='text-2xl font-bold text-gray-900'>C$ {stats.revenue.toFixed(2)}</p>
            </div>
            <div className='bg-gradient-to-br from-amber-50 to-amber-100 p-4 rounded-xl'>
              <p className='text-sm text-amber-600 font-medium'>Esperado</p>
              <p className='text-2xl font-bold text-amber-900'>C$ {stats.expectedRevenue.toFixed(2)}</p>
            </div>
            <div className='bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl'>
              <p className='text-sm text-red-600 font-medium'>Por Cobrar</p>
              <p className='text-2xl font-bold text-red-900'>C$ {stats.pending_payment.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {!showForm ? (
          <>
            {/* Week Calendar */}
            <div className='bg-white rounded-2xl shadow-lg p-4 mb-6'>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-sm font-semibold text-gray-500 uppercase tracking-wide'>📅 Entregas esta semana</h3>
                {selectedDay && (
                  <button
                    onClick={() => setSelectedDay(null)}
                    className='text-xs text-gray-500 hover:text-red-500 transition-colors'
                  >
                    ✕ Quitar filtro
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
            <div className='bg-white rounded-2xl shadow-lg p-6 mb-6 space-y-4'>
              {/* Row 1: Action + Search */}
              <div className='flex flex-wrap items-center gap-3'>
                <button
                  onClick={() => setShowForm(true)}
                  className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all shadow-lg'
                >
                  + Nuevo Pedido
                </button>

                <div className='relative flex-1 min-w-[240px] max-w-md'>
                  <span className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'>🔍</span>
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
                    className={`px-4 py-3 rounded-xl font-semibold transition-colors ${viewMode === 'board' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
                  >
                    {viewMode === 'board' ? '📋 Lista' : '📊 Tablero'}
                  </button>
                </div>
              </div>

              {/* Row 2: Delivery quick filters */}
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1'>Entregas:</span>
                {[
                  { key: 'all', label: 'Todas', icon: '📅' },
                  { key: 'today', label: 'Hoy', icon: '📌' },
                  { key: 'week', label: 'Esta semana', icon: '🗓️' },
                  { key: 'overdue', label: 'Vencidos', icon: '⚠️' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFilterDelivery(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterDelivery === opt.key
                      ? opt.key === 'overdue' ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : 'bg-[#51c879]/15 text-[#3a9e5c] ring-1 ring-[#51c879]/40'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.icon} {opt.label}
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
                  <option value='active'>🟢 Activos (Pend · Conf · Proceso · Listo)</option>
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

                {(filterStatus !== 'active' || filterPriority !== 'all' || filterMonth !== 'all' || filterDelivery !== 'all' || filterGift !== 'no_gifts' || selectedDay || searchQuery) && (
                  <button
                    onClick={() => { setFilterStatus('active'); setFilterPriority('all'); setFilterMonth('all'); setFilterDelivery('all'); setFilterGift('no_gifts'); setSelectedDay(null); setSearchQuery('') }}
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
                      onClick={() => setCalcOrder(selectedOrderObjects)}
                      className='bg-amber-500 text-white px-5 py-2 rounded-xl font-semibold hover:bg-amber-600 transition-colors shadow-md'
                    >
                      🧮 Calcular {selectedOrders.size} pedido{selectedOrders.size > 1 ? 's' : ''}
                    </button>
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
                  { key: 'pending', label: 'Pendiente', color: 'yellow', icon: '🕐' },
                  { key: 'confirmed', label: 'Confirmado', color: 'blue', icon: '✅' },
                  { key: 'in_progress', label: 'En Proceso', color: 'purple', icon: '⚙️' },
                  { key: 'ready', label: 'Listo para Entregar', color: 'teal', icon: '📦' }
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

                  const colColors = {
                    yellow: 'from-yellow-400 to-yellow-500',
                    blue: 'from-blue-400 to-blue-500',
                    purple: 'from-purple-400 to-purple-500',
                    teal: 'from-teal-400 to-teal-500'
                  }

                  return (
                    <div key={col.key} className='flex flex-col'>
                      <div className={`bg-gradient-to-r ${colColors[col.color]} text-white px-4 py-3 rounded-t-xl flex items-center justify-between`}>
                        <span className='font-bold text-sm'>{col.icon} {col.label}</span>
                        <span className='bg-white/30 px-2 py-0.5 rounded-full text-xs font-bold'>{colOrders.length}</span>
                      </div>
                      <div
                        className={`bg-gray-100 rounded-b-xl p-2 space-y-2 min-h-[200px] max-h-[70vh] overflow-y-auto transition-colors ${draggedOrderId ? 'border-2 border-dashed border-gray-300' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-gray-200') }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('bg-gray-200') }}
                        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-gray-200'); handleBoardDrop(col.key) }}
                      >
                        {colOrders.length === 0 && (
                          <p className='text-center text-gray-400 text-sm py-8'>Sin pedidos</p>
                        )}
                        {colOrders.map(order => {
                          const countdown = getDeliveryCountdown(order.estimated_delivery_date, order.status)
                          return (
                            <div
                              key={order.id}
                              draggable
                              onDragStart={() => setDraggedOrderId(order.id)}
                              onDragEnd={() => setDraggedOrderId(null)}
                              className={`bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${draggedOrderId === order.id ? 'opacity-50' : ''}`}
                              onClick={() => editOrder(order)}
                            >
                              <div className='flex items-center justify-between mb-1'>
                                <span className='font-bold text-sm text-gray-800 truncate'>{order.customer_name}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPriorityColor(order.priority)}`}>
                                  {priorityLabels[order.priority]}
                                </span>
                              </div>
                              <div className='text-xs text-gray-500 mb-1'>
                                {order.order_items?.length || 0} producto{(order.order_items?.length || 0) !== 1 ? 's' : ''}
                                <span className='mx-1'>·</span>
                                C$ {parseFloat(order.total_amount).toFixed(0)}
                              </div>
                              <div className='flex items-center justify-between'>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPaymentColor(order.payment_status)}`}>
                                  {paymentStatusLabels[order.payment_status] || 'No Pagado'}
                                </span>
                                {countdown && (
                                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${countdown.color}`}>
                                    {countdown.text}
                                  </span>
                                )}
                              </div>
                              {order.estimated_delivery_date && (
                                <div className='text-[10px] text-gray-400 mt-1'>
                                  📅 {new Date(order.estimated_delivery_date + 'T00:00:00').toLocaleDateString('es-NI')}
                                </div>
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
                {paginatedOrders.map((order) => (
                  <div key={order.id} className={`bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow ${selectedOrders.has(order.id) ? 'ring-2 ring-amber-400' : ''}`}>
                    <div className='flex justify-between items-start mb-4'>
                      <div className='flex-1'>
                        <div className='flex items-center gap-3 mb-3'>
                          <input
                            type='checkbox'
                            checked={selectedOrders.has(order.id)}
                            onChange={() => toggleOrderSelection(order.id)}
                            className='w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 flex-shrink-0'
                          />
                          <h3 className='text-2xl font-bold text-gray-800'>Pedido #{order.order_number}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                            {statusLabels[order.status]}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(order.priority)}`}>
                            {priorityLabels[order.priority]}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentColor(order.payment_status)}`}>
                            {paymentStatusLabels[order.payment_status] || 'No Pagado'}
                          </span>
                          {order.is_gift && (
                            <span className='px-3 py-1 rounded-full text-xs font-semibold bg-pink-100 text-pink-800'>
                              🎁 Regalo
                            </span>
                          )}
                        </div>
                        
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-600'>
                          <p><strong>Cliente:</strong> {order.customer_name}</p>
                          {order.customer_phone && <p><strong>Teléfono:</strong> {order.customer_phone}</p>}
                          {order.delivery_address && <p><strong>Dirección:</strong> {order.delivery_address}</p>}
                          {order.recipient_name && (
                            <p><strong>Recibe:</strong> {order.recipient_name}{order.recipient_phone ? ` — ${order.recipient_phone}` : ''}</p>
                          )}
                          <p><strong>Modalidad:</strong> {deliveryMethodLabels[order.delivery_method] || 'Entrega a Domicilio'}</p>
                          {order.order_date && <p><strong>Fecha del Encargo:</strong> {new Date(order.order_date + 'T00:00:00').toLocaleDateString('es-NI')}</p>}
                        </div>
                      </div>
                      
                      <div className='text-right ml-4'>
                        <p className='text-3xl font-bold text-[#51c879]'>C$ {parseFloat(order.total_amount).toFixed(2)}</p>
                        {order.delivery_fee > 0 && (
                          <p className='text-xs text-gray-500'>+ Delivery: C$ {parseFloat(order.delivery_fee).toFixed(2)}</p>
                        )}
                        {order.delivery_fee > 0 && (
                          <p className='text-sm font-semibold text-gray-700'>Total cliente: C$ {(parseFloat(order.total_amount) + parseFloat(order.delivery_fee)).toFixed(2)}</p>
                        )}
                        <p className='text-sm text-gray-500 mt-1'>{new Date(order.created_at).toLocaleDateString('es-NI')}</p>
                        {order.estimated_delivery_date && (
                          <div className='mt-1'>
                            <p className='text-sm text-gray-600'>
                              📅 Entrega: {new Date(order.estimated_delivery_date + 'T00:00:00').toLocaleDateString('es-NI')}
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
                    <div className='flex flex-wrap gap-2 pt-4 border-t'>
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        className='px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                      >
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <select
                        value={order.payment_status || 'unpaid'}
                        onChange={(e) => updatePaymentStatus(order.id, e.target.value)}
                        className={`px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${getPaymentColor(order.payment_status)}`}
                      >
                        {Object.entries(paymentStatusLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      {order.customer_phone && (
                        <button
                          onClick={() => openWhatsApp(order)}
                          className='px-4 py-2 text-sm bg-[#25D366] text-white rounded-lg hover:bg-[#20BA5A] transition-colors flex items-center gap-2'
                        >
                          <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 24 24'>
                            <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.787'/>
                          </svg>
                          WhatsApp
                        </button>
                      )}
                      <button
                        onClick={() => editOrder(order)}
                        className='px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors'
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => setCalcOrder([order])}
                        className='px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors'
                      >
                        🧮 Calcular
                      </button>
                      <button
                        onClick={() => printLabels([order])}
                        className='px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors'
                      >
                        🖨️ 4×2
                      </button>
                      <button
                        onClick={() => printLabels4x6([order])}
                        className='px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors'
                      >
                        🖨️ 4×6
                      </button>
                      <button
                        onClick={() => deleteOrder(order.id)}
                        className='px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors'
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                ))}

                {totalPages > 1 && (
                  <div className='flex items-center justify-between bg-white rounded-2xl shadow-lg px-6 py-4 mt-2'>
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
                  <div className='bg-white rounded-2xl shadow-lg p-12 text-center'>
                    <div className='text-6xl mb-4'>📦</div>
                    <p className='text-xl text-gray-500'>No hay pedidos que mostrar</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'>
            <div className='bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col'>
              <div className='flex justify-between items-center p-6 border-b'>
                <h2 className='text-2xl font-bold text-gray-800'>
                  {editingOrder ? 'Editar Pedido' : 'Nuevo Pedido'}
                </h2>
                <button
                  onClick={resetForm}
                  className='text-gray-500 hover:text-gray-700 text-3xl leading-none'
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className='flex flex-col flex-1 overflow-hidden'>
                <div className='flex-1 overflow-y-auto p-6 space-y-6'>
              {/* Customer Info */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Nombre del Cliente *</label>
                  <input
                    type='text'
                    required
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Teléfono</label>
                  <input
                    type='text'
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  />
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Dirección de Entrega</label>
                  <input
                    type='text'
                    value={formData.delivery_address}
                    onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  />
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Modalidad de Entrega *</label>
                  <select
                    value={formData.delivery_method}
                    onChange={(e) => setFormData({ ...formData, delivery_method: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  >
                    {Object.entries(deliveryMethodLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Fecha del Encargo *</label>
                  <input
                    type='date'
                    required
                    value={formData.order_date}
                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  />
                </div>
              </div>

              {formData.delivery_method === 'delivery' && (
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Costo de Delivery (C$)</label>
                    <input
                      type='number'
                      step='0.01'
                      min='0'
                      value={formData.delivery_fee}
                      onChange={(e) => setFormData({ ...formData, delivery_fee: parseFloat(e.target.value) || 0 })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                      placeholder='0.00'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Persona que Recibe</label>
                    <input
                      type='text'
                      value={formData.recipient_name}
                      onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                      placeholder='Si es diferente al cliente'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Teléfono de quien Recibe</label>
                    <input
                      type='text'
                      value={formData.recipient_phone}
                      onChange={(e) => setFormData({ ...formData, recipient_phone: e.target.value })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                      placeholder='Si es diferente al cliente'
                    />
                  </div>
                </div>
              )}

              {/* Order Details */}
              <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Estado</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  >
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Prioridad</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  >
                    {Object.entries(priorityLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Estado de Pago</label>
                  <select
                    value={formData.payment_status}
                    onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  >
                    {Object.entries(paymentStatusLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Fecha Estimada de Entrega</label>
                  <input
                    type='date'
                    value={formData.estimated_delivery_date}
                    onChange={(e) => setFormData({ ...formData, estimated_delivery_date: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  />
                </div>
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>Notas</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                  placeholder='Notas adicionales sobre el pedido...'
                />
              </div>

              <label className='flex items-center gap-3 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={formData.is_gift}
                  onChange={(e) => setFormData({ ...formData, is_gift: e.target.checked })}
                  className='w-5 h-5 rounded border-gray-300 text-pink-500 focus:ring-pink-500'
                />
                <span className='text-sm font-medium text-gray-700'>🎁 Es un regalo</span>
              </label>

              {/* Products Section */}
              <div className='border-t pt-6'>
                <div className='flex justify-between items-center mb-4'>
                  <h3 className='text-lg font-semibold text-gray-800'>Productos del Pedido</h3>
                  <button
                    type='button'
                    onClick={addItem}
                    className='px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors'
                  >
                    + Agregar Producto
                  </button>
                </div>

                <div className='space-y-4'>
                  {formData.items.map((item, index) => (
                    <div key={index} className='bg-gray-50 p-4 rounded-xl border border-gray-200'>
                      <div className='flex justify-between items-start mb-4'>
                        <label className='flex items-center gap-2'>
                          <input
                            type='checkbox'
                            checked={item.is_custom}
                            onChange={(e) => updateItem(index, 'is_custom', e.target.checked)}
                            className='w-4 h-4'
                          />
                          <span className='text-sm font-medium text-gray-700'>Producto Personalizado</span>
                        </label>
                        <button
                          type='button'
                          onClick={() => removeItem(index)}
                          className='text-red-500 hover:text-red-700 font-semibold'
                        >
                          Eliminar
                        </button>
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {!item.is_custom ? (
                          <div className='md:col-span-2'>
                            <label className='block text-sm font-medium text-gray-700 mb-2'>Producto del Catálogo</label>
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
                                        className='w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white'
                                        placeholder='Busca un producto por nombre...'
                                        role='combobox'
                                        aria-expanded={item.product_open ? 'true' : 'false'}
                                        aria-controls={`product-list-${index}`}
                                      />
                                      <div className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'>
                                        🔎
                                      </div>
                                    </div>

                                    {item.product_id && (
                                      <div className='mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200'>
                                        Seleccionado: {item.product_name} · C$ {parseFloat(item.unit_price).toFixed(2)}
                                      </div>
                                    )}

                                    {item.product_open && (
                                      <div
                                        id={`product-list-${index}`}
                                        role='listbox'
                                        className='absolute z-10 mt-2 w-full max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl'
                                        onMouseDown={(e) => e.preventDefault()}
                                      >
                                        {visible.length === 0 ? (
                                          <div className='px-4 py-3 text-sm text-gray-500'>No hay resultados.</div>
                                        ) : (
                                          visible.map((p, i) => (
                                            <button
                                              key={p.id}
                                              type='button'
                                              role='option'
                                              aria-selected={item.product_id === p.id}
                                              onClick={() => selectProduct(index, p)}
                                              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 ${
                                                i === activeIndex ? 'bg-blue-50' : 'bg-white'
                                              } hover:bg-blue-50 transition-colors`}
                                            >
                                              <div className='truncate font-medium text-gray-800'>
                                                {highlightMatch(p.name, item.product_query || '')}
                                              </div>
                                              <div className='text-sm text-gray-500'>C$ {parseFloat(p.price).toFixed(2)}</div>
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
                              <label className='block text-sm font-medium text-gray-700 mb-2'>Nombre del Producto</label>
                              <input
                                type='text'
                                value={item.product_name}
                                onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                                className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                                placeholder='Ej: Piñata personalizada'
                              />
                            </div>
                            <div>
                              <label className='block text-sm font-medium text-gray-700 mb-2'>Descripción</label>
                              <input
                                type='text'
                                value={item.product_description}
                                onChange={(e) => updateItem(index, 'product_description', e.target.value)}
                                className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                                placeholder='Detalles del producto'
                              />
                            </div>
                          </>
                        )}

                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-2'>Cantidad</label>
                          <input
                            type='number'
                            min='1'
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                          />
                        </div>

                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-2'>Precio Unitario (C$)</label>
                          <input
                            type='number'
                            step='0.01'
                            min='0'
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                          />
                        </div>

                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-2'>Horas Necesarias</label>
                          <input
                            type='number'
                            min='0'
                            value={item.hours_needed}
                            onChange={(e) => updateItem(index, 'hours_needed', parseInt(e.target.value) || 0)}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                          />
                        </div>

                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-2'>Cargo por Urgencia (C$)</label>
                          <input
                            type='number'
                            step='0.01'
                            min='0'
                            value={item.rush_fee}
                            onChange={(e) => updateItem(index, 'rush_fee', parseFloat(e.target.value) || 0)}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                          />
                        </div>
                      </div>

                      <div className='mt-3 text-right'>
                        <span className='text-sm font-semibold text-gray-700'>
                          Subtotal: C$ {((item.quantity * item.unit_price) + (item.rush_fee || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {formData.items.length === 0 && (
                    <div className='text-center py-8 text-gray-500'>
                      No hay productos agregados. Haz clic en "Agregar Producto" para comenzar.
                    </div>
                  )}
                </div>

                <div className='mt-6 text-right bg-gradient-to-r from-[#51c879]/10 to-[#50bfe6]/10 p-4 rounded-xl'>
                  <p className='text-xl text-gray-700'>
                    Productos: C$ {calculateTotal().toFixed(2)}
                  </p>
                  {formData.delivery_method === 'delivery' && formData.delivery_fee > 0 && (
                    <p className='text-sm text-gray-500 mt-1'>
                      Delivery: C$ {parseFloat(formData.delivery_fee).toFixed(2)}
                    </p>
                  )}
                  <p className='text-3xl font-bold text-gray-900 mt-1'>
                    Total: C$ {(calculateTotal() + (formData.delivery_method === 'delivery' ? (parseFloat(formData.delivery_fee) || 0) : 0)).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Submit Buttons */}
              </div>
              <div className='flex gap-4 p-6 border-t bg-white rounded-b-2xl'>
                <button
                  type='button'
                  onClick={resetForm}
                  className='flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  disabled={loading || formData.items.length === 0}
                  className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] disabled:opacity-50 transition-all shadow-lg'
                >
                  {loading ? 'Guardando...' : (editingOrder ? 'Actualizar Pedido' : 'Crear Pedido')}
                </button>
              </div>
            </form>
          </div>
          </div>
        )}

        {/* Calculator Modal */}
        {calcOrder && (
          <OrderCalculator orders={calcOrder} onClose={() => setCalcOrder(null)} />
        )}
      </div>
    </div>
  )
}
