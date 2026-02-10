import { useState, useEffect } from 'react'
import { supabase } from '../config/supabaseClient'
import { TABLE } from '../utils/constants'
import toast from 'react-hot-toast'

export default function OrdersManager({ isOpen, onClose }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [products, setProducts] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_social_media: '',
    delivery_address: '',
    status: 'pending',
    priority: 'normal',
    notes: '',
    estimated_delivery_date: '',
    items: []
  })

  useEffect(() => {
    if (isOpen) {
      fetchOrders()
      fetchProducts()
    }
  }, [isOpen])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(TABLE.ORDERS)
        .select(`
          *,
          order_items (
            *,
            products (name, image_url)
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
        status: formData.status,
        priority: formData.priority,
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
      status: 'pending',
      priority: 'normal',
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
      status: order.status,
      priority: order.priority,
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

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      canceled: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityColor = (priority) => {
    const colors = {
      normal: 'bg-gray-100 text-gray-800',
      urgent: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    }
    return colors[priority] || 'bg-gray-100 text-gray-800'
  }

  const statusLabels = {
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    in_progress: 'En Proceso',
    completed: 'Completado',
    canceled: 'Cancelado'
  }

  const priorityLabels = {
    normal: 'Normal',
    urgent: 'Urgente',
    critical: 'Crítico'
  }

  const filteredOrders = orders.filter(order => {
    if (filterStatus !== 'all' && order.status !== filterStatus) return false
    if (filterPriority !== 'all' && order.priority !== filterPriority) return false
    return true
  })

  const totalRevenue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + parseFloat(o.total_amount), 0)

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col'>
        <div className='p-6 border-b flex justify-between items-center'>
          <div>
            <h2 className='text-2xl font-bold text-gray-800'>Gestión de Pedidos</h2>
            <p className='text-sm text-gray-600 mt-1'>
              Total: {orders.length} pedidos • Ingresos: C$ {totalRevenue.toFixed(2)}
            </p>
          </div>
          <button onClick={onClose} className='text-gray-500 hover:text-gray-700 text-3xl'>×</button>
        </div>

        {!showForm ? (
          <div className='flex-1 overflow-y-auto p-6'>
            <div className='flex flex-wrap gap-4 mb-6'>
              <button
                onClick={() => setShowForm(true)}
                className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all'
              >
                + Nuevo Pedido
              </button>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className='px-4 py-2 border border-gray-300 rounded-xl'
              >
                <option value='all'>Todos los estados</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>

              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className='px-4 py-2 border border-gray-300 rounded-xl'
              >
                <option value='all'>Todas las prioridades</option>
                {Object.entries(priorityLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className='text-center py-12'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879] mx-auto'></div>
              </div>
            ) : (
              <div className='space-y-4'>
                {filteredOrders.map((order) => (
                  <div key={order.id} className='bg-gray-50 rounded-xl p-6 hover:shadow-lg transition-shadow'>
                    <div className='flex justify-between items-start mb-4'>
                      <div>
                        <div className='flex items-center gap-3 mb-2'>
                          <h3 className='text-xl font-bold text-gray-800'>Pedido #{order.order_number}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                            {statusLabels[order.status]}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(order.priority)}`}>
                            {priorityLabels[order.priority]}
                          </span>
                        </div>
                        <p className='text-gray-600'><strong>Cliente:</strong> {order.customer_name}</p>
                        {order.customer_phone && <p className='text-gray-600'><strong>Teléfono:</strong> {order.customer_phone}</p>}
                        {order.customer_social_media && <p className='text-gray-600'><strong>Redes:</strong> {order.customer_social_media}</p>}
                        {order.delivery_address && <p className='text-gray-600'><strong>Dirección:</strong> {order.delivery_address}</p>}
                      </div>
                      <div className='text-right'>
                        <p className='text-2xl font-bold text-[#51c879]'>C$ {parseFloat(order.total_amount).toFixed(2)}</p>
                        <p className='text-sm text-gray-500'>{new Date(order.created_at).toLocaleDateString()}</p>
                        {order.estimated_delivery_date && (
                          <p className='text-sm text-gray-600'>Entrega: {new Date(order.estimated_delivery_date).toLocaleDateString()}</p>
                        )}
                      </div>
                    </div>

                    <div className='mb-4'>
                      <p className='text-sm font-semibold text-gray-700 mb-2'>Productos:</p>
                      <div className='space-y-1'>
                        {order.order_items.map((item, idx) => (
                          <div key={idx} className='text-sm text-gray-600 flex justify-between'>
                            <span>• {item.product_name} x{item.quantity}</span>
                            <span>C$ {parseFloat(item.subtotal).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {order.notes && (
                      <p className='text-sm text-gray-600 mb-4'><strong>Notas:</strong> {order.notes}</p>
                    )}

                    <div className='flex flex-wrap gap-2'>
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        className='px-3 py-1 text-sm border border-gray-300 rounded-lg'
                      >
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => editOrder(order)}
                        className='px-4 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600'
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deleteOrder(order.id)}
                        className='px-4 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600'
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}

                {filteredOrders.length === 0 && (
                  <div className='text-center py-12 text-gray-500'>
                    No hay pedidos que mostrar
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className='flex-1 overflow-y-auto p-6'>
            <form onSubmit={handleSubmit} className='space-y-6'>
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

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
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
                />
              </div>

              <div className='border-t pt-6'>
                <div className='flex justify-between items-center mb-4'>
                  <h3 className='text-lg font-semibold text-gray-800'>Productos</h3>
                  <button
                    type='button'
                    onClick={addItem}
                    className='px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600'
                  >
                    + Agregar Producto
                  </button>
                </div>

                <div className='space-y-4'>
                  {formData.items.map((item, index) => (
                    <div key={index} className='bg-gray-50 p-4 rounded-xl'>
                      <div className='flex justify-between items-start mb-4'>
                        <label className='flex items-center gap-2'>
                          <input
                            type='checkbox'
                            checked={item.is_custom}
                            onChange={(e) => updateItem(index, 'is_custom', e.target.checked)}
                          />
                          <span className='text-sm font-medium'>Producto Personalizado</span>
                        </label>
                        <button
                          type='button'
                          onClick={() => removeItem(index)}
                          className='text-red-500 hover:text-red-700'
                        >
                          Eliminar
                        </button>
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {!item.is_custom ? (
                          <div>
                            <label className='block text-sm font-medium text-gray-700 mb-2'>Producto</label>
                            <select
                              value={item.product_id || ''}
                              onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                              className='w-full px-4 py-2 border border-gray-300 rounded-lg'
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
                              <label className='block text-sm font-medium text-gray-700 mb-2'>Nombre</label>
                              <input
                                type='text'
                                value={item.product_name}
                                onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                                className='w-full px-4 py-2 border border-gray-300 rounded-lg'
                              />
                            </div>
                            <div>
                              <label className='block text-sm font-medium text-gray-700 mb-2'>Descripción</label>
                              <input
                                type='text'
                                value={item.product_description}
                                onChange={(e) => updateItem(index, 'product_description', e.target.value)}
                                className='w-full px-4 py-2 border border-gray-300 rounded-lg'
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
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg'
                          />
                        </div>

                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-2'>Precio Unitario (C$)</label>
                          <input
                            type='number'
                            step='0.01'
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg'
                          />
                        </div>

                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-2'>Horas Necesarias</label>
                          <input
                            type='number'
                            min='0'
                            value={item.hours_needed}
                            onChange={(e) => updateItem(index, 'hours_needed', parseInt(e.target.value))}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg'
                          />
                        </div>

                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-2'>Cargo por Urgencia (C$)</label>
                          <input
                            type='number'
                            step='0.01'
                            min='0'
                            value={item.rush_fee}
                            onChange={(e) => updateItem(index, 'rush_fee', parseFloat(e.target.value))}
                            className='w-full px-4 py-2 border border-gray-300 rounded-lg'
                          />
                        </div>
                      </div>

                      <div className='mt-2 text-right'>
                        <span className='text-sm font-semibold text-gray-700'>
                          Subtotal: C$ {((item.quantity * item.unit_price) + (item.rush_fee || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className='mt-6 text-right'>
                  <p className='text-2xl font-bold text-[#51c879]'>
                    Total: C$ {calculateTotal().toFixed(2)}
                  </p>
                </div>
              </div>

              <div className='flex gap-4 pt-6'>
                <button
                  type='button'
                  onClick={resetForm}
                  className='flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  disabled={loading || formData.items.length === 0}
                  className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] disabled:opacity-50'
                >
                  {loading ? 'Guardando...' : (editingOrder ? 'Actualizar Pedido' : 'Crear Pedido')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
