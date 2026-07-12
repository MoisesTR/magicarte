import { useEffect, useMemo, useState } from 'react'
import AdminLogin from '../../components/AdminLogin'
import QuickEngravingForm from '../../components/QuickEngravingForm'
import { supabase } from '../../config/supabaseClient'
import { useBusiness } from '../../context/BusinessContext'
import { fetchOrdersForBusiness, deleteOrder } from '../../data/orders'
import { fetchPartnerConfig } from '../../data/businesses'
import toast from 'react-hot-toast'

const money = (v) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(v || 0))

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: 'short' }) : '—'

/** Your take / partner's take for one engraving order, from the snapshot fields. */
function splitOf(o) {
  const total = Number(o.total_amount || 0)
  const mat = Number(o.material_cost || 0)
  const pct = Number(o.partner_split_pct || 0) / 100
  const profit = total - mat
  const partner = profit * pct + (o.material_paid_by === 'partner' ? mat : 0)
  const mine = profit * (1 - pct) + (o.material_paid_by === 'us' ? mat : 0)
  return { mine, partner }
}

const monthKey = (d) => (d || '').slice(0, 7) // 'YYYY-MM'

const currentMonthKey = () => new Date().toISOString().slice(0, 7)

/** Shift a 'YYYY-MM' key by N months. */
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key) {
  if (key === 'all') return 'Todos'
  const [y, m] = key.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('es-NI', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Joyería Trigueros — engraving job log. Deliberately lean (no gift/delivery/
 * recipient machinery): a job is a date, what was engraved, the total, and how
 * that total splits with dad. Registering one goes through QuickEngravingForm.
 */
export default function JoyeriaOrders() {
  const { currentBusinessId, currentBusiness } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [partnerConfig, setPartnerConfig] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser)
      setCheckingAuth(false)
    })
  }, [])

  // Fetch only once we know the user AND the real business id; refetch on switch.
  useEffect(() => {
    if (user && currentBusinessId) fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, user])

  useEffect(() => {
    if (currentBusinessId)
      fetchPartnerConfig(currentBusinessId).then(({ data }) => setPartnerConfig(data))
  }, [currentBusinessId])

  const fetchOrders = async () => {
    setLoading(true)
    const { data, error } = await fetchOrdersForBusiness(currentBusinessId)
    if (error) toast.error('Error al cargar: ' + error.message)
    else setOrders(data || [])
    setLoading(false)
  }

  const handleDelete = async (id) => {
    const { error } = await deleteOrder(id)
    if (error) toast.error('Error al eliminar: ' + error.message)
    else {
      toast.success('Grabado eliminado')
      setConfirmDeleteId(null)
      fetchOrders()
    }
  }

  const partnerShort = (partnerConfig?.partner_name || 'Papá').split(' ')[0] || 'Papá'

  // Orders in the selected month ('all' = every order).
  const visibleOrders = useMemo(() => {
    if (selectedMonth === 'all') return orders
    return orders.filter((o) => monthKey(o.order_date) === selectedMonth)
  }, [orders, selectedMonth])

  // Totals for the selected month/range (collected + what each partner is owed).
  const summary = useMemo(
    () =>
      visibleOrders.reduce(
        (acc, o) => {
          const { mine, partner } = splitOf(o)
          acc.total += Number(o.total_amount || 0)
          acc.mine += mine
          acc.partner += partner
          acc.count += 1
          return acc
        },
        { total: 0, mine: 0, partner: 0, count: 0 },
      ),
    [visibleOrders],
  )

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#B08A3C] mx-auto mb-4'></div>
          <p className='text-gray-600'>Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  if (!user) return <AdminLogin onLogin={(userData) => setUser(userData)} />

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='max-w-4xl mx-auto px-4'>
        {/* header */}
        <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold text-gray-800'>Grabados</h1>
            <p className='text-xs text-gray-400 mt-0.5'>
              {orders.length} registro{orders.length !== 1 ? 's' : ''} · {currentBusiness?.name}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingOrder(null)
              setShowForm(true)
            }}
            className='rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90'
            style={{ backgroundColor: '#B08A3C' }}
          >
            + Registrar grabado
          </button>
        </div>

        {/* month filter */}
        <div className='bg-white rounded-2xl shadow-soft p-3 mb-5 flex items-center justify-between gap-2'>
          <button
            onClick={() => setSelectedMonth((m) => shiftMonth(m === 'all' ? currentMonthKey() : m, -1))}
            className='rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
            title='Mes anterior'
          >
            <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
            </svg>
          </button>
          <span className='text-sm font-semibold text-gray-700'>{monthLabel(selectedMonth)}</span>
          <div className='flex items-center gap-1'>
            <button
              onClick={() => setSelectedMonth((m) => shiftMonth(m === 'all' ? currentMonthKey() : m, 1))}
              className='rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              title='Mes siguiente'
            >
              <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
              </svg>
            </button>
            <button
              onClick={() => setSelectedMonth(selectedMonth === 'all' ? currentMonthKey() : 'all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                selectedMonth === 'all' ? 'bg-[#B08A3C] text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              Todos
            </button>
          </div>
        </div>

        {/* summary for the selected month/range */}
        <div className='grid grid-cols-3 gap-3 mb-5'>
          <SummaryCard label={monthLabel(selectedMonth)} value={money(summary.total)} hint={`${summary.count} grabado${summary.count !== 1 ? 's' : ''}`} />
          <SummaryCard label='Tu parte' value={money(summary.mine)} tone='text-green-700' />
          <SummaryCard label={`Parte de ${partnerShort}`} value={money(summary.partner)} tone='text-amber-700' />
        </div>

        {/* list */}
        <div className='bg-white rounded-2xl shadow-soft overflow-hidden'>
          {loading ? (
            <div className='p-10 text-center text-gray-400 text-sm'>Cargando...</div>
          ) : visibleOrders.length === 0 ? (
            <div className='p-10 text-center text-gray-400 text-sm'>
              {orders.length === 0
                ? 'Aún no hay grabados. Registra el primero con el botón de arriba.'
                : 'Sin grabados en este mes.'}
            </div>
          ) : (
            <ul className='divide-y divide-gray-100'>
              {visibleOrders.map((o) => {
                const item = o.order_items?.[0]
                const { mine, partner } = splitOf(o)
                return (
                  <li key={o.id} className='flex items-center gap-3 px-4 py-3 text-sm'>
                    <div className='w-12 shrink-0 text-center'>
                      <p className='text-[11px] font-semibold uppercase text-gray-400'>{fmtDate(o.order_date)}</p>
                    </div>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate font-semibold text-gray-800'>{o.customer_name || 'Grabado'}</p>
                      <p className='truncate text-xs text-gray-400'>
                        {item?.product_description && `${item.product_description} · `}
                        {item?.material || '—'}
                        {item?.engraving_minutes != null && ` · ${item.engraving_minutes} min`}
                      </p>
                    </div>
                    <div className='shrink-0 text-right'>
                      <p className='font-bold text-gray-800'>{money(o.total_amount)}</p>
                      <p className='text-[11px] text-gray-400'>
                        <span className='text-green-700'>{money(mine)}</span>
                        {' / '}
                        <span className='text-amber-700'>{money(partner)}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingOrder(o)
                        setShowForm(true)
                      }}
                      className='shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-gray-50 hover:text-gray-600'
                      title='Editar'
                    >
                      <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' />
                      </svg>
                    </button>
                    {confirmDeleteId === o.id ? (
                      <div className='flex shrink-0 items-center gap-1'>
                        <button onClick={() => handleDelete(o.id)} className='rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100'>
                          Sí
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className='rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-50'>
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(o.id)}
                        className='shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-gray-50 hover:text-red-500'
                        title='Eliminar'
                      >
                        <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                        </svg>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {showForm && (
        <QuickEngravingForm
          businessId={currentBusinessId}
          partnerName={partnerConfig?.partner_name || 'Papá'}
          partnerSplitPct={partnerConfig?.partner_split_pct ?? 50}
          editingOrder={editingOrder}
          onClose={() => {
            setShowForm(false)
            setEditingOrder(null)
          }}
          onSaved={fetchOrders}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, hint, tone = 'text-gray-800' }) {
  return (
    <div className='bg-white rounded-2xl shadow-soft p-4'>
      <p className='text-[11px] font-semibold uppercase tracking-wide text-gray-400'>{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
      {hint && <p className='text-[11px] text-gray-400'>{hint}</p>}
    </div>
  )
}
