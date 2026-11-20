import AdminLogin from '../components/AdminLogin'
import { useBusiness } from '../context/BusinessContext'
import useTodayPanel from '../hooks/useTodayPanel'
import {
  getManaguaContext, getSectionOrder, selectDeliveries, selectReceivables,
  selectFollowUps, selectProduction, selectLowStock, selectDayClose, selectKPIs,
} from '../utils/todayPanel.js'
import {
  DeliveriesSection, ReceivablesSection, FollowUpsSection,
  ProductionSection, LowStockSection, DayCloseSection,
} from '../components/today/TodaySections'

const money = value => `C$ ${Number(value).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function LoadingPanel() {
  return <main className='min-h-screen bg-gray-50 px-4 py-6' aria-busy='true' aria-label='Cargando su día'>
    <p role='status' className='mx-auto mb-4 max-w-7xl text-sm text-gray-500'>Cargando su día…</p>
    <div aria-hidden='true' className='mx-auto grid max-w-7xl animate-pulse gap-4 md:grid-cols-2 xl:grid-cols-3'>
      <div className='h-32 rounded-2xl bg-gray-200 md:col-span-2 xl:col-span-3' />
      {[0, 1, 2].map(key => <div key={key} className='h-64 rounded-2xl bg-gray-200' />)}
    </div>
  </main>
}

function Kpi({ label, value }) {
  return <div className='min-w-0 rounded-xl bg-gray-50 p-3'>
    <p className='text-xs text-gray-500'>{label}</p>
    <p className='mt-1 break-words text-lg font-bold text-gray-800 [overflow-wrap:anywhere]'>{value}</p>
  </div>
}

export default function Today() {
  const { currentBusinessId, currentBusiness } = useBusiness()
  const { user, checkingAuth, loading, isFetching, isError, data, now, refresh, onLogin } = useTodayPanel(currentBusinessId)
  if (!checkingAuth && !user) return <AdminLogin onLogin={onLogin} />
  if (loading) return <LoadingPanel />
  if (isError || !data) return <main className='min-h-screen bg-gray-50 px-4 py-8'>
    <div role='alert' className='mx-auto max-w-lg rounded-2xl bg-white p-6 text-center shadow-soft'>
      <h1 className='text-lg font-bold text-gray-800'>No se pudo cargar su día</h1>
      <p className='mt-2 text-sm text-gray-500'>Revise su conexión e intente de nuevo. No se muestran totales incompletos.</p>
      <button onClick={refresh} disabled={isFetching} className='mt-4 min-h-10 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50'>Reintentar</button>
    </div>
  </main>

  const context = getManaguaContext(now)
  const ordersPath = `/admin/${currentBusiness.slug}/orders`
  const inventoryPath = `/admin/${currentBusiness.slug}/inventory`
  const kpis = selectKPIs(data.orders, now)
  const lowStock = selectLowStock(data.inventory)
  const sections = {
    deliveries: <DeliveriesSection groups={selectDeliveries(data.orders, now)} ordersPath={ordersPath} />,
    receivables: <ReceivablesSection orders={selectReceivables(data.orders)} ordersPath={ordersPath} />,
    followUps: <FollowUpsSection followUps={selectFollowUps(data.orders, now)} ordersPath={ordersPath} today={context.today} />,
    production: <ProductionSection counts={selectProduction(data.orders)} ordersPath={ordersPath} />,
    lowStock: lowStock.length ? <LowStockSection items={lowStock} inventoryPath={inventoryPath} /> : null,
    dayClose: <DayCloseSection close={selectDayClose(data.orders, data.payments, now)} />,
  }
  return <main className='min-h-screen bg-gray-50 py-5 sm:py-6'>
    <div className='mx-auto max-w-7xl space-y-4 px-3 sm:px-4'>
      <header className='admin-page-header min-w-0 rounded-2xl bg-white p-4 shadow-soft sm:p-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='break-words text-xs font-semibold uppercase tracking-wide text-gray-500'>Hoy · {currentBusiness.name}</p>
            <h1 className='mt-1 text-2xl font-bold text-gray-800'>{context.greeting}</h1>
            <p className='mt-1 text-sm text-gray-500'>{context.dateLabel}</p>
          </div>
          <button onClick={refresh} disabled={isFetching} aria-label='Actualizar panel' className='inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'>
            <span aria-hidden='true' className={isFetching ? 'animate-spin' : ''}>↻</span>{isFetching ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
        <div className='mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4'>
          <Kpi label='Entregas hoy' value={kpis.deliveriesToday} />
          <Kpi label='Atrasados' value={kpis.overdue} />
          <Kpi label='Por cobrar' value={money(kpis.receivableTotal)} />
          <Kpi label='Seguimientos hoy' value={kpis.followUpsToday} />
        </div>
      </header>
      <div className='grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {getSectionOrder(now).filter(key => sections[key]).map(key => <div key={key} className='min-w-0'>{sections[key]}</div>)}
      </div>
    </div>
  </main>
}
