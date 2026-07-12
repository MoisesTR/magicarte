import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLogin from '../components/AdminLogin'
import { supabase } from '../config/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import { fetchPaymentsForBusiness } from '../data/payments'
import { fetchFinanceOrders } from '../data/orders'
import { fetchBusinessEarnings, fetchPartnerSettlements } from '../data/businesses'

const COMMISSION_RATE = 0.0675
const TZ = 'America/Managua'

function nicaraguaMonth(dateStr) {
  // Returns 'YYYY-MM' for a date string or ISO timestamp, in Nicaragua time.
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7)
}

function CombinedFinances({ loading, earnings, settlements }) {
  const totals = earnings.reduce(
    (acc, row) => ({
      collected: acc.collected + Number(row.collected || 0),
      partner: acc.partner + Number(row.partner_share_paid || 0),
      mine: acc.mine + Number(row.net_to_us_paid || 0),
      orders: acc.orders + Number(row.orders_count || 0),
    }),
    { collected: 0, partner: 0, mine: 0, orders: 0 },
  )

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='mx-auto max-w-5xl space-y-5 px-4'>
        <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-5'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-400'>Studio HQ</p>
          <h1 className='mt-1 text-xl font-bold text-gray-800'>Finanzas consolidadas</h1>
          <p className='mt-1 text-sm text-gray-500'>Totales acumulados de los negocios a los que tienes acceso.</p>
        </div>

        {loading ? (
          <div className='flex justify-center py-20'><div className='h-10 w-10 animate-spin rounded-full border-b-2 border-slate-700' /></div>
        ) : (
          <>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-4'>
              <FinanceCard label='Cobrado' value={money(totals.collected)} tone='bg-sky-50 text-sky-900' hint={`${totals.orders} pedido${totals.orders !== 1 ? 's' : ''}`} />
              <FinanceCard label='Parte de socios' value={money(totals.partner)} tone='bg-amber-50 text-amber-900' hint='De pedidos totalmente pagados' />
              <FinanceCard label='Neto para ti' value={money(totals.mine)} tone='bg-emerald-50 text-emerald-900' hint='Después de repartos y reembolsos' />
              <FinanceCard label='Por liquidar' value={money(settlements.reduce((sum, row) => sum + Number(row.partner_owed || 0), 0))} tone='bg-violet-50 text-violet-900' hint='Socios configurados' />
            </div>

            <div className='overflow-hidden rounded-2xl bg-white shadow-soft'>
              <div className='border-b border-gray-100 px-5 py-4'>
                <h2 className='font-bold text-gray-800'>Por negocio</h2>
              </div>
              {earnings.length === 0 ? (
                <p className='px-5 py-10 text-center text-sm text-gray-400'>No hay negocios disponibles para este usuario.</p>
              ) : (
                <div className='divide-y divide-gray-100'>
                  {earnings.map((row) => (
                    <div key={row.business_id} className='grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1.3fr_repeat(3,1fr)] sm:items-center'>
                      <div><p className='font-semibold text-gray-800'>{row.name}</p><p className='text-xs text-gray-400'>{row.orders_count} pedido{Number(row.orders_count) !== 1 ? 's' : ''}</p></div>
                      <Metric label='Cobrado' value={money(row.collected)} />
                      <Metric label='Socio' value={money(row.partner_share_paid)} />
                      <Metric label='Neto para ti' value={money(row.net_to_us_paid)} strong />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {settlements.length > 0 && (
              <div className='rounded-2xl border border-amber-200 bg-amber-50 p-5'>
                <h2 className='font-bold text-amber-950'>Liquidaciones pendientes</h2>
                <div className='mt-3 space-y-3'>
                  {settlements.map((row) => (
                    <div key={row.business_id} className='flex flex-wrap items-center justify-between gap-3 border-t border-amber-200/70 pt-3 text-sm first:border-t-0 first:pt-0'>
                      <div><p className='font-semibold text-amber-950'>{row.name}</p><p className='text-amber-800'>{row.partner_name || 'Socio'} · {row.settled_orders} pagado{Number(row.settled_orders) !== 1 ? 's' : ''}</p></div>
                      <div className='text-right'><p className='text-xs text-amber-700'>Debes liquidar</p><p className='font-bold text-amber-950'>{money(row.partner_owed)}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FinanceCard({ label, value, hint, tone }) {
  return <div className={`rounded-2xl p-4 ${tone}`}><p className='text-xs font-medium opacity-70'>{label}</p><p className='mt-1 text-xl font-bold'>{value}</p><p className='mt-1 text-[11px] opacity-65'>{hint}</p></div>
}

function Metric({ label, value, strong = false }) {
  return <div><p className='text-[11px] text-gray-400 sm:hidden'>{label}</p><p className={strong ? 'font-bold text-emerald-700' : 'font-semibold text-gray-700'}>{value}</p><p className='hidden text-[11px] text-gray-400 sm:block'>{label}</p></div>
}

function currentNicaraguaMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7)
}

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
}

function monthLabelShort(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('es', { month: 'short', year: '2-digit' })
}

function last6Months() {
  const months = []
  const now = new Date(new Date().toLocaleDateString('en-CA', { timeZone: TZ }) + 'T00:00:00')
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function summarise(payments) {
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const paidCard = payments.filter(p => p.method === 'tarjeta').reduce((s, p) => s + Number(p.amount), 0)
  const commission = paidCard * COMMISSION_RATE
  return { paid, paidCard, commission, net: paid - commission }
}

const methodColor = {
  efectivo: 'bg-emerald-100 text-emerald-800',
  transferencia: 'bg-sky-100 text-sky-800',
  tarjeta: 'bg-violet-100 text-violet-800',
}
const methodLabel = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }

const money = (value) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

export default function Finances() {
  const navigate = useNavigate()
  const { currentBusinessId, currentBusiness, isAllBusinesses } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [payments, setPayments] = useState([])
  const [orders, setOrders] = useState([])
  const [earnings, setEarnings] = useState([])
  const [partnerSettlements, setPartnerSettlements] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(currentNicaraguaMonth)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setCheckingAuth(false)
    })
  }, [])

  // Individual-business dashboards use the detailed order/payment queries. The
  // all-business dashboard uses the accounting views, which are RLS-scoped in
  // the final migration so a limited user never sees another business's totals.
  useEffect(() => {
    if (!user) return
    if (isAllBusinesses) fetchCombinedData()
    else if (currentBusinessId) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, isAllBusinesses, user])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [{ data: pays, error: e1 }, { data: ords, error: e2 }] = await Promise.all([
        fetchPaymentsForBusiness(currentBusinessId),
        fetchFinanceOrders(currentBusinessId),
      ])
      if (e1) throw e1
      if (e2) throw e2
      setPayments(pays || [])
      setOrders(ords || [])
      const { data: settlements, error: settlementError } = await fetchPartnerSettlements()
      if (settlementError) throw settlementError
      setPartnerSettlements(settlements || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCombinedData = async () => {
    setLoading(true)
    try {
      const [{ data: earningRows, error: earningsError }, { data: settlementRows, error: settlementsError }] = await Promise.all([
        fetchBusinessEarnings(),
        fetchPartnerSettlements(),
      ])
      if (earningsError) throw earningsError
      if (settlementsError) throw settlementsError
      setEarnings(earningRows || [])
      setPartnerSettlements(settlementRows || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879]' />
      </div>
    )
  }

  if (!user) return <AdminLogin onLogin={setUser} />

  if (isAllBusinesses) {
    return <CombinedFinances loading={loading} earnings={earnings} settlements={partnerSettlements} />
  }

  // ── derived data ──────────────────────────────────────────────

  const monthPayments = payments.filter(p => nicaraguaMonth(p.paid_at) === selectedMonth)
  const monthSummary = summarise(monthPayments)

  // outstanding balance — exclude gifts (nothing to collect from them)
  const pendingOrders = orders.map(o => {
    const paid = (o.order_payments || []).reduce((s, p) => s + Number(p.amount), 0)
    const balance = Math.max(0, Number(o.total_amount || 0) + Number(o.delivery_fee || 0) - paid)
    return { ...o, paid, balance }
  }).filter(o => o.balance > 0.009 && !o.is_gift)
  const totalPending = pendingOrders.reduce((s, o) => s + o.balance, 0)
  const currentSettlement = partnerSettlements.find((settlement) => settlement.business_id === currentBusinessId)

  // method breakdown for selected month
  const byMethod = ['efectivo', 'transferencia', 'tarjeta'].map(m => {
    const amount = monthPayments.filter(p => p.method === m).reduce((s, p) => s + Number(p.amount), 0)
    const pct = monthSummary.paid > 0 ? (amount / monthSummary.paid) * 100 : 0
    return { method: m, amount, pct }
  }).filter(m => m.amount > 0)

  // 6-month trend
  const trendMonths = last6Months()
  const maxTrendNet = Math.max(...trendMonths.map(ym => {
    const ps = payments.filter(p => nicaraguaMonth(p.paid_at) === ym)
    return summarise(ps).net
  }), 1)
  const trendData = trendMonths.map(ym => {
    const ps = payments.filter(p => nicaraguaMonth(p.paid_at) === ym)
    const s = summarise(ps)
    return { ym, ...s }
  })

  // drilldown: payments of selected month grouped by order
  const orderDisplayName = (p) => p.orders?.clients?.name || p.orders?.customer_name || '—'
  const monthDrilldown = Object.values(
    monthPayments.reduce((acc, p) => {
      const key = p.order_id
      if (!acc[key]) acc[key] = {
        order_id: p.order_id,
        order_number: p.orders?.order_number,
        name: orderDisplayName(p),
        total_amount: Number(p.orders?.total_amount || 0) + Number(p.orders?.delivery_fee || 0),
        payments: []
      }
      acc[key].payments.push(p)
      return acc
    }, {})
  ).map(o => ({ ...o, ...summarise(o.payments) }))
    .sort((a, b) => b.paid - a.paid)

  // recent payments list (last 30)
  const recentPayments = payments.slice(0, 30)

  // available months for the selector
  const availableMonths = [...new Set([currentNicaraguaMonth(), ...payments.map(p => nicaraguaMonth(p.paid_at))])].sort().reverse()

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='max-w-5xl mx-auto px-4 space-y-5'>

        {/* Header */}
        <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-5'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3'>
            <div>
              <h1 className='text-xl font-bold text-gray-800'>Finanzas</h1>
              <p className='text-xs text-gray-400 mt-0.5'>{user.email}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className='flex items-center justify-center py-20'>
            <div className='animate-spin rounded-full h-10 w-10 border-b-2 border-[#51c879]' />
          </div>
        ) : (
          <>
            {/* Month selector */}
            <div className='flex items-center gap-3'>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className='px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent bg-white font-medium text-gray-700'
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <p className='text-xs text-gray-400'>Mostrando pagos recibidos en este mes</p>
            </div>

            {/* ── Resumen del mes ── */}
            <div className='bg-white rounded-2xl shadow-soft p-5'>
              <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4'>Resumen del mes</p>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                <div className='bg-gradient-to-br from-[#51c879]/10 to-[#50bfe6]/10 p-4 rounded-xl'>
                  <p className='text-xs text-gray-500 font-medium mb-1'>Ingresos brutos</p>
                  <p className='text-xl font-bold text-gray-900'>C$ {monthSummary.paid.toFixed(0)}</p>
                </div>
                <div className='bg-gradient-to-br from-violet-50 to-violet-100 p-4 rounded-xl'>
                  <p className='text-xs text-violet-600 font-medium mb-1'>Comisión tarjeta</p>
                  <p className='text-xl font-bold text-violet-900'>− C$ {monthSummary.commission.toFixed(0)}</p>
                  {monthSummary.paidCard > 0 && (
                    <p className='text-[11px] text-violet-400 mt-0.5'>de C$ {monthSummary.paidCard.toFixed(0)} en tarjeta</p>
                  )}
                </div>
                <div className='bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-xl'>
                  <p className='text-xs text-emerald-600 font-medium mb-1'>Neto recibido</p>
                  <p className='text-xl font-bold text-emerald-900'>C$ {monthSummary.net.toFixed(0)}</p>
                </div>
                <div className='bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl'>
                  <p className='text-xs text-red-500 font-medium mb-1'>Pendiente de cobro</p>
                  <p className='text-xl font-bold text-red-900'>C$ {totalPending.toFixed(0)}</p>
                  <p className='text-[11px] text-red-400 mt-0.5'>Lo que clientes aún te deben · {pendingOrders.length} pedido{pendingOrders.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {currentSettlement && (
              <div className='rounded-2xl border border-amber-200 bg-amber-50 p-5'>
                <div className='flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between'>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-amber-700'>Liquidación con socio · acumulado</p>
                    <p className='mt-1 text-sm text-amber-900'>
                      {currentSettlement.settled_orders} trabajo{Number(currentSettlement.settled_orders) !== 1 ? 's' : ''} totalmente pagado{Number(currentSettlement.settled_orders) !== 1 ? 's' : ''}.
                    </p>
                  </div>
                  <p className='text-xl font-bold text-amber-900'>{money(currentSettlement.partner_owed)}</p>
                </div>
                <div className='mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3'>
                  <div><p className='text-amber-700/75'>Facturado</p><p className='font-semibold text-amber-950'>{money(currentSettlement.gross)}</p></div>
                  <div><p className='text-amber-700/75'>Materiales</p><p className='font-semibold text-amber-950'>{money(currentSettlement.material_total)}</p></div>
                  <div><p className='text-amber-700/75'>Tu parte</p><p className='font-semibold text-amber-950'>{money(currentSettlement.your_take)}</p></div>
                </div>
              </div>
            )}

            {/* ── Tendencia 6 meses + Desglose método (side by side on md+) ── */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>

              {/* Tendencia */}
              <div className='bg-white rounded-2xl shadow-soft p-5'>
                <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4'>Tendencia (6 meses)</p>
                <div className='space-y-2'>
                  {trendData.map(({ ym, net, commission }) => (
                    <div key={ym}>
                      <div className='flex justify-between text-xs mb-1'>
                        <button
                          onClick={() => setSelectedMonth(ym)}
                          className={`font-medium transition-colors hover:text-[#51c879] ${ym === selectedMonth ? 'text-[#51c879] font-bold' : 'text-gray-600'}`}
                        >
                          {monthLabelShort(ym)}
                        </button>
                        <span className='text-gray-700 font-semibold'>
                          C$ {net.toFixed(0)}
                          {commission > 0 && <span className='text-gray-400 font-normal'> (−{commission.toFixed(0)} comisión)</span>}
                        </span>
                      </div>
                      <div className='h-2 bg-gray-100 rounded-full overflow-hidden'>
                        <div
                          className={`h-2 rounded-full transition-all ${ym === selectedMonth ? 'bg-[#51c879]' : 'bg-[#51c879]/50'}`}
                          style={{ width: `${Math.round((net / maxTrendNet) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {trendData.every(t => t.paid === 0) && (
                  <p className='text-sm text-gray-400 text-center py-4'>Sin pagos registrados aún.</p>
                )}
              </div>

              {/* Desglose por método */}
              <div className='bg-white rounded-2xl shadow-soft p-5'>
                <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4'>Desglose por método — {monthLabel(selectedMonth)}</p>
                {byMethod.length === 0 ? (
                  <p className='text-sm text-gray-400 text-center py-8'>Sin pagos en este mes.</p>
                ) : (
                  <div className='space-y-4'>
                    {byMethod.map(({ method, amount, pct }) => (
                      <div key={method}>
                        <div className='flex justify-between text-sm mb-1.5'>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${methodColor[method]}`}>
                            {methodLabel[method]}
                          </span>
                          <span className='font-semibold text-gray-800'>
                            C$ {amount.toFixed(0)} <span className='text-gray-400 font-normal'>({pct.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div className='h-2.5 bg-gray-100 rounded-full overflow-hidden'>
                          <div
                            className={`h-2.5 rounded-full ${method === 'tarjeta' ? 'bg-violet-400' : method === 'transferencia' ? 'bg-sky-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.round(pct)}%` }}
                          />
                        </div>
                        {method === 'tarjeta' && (
                          <p className='text-[11px] text-violet-400 mt-1'>Comisión 6.75%: − C$ {(amount * COMMISSION_RATE).toFixed(0)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Drilldown del mes ── */}
            <div className='bg-white rounded-2xl shadow-soft p-5'>
              <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4'>
                Pedidos cobrados en {monthLabel(selectedMonth)}
              </p>
              {monthDrilldown.length === 0 ? (
                <p className='text-sm text-gray-400 text-center py-6'>Sin pagos registrados en este mes.</p>
              ) : (
                <div className='space-y-2'>
                  {monthDrilldown.map(o => (
                    <div key={o.order_id} className='flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0'>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-semibold text-gray-800 truncate'>{o.name}</p>
                        <div className='flex items-center gap-2 mt-0.5 flex-wrap'>
                          <span className='text-xs text-gray-400'>Pedido #{o.order_number}</span>
                          {o.payments.map(p => (
                            <span key={p.id} className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${methodColor[p.method]}`}>
                              {methodLabel[p.method]}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className='text-right flex-shrink-0'>
                        <p className='text-sm font-bold text-gray-800'>C$ {o.paid.toFixed(0)}</p>
                        {o.commission > 0.009 && (
                          <p className='text-[11px] text-violet-400'>neto C$ {o.net.toFixed(0)}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const clientId = o.payments[0]?.orders?.client_id
                          navigate(`/admin/${currentBusiness.slug}/orders`, clientId
                            ? { state: { clientId, clientName: o.name } }
                            : { state: { search: o.name } }
                          )
                        }}
                        className='text-xs text-gray-400 hover:text-[#51c879] px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0'
                      >
                        Ver →
                      </button>
                    </div>
                  ))}
                  <div className='flex justify-between pt-2 text-sm font-semibold text-gray-700 border-t border-gray-100 mt-2'>
                    <span>{monthDrilldown.length} pedido{monthDrilldown.length !== 1 ? 's' : ''}</span>
                    <span>C$ {monthDrilldown.reduce((s, o) => s + o.net, 0).toFixed(0)} neto</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Cuentas por cobrar ── */}
            {pendingOrders.length > 0 && (
              <div className='bg-white rounded-2xl shadow-soft p-5'>
                <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4'>Cuentas por cobrar</p>
                <div className='space-y-2'>
                  {pendingOrders.map(o => {
                    const daysOpen = Math.floor((new Date() - new Date(o.order_date + 'T00:00:00')) / 86400000)
                    return (
                      <div key={o.id} className='flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0'>
                        <div className='flex-1 min-w-0'>
                          <p className='text-sm font-semibold text-gray-800 truncate'>{o.customer_name}</p>
                          <p className='text-xs text-gray-400'>Pedido #{o.order_number} · {daysOpen}d abierto</p>
                        </div>
                        <div className='text-right flex-shrink-0'>
                          <p className='text-sm font-bold text-red-600'>C$ {o.balance.toFixed(0)}</p>
                          <p className='text-xs text-gray-400'>de C$ {(Number(o.total_amount || 0) + Number(o.delivery_fee || 0)).toFixed(0)}</p>
                        </div>
                        <button
                          onClick={() => navigate(`/admin/${currentBusiness.slug}/orders`, o.client_id ? { state: { clientId: o.client_id, clientName: o.customer_name } } : { state: { search: o.customer_name } })}
                          className='text-xs text-gray-400 hover:text-[#51c879] px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0'
                        >
                          Ver →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Historial de pagos ── */}
            <div className='bg-white rounded-2xl shadow-soft p-5'>
              <div className='flex items-center justify-between mb-4'>
                <p className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Historial de pagos recientes</p>
                <p className='text-xs text-gray-400'>Últimos {recentPayments.length}</p>
              </div>
              {recentPayments.length === 0 ? (
                <p className='text-sm text-gray-400 text-center py-8'>Sin pagos registrados aún.</p>
              ) : (
                <div className='space-y-1.5'>
                  {recentPayments.map(p => (
                    <div key={p.id} className='flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 text-sm'>
                      <span className='text-gray-400 w-16 flex-shrink-0 text-xs'>
                        {new Date(p.paid_at + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${methodColor[p.method]}`}>
                        {methodLabel[p.method]}
                      </span>
                      <span className='flex-1 truncate text-gray-600'>
                        {p.orders?.customer_name || '—'}
                        {p.note && <span className='text-gray-400'> · {p.note}</span>}
                      </span>
                      <span className='font-semibold text-gray-800 flex-shrink-0'>C$ {Number(p.amount).toFixed(0)}</span>
                      {p.method === 'tarjeta' && (
                        <span className='text-[11px] text-violet-400 flex-shrink-0'>−C$ {(Number(p.amount) * COMMISSION_RATE).toFixed(0)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
