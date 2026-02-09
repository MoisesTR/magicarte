import { useState, useEffect } from 'react'
import { supabase } from '../config/supabaseClient'
import { useNavigate } from 'react-router-dom'
import AdminLogin from '../components/AdminLogin'
import { TABLE } from '../utils/constants'
import OrderCalculator from '../components/OrderCalculator'

export default function Orders() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [products, setProducts] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [calcOrder, setCalcOrder] = useState(null)
  const [selectedOrders, setSelectedOrders] = useState(new Set())

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
      alert('Error al cargar pedidos: ' + error.message)
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
    
    if (field === 'product_id' && value) {
      const product = products.find(p => p.id === value)
      if (product) {
        newItems[index].product_name = product.name
        newItems[index].unit_price = product.price
      }
    }
    
    setFormData({ ...formData, items: newItems })
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

      alert(editingOrder ? 'Pedido actualizado!' : 'Pedido creado!')
      resetForm()
      fetchOrders()
    } catch (error) {
      alert('Error: ' + error.message)
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
      items: order.order_items.map(item => ({
        product_id: item.product_id,
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
      alert('Error al eliminar')
    } else {
      alert('Pedido eliminado')
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
      alert('Error al actualizar estado')
    } else {
      fetchOrders()
    }
  }

  const updatePaymentStatus = async (id, payment_status) => {
    const { error } = await supabase
      .from(TABLE.ORDERS)
      .update({ payment_status })
      .eq('id', id)

    if (error) {
      alert('Error al actualizar estado de pago')
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
      alert('Este pedido no tiene número de teléfono registrado')
      return
    }

    // Clean phone number (remove spaces, dashes, etc.)
    phone = phone.replace(/\D/g, '')
    
    // Generate simple message without special characters
    const message = `Hola ${order.customer_name}!

Te escribo sobre tu pedido.

Detalles del pedido:
${order.order_items.map(item => `- ${item.product_name}, cantidad: ${item.quantity}`).join('\n')}

Total: C$ ${parseFloat(order.total_amount).toFixed(2)}
${order.estimated_delivery_date ? `Fecha estimada de entrega: ${new Date(order.estimated_delivery_date).toLocaleDateString()}` : ''}`

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

  const filteredOrders = orders.filter(order => {
    if (filterStatus !== 'all' && order.status !== filterStatus) return false
    if (filterPriority !== 'all' && order.priority !== filterPriority) return false
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

  const totalRevenue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + parseFloat(o.total_amount), 0)

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    in_progress: orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: totalRevenue
  }

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
          <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
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
          </div>
        </div>

        {!showForm ? (
          <>
            {/* Filters and Actions */}
            <div className='bg-white rounded-2xl shadow-lg p-6 mb-6'>
              <div className='flex flex-wrap gap-4'>
                <button
                  onClick={() => setShowForm(true)}
                  className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all shadow-lg'
                >
                  + Nuevo Pedido
                </button>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className='px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                >
                  <option value='all'>Todos los estados</option>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className='px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                >
                  <option value='all'>Todas las prioridades</option>
                  {Object.entries(priorityLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className='px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 bg-blue-50'
                >
                  <option value='created_at'>Ordenar: Más recientes</option>
                  <option value='order_date'>Ordenar: Fecha de encargo</option>
                  <option value='priority'>Ordenar: Prioridad</option>
                  <option value='delivery_date'>Ordenar: Fecha de entrega</option>
                </select>
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
                      onClick={() => setSelectedOrders(new Set())}
                      className='text-sm text-gray-500 hover:text-gray-700 underline'
                    >
                      Limpiar selección
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Orders List */}
            {loading ? (
              <div className='text-center py-12'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879] mx-auto mb-4'></div>
                <p className='text-gray-600'>Cargando pedidos...</p>
              </div>
            ) : (
              <div className='space-y-4'>
                {filteredOrders.map((order) => (
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
                        </div>
                        
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-600'>
                          <p><strong>Cliente:</strong> {order.customer_name}</p>
                          {order.customer_phone && <p><strong>Teléfono:</strong> {order.customer_phone}</p>}
                          {order.customer_social_media && <p><strong>Redes:</strong> {order.customer_social_media}</p>}
                          {order.delivery_address && <p><strong>Dirección:</strong> {order.delivery_address}</p>}
                          <p><strong>Modalidad:</strong> {deliveryMethodLabels[order.delivery_method] || 'Entrega a Domicilio'}</p>
                          {order.order_date && <p><strong>Fecha del Encargo:</strong> {new Date(order.order_date).toLocaleDateString()}</p>}
                        </div>
                      </div>
                      
                      <div className='text-right ml-4'>
                        <p className='text-3xl font-bold text-[#51c879]'>C$ {parseFloat(order.total_amount).toFixed(2)}</p>
                        <p className='text-sm text-gray-500 mt-1'>{new Date(order.created_at).toLocaleDateString()}</p>
                        {order.estimated_delivery_date && (
                          <p className='text-sm text-gray-600 mt-1'>
                            📅 Entrega: {new Date(order.estimated_delivery_date).toLocaleDateString()}
                          </p>
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
                        onClick={() => deleteOrder(order.id)}
                        className='px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors'
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                ))}

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
          <div className='bg-white rounded-2xl shadow-lg p-6'>
            <div className='flex justify-between items-center mb-6'>
              <h2 className='text-2xl font-bold text-gray-800'>
                {editingOrder ? 'Editar Pedido' : 'Nuevo Pedido'}
              </h2>
              <button
                onClick={resetForm}
                className='text-gray-500 hover:text-gray-700 text-3xl'
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className='space-y-6'>
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
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Redes Sociales</label>
                  <input
                    type='text'
                    value={formData.customer_social_media}
                    onChange={(e) => setFormData({ ...formData, customer_social_media: e.target.value })}
                    className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500'
                    placeholder='@usuario o enlace'
                  />
                </div>
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
                            <select
                              value={item.product_id || ''}
                              onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                              className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                            >
                              <option value=''>Seleccionar producto</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} - C$ {p.price}</option>
                              ))}
                            </select>
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
                  <p className='text-3xl font-bold text-gray-900'>
                    Total: C$ {calculateTotal().toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className='flex gap-4 pt-6 border-t'>
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
        )}

        {/* Calculator Modal */}
        {calcOrder && (
          <OrderCalculator orders={calcOrder} onClose={() => setCalcOrder(null)} />
        )}
      </div>
    </div>
  )
}
