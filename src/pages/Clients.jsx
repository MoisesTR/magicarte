import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLogin from '../components/AdminLogin'
import { supabase } from '../config/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import {
  fetchClientsForBusiness,
  fetchLinkedOrdersForBusiness,
  createClient,
  updateClient,
  deleteClient as deleteClientRow,
} from '../data/clients'
import toast from 'react-hot-toast'

const initialFormData = {
  name: '',
  phone: '',
  social_media: '',
  delivery_address: '',
  notes: '',
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, '')
  const phone = digits.startsWith('505') && digits.length > 8 ? digits.slice(3) : digits
  return phone.slice(0, 8)
}

function formatCurrency(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value || 0))
}

export default function Clients() {
  const navigate = useNavigate()
  const { currentBusinessId, currentBusiness } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [clients, setClients] = useState([])
  const [linkedOrders, setLinkedOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [rankingFilter, setRankingFilter] = useState('all')
  const [formData, setFormData] = useState(initialFormData)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      setUser(authUser)
      setCheckingAuth(false)
    }

    checkUser()
  }, [])

  // Fetch only once we know the user AND the real business id; refetch on switch.
  useEffect(() => {
    if (user && currentBusinessId) fetchClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, user])

  const fetchClients = async () => {
    setLoading(true)
    try {
      const [clientsResult, ordersResult] = await Promise.all([
        fetchClientsForBusiness(currentBusinessId),
        fetchLinkedOrdersForBusiness(currentBusinessId),
      ])

      if (clientsResult.error) throw clientsResult.error
      if (ordersResult.error) throw ordersResult.error
      setClients(clientsResult.data || [])
      setLinkedOrders(ordersResult.data || [])
    } catch (error) {
      toast.error('Error al cargar clientes: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return clients

    return clients.filter((client) =>
      client.name?.toLowerCase().includes(query) ||
      client.phone?.toLowerCase().includes(query) ||
      client.social_media?.toLowerCase().includes(query) ||
      client.delivery_address?.toLowerCase().includes(query)
    )
  }, [clients, searchQuery])

  const topClients = useMemo(() => {
    const ordersForRanking = linkedOrders.filter((order) =>
      !order.is_gift && (rankingFilter === 'completed'
        ? order.status === 'completed'
        : !['backlog', 'canceled'].includes(order.status))
    )
    const statsByClient = new Map()

    ordersForRanking.forEach((order) => {
      if (!order.client_id) return
      const current = statsByClient.get(order.client_id) || {
        totalSpent: 0,
        orderCount: 0,
        lastOrder: null,
      }

      const orderTotal = Number(order.total_amount || 0) + Number(order.delivery_fee || 0)
      current.totalSpent += orderTotal
      current.orderCount += 1

      const currentDate = order.order_date || order.created_at
      const lastDate = current.lastOrder?.order_date || current.lastOrder?.created_at
      if (!current.lastOrder || new Date(currentDate) > new Date(lastDate)) {
        current.lastOrder = order
      }

      statsByClient.set(order.client_id, current)
    })

    return clients
      .map((client) => ({
        ...client,
        stats: statsByClient.get(client.id) || {
          totalSpent: 0,
          orderCount: 0,
          lastOrder: null,
        },
      }))
      .filter((client) => client.stats.orderCount > 0)
      .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent)
      .slice(0, 10)
  }, [clients, linkedOrders, rankingFilter])

  const resetForm = () => {
    setFormData(initialFormData)
    setEditingClient(null)
    setShowForm(false)
  }

  const editClient = (client) => {
    setEditingClient(client)
    setFormData({
      name: client.name || '',
      phone: client.phone || '',
      social_media: client.social_media || '',
      delivery_address: client.delivery_address || '',
      notes: client.notes || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)

    const clientData = {
      name: formData.name.trim(),
      phone: formData.phone || null,
      social_media: formData.social_media.trim() || null,
      delivery_address: formData.delivery_address.trim() || null,
      notes: formData.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editingClient) {
        const { error } = await updateClient(editingClient.id, clientData)
        if (error) throw error
      } else {
        const { error } = await createClient(clientData, currentBusinessId)
        if (error) throw error
      }

      toast.success(editingClient ? 'Cliente actualizado' : 'Cliente creado')
      resetForm()
      fetchClients()
    } catch (error) {
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteClient = async (id) => {
    const { error } = await deleteClientRow(id)

    if (error) {
      toast.error('Error al eliminar cliente')
      return
    }

    toast.success('Cliente eliminado')
    setConfirmDeleteId(null)
    fetchClients()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    navigate('/admin')
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
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='max-w-6xl mx-auto px-4'>
        <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-5'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3'>
            <div>
              <h1 className='text-xl font-bold text-gray-800'>Clientes</h1>
              <p className='text-xs text-gray-400 mt-0.5'>{clients.length} cliente{clients.length !== 1 ? 's' : ''} guardado{clients.length !== 1 ? 's' : ''}</p>
            </div>
            <div className='flex flex-wrap gap-2'>
	              <button
	                onClick={() => {
                  setEditingClient(null)
                  setFormData(initialFormData)
                  setShowForm(true)
                }}
                className='px-4 py-2 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity'
              >
                + Nuevo Cliente
              </button>
              <button
                onClick={handleLogout}
                className='px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors'
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-2xl shadow-soft p-4 mb-5'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
            <div>
              <h2 className='text-base font-bold text-gray-800'>🏆 Top clientes</h2>
	              <p className='text-xs text-gray-400 mt-0.5'>Ranking por monto comprado en pedidos vinculados, sin contar regalos.</p>
            </div>
            <div className='inline-flex rounded-xl bg-gray-100 p-1'>
              <button
                onClick={() => setRankingFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  rankingFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setRankingFilter('completed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  rankingFilter === 'completed'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Completados
              </button>
            </div>
          </div>

          {topClients.length === 0 ? (
            <div className='py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-xl'>
              No hay pedidos vinculados para calcular el ranking.
            </div>
          ) : (
            <div className='space-y-4'>
              <div className='grid grid-cols-1 lg:grid-cols-3 gap-3 items-end'>
                {topClients.slice(0, 3).map((client, index) => {
                  const styles = [
                    {
                      medal: '🏆',
                      label: 'Cliente #1',
                      wrapper: 'lg:order-2 min-h-44 bg-gradient-to-br from-amber-50 to-yellow-100 border-amber-200',
                      amount: 'text-amber-700',
                      ring: 'bg-amber-500',
                    },
                    {
                      medal: '🥈',
                      label: 'Cliente #2',
                      wrapper: 'lg:order-1 min-h-36 bg-gradient-to-br from-slate-50 to-gray-100 border-gray-200',
                      amount: 'text-gray-700',
                      ring: 'bg-gray-400',
                    },
                    {
                      medal: '🥉',
                      label: 'Cliente #3',
                      wrapper: 'lg:order-3 min-h-32 bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200',
                      amount: 'text-orange-700',
                      ring: 'bg-orange-500',
                    },
                  ][index]

	                  return (
	                    <article
	                      key={client.id}
	                      className={`relative text-left rounded-2xl border p-4 ${styles.wrapper}`}
	                    >
                      <div className={`absolute -top-3 left-4 w-9 h-9 rounded-full ${styles.ring} text-white flex items-center justify-center text-lg shadow-sm`}>
                        {styles.medal}
                      </div>
                      <div className='pt-5'>
                        <p className='text-xs font-bold uppercase tracking-wide text-gray-500'>{styles.label}</p>
                        <h3 className='mt-1 text-lg font-bold text-gray-900 leading-tight'>{client.name}</h3>
                        <p className={`mt-3 text-2xl font-bold ${styles.amount}`}>{formatCurrency(client.stats.totalSpent)}</p>
                        <div className='mt-3 flex flex-wrap gap-2 text-xs font-semibold text-gray-600'>
                          <span className='px-2 py-1 rounded-lg bg-white/70'>{client.stats.orderCount} pedido{client.stats.orderCount !== 1 ? 's' : ''}</span>
                          <span className='px-2 py-1 rounded-lg bg-white/70'>
                            {client.stats.lastOrder
                              ? new Date((client.stats.lastOrder.order_date || client.stats.lastOrder.created_at) + (client.stats.lastOrder.order_date ? 'T00:00:00' : '')).toLocaleDateString('es-NI')
                              : 'Sin fecha'}
                          </span>
                        </div>
                      </div>
	                    </article>
	                  )
	                })}
              </div>

              {topClients.length > 3 && (
                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'>
	                  {topClients.slice(3).map((client, index) => (
	                    <article
	                      key={client.id}
	                      className='flex items-center justify-between gap-3 text-left rounded-xl border border-gray-100 bg-gray-50 p-3'
	                    >
                      <div className='min-w-0'>
                        <p className='text-xs font-bold text-gray-400'>#{index + 4}</p>
                        <p className='text-sm font-bold text-gray-900 truncate'>{client.name}</p>
                        <p className='text-xs text-gray-500'>{client.stats.orderCount} pedido{client.stats.orderCount !== 1 ? 's' : ''}</p>
                      </div>
                      <p className='text-sm font-bold text-[#51c879] whitespace-nowrap'>{formatCurrency(client.stats.totalSpent)}</p>
	                    </article>
	                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className='bg-white rounded-2xl shadow-soft p-4 mb-5'>
          <input
            type='search'
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className='w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
            placeholder='Buscar por nombre, teléfono, red social o dirección...'
          />
        </div>

        {loading && !showForm ? (
          <div className='py-16 text-center text-gray-500'>Cargando clientes...</div>
        ) : filteredClients.length === 0 ? (
          <div className='bg-white rounded-2xl shadow-soft p-12 text-center'>
            <div className='text-5xl mb-3'>👥</div>
            <p className='text-lg font-semibold text-gray-700'>No hay clientes que mostrar</p>
            <p className='text-sm text-gray-400 mt-1'>Agrega tus clientes frecuentes para reutilizar sus datos en pedidos.</p>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
            {filteredClients.map((client) => (
              <article key={client.id} className='bg-white rounded-2xl shadow-soft p-4 border border-gray-100'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <h2 className='text-lg font-bold text-gray-900 leading-snug'>{client.name}</h2>
                    {client.phone && <p className='text-sm text-gray-600 mt-1'>{client.phone}</p>}
	                  </div>
	                  <div className='flex gap-1'>
	                    <button
	                      onClick={() => editClient(client)}
                      className='p-2 text-gray-500 hover:text-[#51c879] hover:bg-green-50 rounded-lg transition-colors'
                      title='Editar cliente'
                    >
                      <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' />
                      </svg>
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(client.id)}
                      className='p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors'
                      title='Eliminar cliente'
                    >
                      <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className='mt-4 space-y-2 text-sm text-gray-600'>
                  {client.social_media && <p><strong>Red social:</strong> {client.social_media}</p>}
                  {client.delivery_address && <p><strong>Dirección:</strong> {client.delivery_address}</p>}
                  {client.notes && <p className='text-gray-500 whitespace-pre-wrap'><strong>Notas:</strong> {client.notes}</p>}
                </div>

                <div className='mt-4 flex items-center justify-between'>
                  <p className='text-xs text-gray-400'>
                    Actualizado: {new Date(client.updated_at || client.created_at).toLocaleDateString('es-NI')}
                  </p>
                  <button
                    onClick={() => navigate(`/admin/${currentBusiness.slug}/orders`, { state: { clientId: client.id, clientName: client.name } })}
                    className='text-xs font-semibold text-[#51c879] hover:text-[#45b56a] px-2 py-1 rounded-lg hover:bg-green-50 transition-colors'
                  >
                    Ver pedidos →
                  </button>
                </div>
	              </article>
            ))}
          </div>
        )}

        {showForm && (
          <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'>
            <div className='bg-white rounded-2xl shadow-xl w-full max-w-xl'>
              <div className='flex items-center justify-between p-5 border-b border-gray-100'>
                <h2 className='text-lg font-bold text-gray-900'>
                  {editingClient ? 'Editar cliente' : 'Nuevo cliente'}
                </h2>
                <button onClick={resetForm} className='text-gray-400 hover:text-gray-600'>
                  <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className='p-5 space-y-4'>
                <div>
                  <label className='block text-xs font-medium text-gray-600 mb-1.5'>Nombre *</label>
                  <input
                    type='text'
                    required
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                  />
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                  <div>
                    <label className='block text-xs font-medium text-gray-600 mb-1.5'>Teléfono</label>
                    <input
                      type='text'
                      value={formData.phone}
                      onChange={(event) => setFormData({ ...formData, phone: normalizePhone(event.target.value) })}
                      className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                      placeholder='88881234'
                    />
                  </div>
                  <div>
                    <label className='block text-xs font-medium text-gray-600 mb-1.5'>Red social</label>
                    <input
                      type='text'
                      value={formData.social_media}
                      onChange={(event) => setFormData({ ...formData, social_media: event.target.value })}
                      className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                      placeholder='Facebook, Instagram...'
                    />
                  </div>
                </div>

                <div>
                  <label className='block text-xs font-medium text-gray-600 mb-1.5'>Dirección</label>
                  <input
                    type='text'
                    value={formData.delivery_address}
                    onChange={(event) => setFormData({ ...formData, delivery_address: event.target.value })}
                    className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
                  />
                </div>

                <div>
                  <label className='block text-xs font-medium text-gray-600 mb-1.5'>Notas</label>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                    className='w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm resize-none'
                    placeholder='Preferencias, referencias, cliente frecuente...'
                  />
                </div>

                <div className='flex gap-3 pt-2'>
                  <button
                    type='button'
                    onClick={resetForm}
                    className='px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold'
                  >
                    Cancelar
                  </button>
                  <button
                    type='submit'
                    disabled={loading}
                    className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all'
                  >
                    {loading ? 'Guardando...' : editingClient ? 'Actualizar' : 'Crear cliente'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirmDeleteId && (
          <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'>
            <div className='bg-white rounded-2xl shadow-xl w-full max-w-sm p-5'>
              <h2 className='text-lg font-bold text-gray-900'>Eliminar cliente</h2>
              <p className='text-sm text-gray-500 mt-2'>Esta acción no elimina pedidos existentes, solo el registro del catálogo de clientes.</p>
              <div className='flex gap-3 mt-5'>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className='flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50'
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deleteClient(confirmDeleteId)}
                  className='flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700'
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
