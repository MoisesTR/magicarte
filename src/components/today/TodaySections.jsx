import { Link } from 'react-router-dom'
import Swatch from '../Swatch'
import TodaySection from './TodaySection'
import TodayOrderRow from './TodayOrderRow'
import { STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../../utils/todayPanel.js'

const money = value => `C$ ${Number(value).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function Empty({ children }) {
  return <p className='rounded-xl bg-gray-50 p-3 text-sm text-gray-500'>{children}</p>
}
function OrderList({ orders, ordersPath, ...props }) {
  return <ul className='space-y-2'>{orders.map(order => <li key={order.id} className='min-w-0'><TodayOrderRow order={order} ordersPath={ordersPath} {...props} /></li>)}</ul>
}

export function DeliveriesSection({ groups, ordersPath, className }) {
  const buckets = [
    ['overdue', 'Atrasados', 'Nada atrasado 🎉'], ['today', 'Hoy', 'Sin entregas para hoy.'],
    ['tomorrow', 'Mañana', 'Sin entregas para mañana.'], ['week', 'Resto de la semana', 'Sin más entregas hasta el domingo.'],
  ]
  return <TodaySection id='deliveries' title='Entregas' href={ordersPath} className={className}>
    <div className='space-y-4'>{buckets.map(([key, label, empty]) => <div key={key}>
      <h3 className={`mb-2 text-sm font-semibold ${key === 'overdue' && groups[key].length ? 'text-red-700' : 'text-gray-600'}`}>{label} <span className='ml-1 text-xs text-gray-500'>{groups[key].length}</span></h3>
      {groups[key].length ? <OrderList orders={groups[key]} ordersPath={ordersPath} /> : <Empty>{empty}</Empty>}
    </div>)}</div>
  </TodaySection>
}

export function ReceivablesSection({ orders, ordersPath, className }) {
  return <TodaySection id='receivables' title='Por cobrar' href={ordersPath} className={className}>
    {orders.length ? <OrderList orders={orders} ordersPath={ordersPath} showDeposit /> : <Empty>No hay saldos pendientes. Todo al día.</Empty>}
  </TodaySection>
}

export function FollowUpsSection({ followUps, ordersPath, today, className }) {
  return <TodaySection id='followUps' title='Seguimientos' href={ordersPath} className={className}>
    {followUps.orders.length ? <OrderList orders={followUps.orders} ordersPath={ordersPath} showFollowUp today={today} /> : <Empty>Seguimientos al día. No hay recordatorios pendientes.</Empty>}
    <Link to={ordersPath} className='mt-3 flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700'>
      <span>Backlog</span><span className='font-semibold'>{followUps.backlogCount} pedidos <span aria-hidden='true'>→</span></span>
    </Link>
  </TodaySection>
}

export function ProductionSection({ counts, ordersPath, className }) {
  return <TodaySection id='production' title='Producción' className={className}>
    <p className='mb-3 text-sm text-gray-500'>Pedidos abiertos por estado.</p>
    <div className='flex flex-wrap gap-2'>{Object.entries(counts).map(([status, count]) => <Link key={status} to={ordersPath} className='inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2'>
      <span>{STATUS_LABELS[status]}</span><span className='rounded-full bg-white px-2 py-0.5 font-bold text-gray-800'>{count}</span>
    </Link>)}</div>
  </TodaySection>
}

export function LowStockSection({ items, inventoryPath, className }) {
  if (!items.length) return null
  return <TodaySection id='lowStock' title='Inventario bajo' href={inventoryPath} className={className}>
    <ul className='space-y-2'>{items.map(item => <li key={item.id}>
      <Link to={inventoryPath} className='flex min-h-10 min-w-0 items-center gap-3 rounded-xl border border-gray-100 p-3 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2'>
        {item.inventory_kind === 'filament' && <Swatch hex={item.color_hex} transparent={item.color_transparent} label={item.filament_color} />}
        <div className='min-w-0 flex-1'><p className='break-words text-sm font-semibold text-gray-800 [overflow-wrap:anywhere]'>{item.name}</p>
          {item.inventory_kind === 'filament' && <p className='break-words text-xs text-gray-500'>{[item.filament_material, item.filament_color].filter(Boolean).join(' · ')}</p>}
          <p className='mt-1 break-words text-xs font-semibold text-amber-800'>{Number(item.current_stock || 0).toLocaleString('es-NI')} {item.unit}</p>
        </div>
      </Link>
    </li>)}</ul>
  </TodaySection>
}

export function DayCloseSection({ close, className }) {
  return <TodaySection id='dayClose' title='Cierre del día' className={className}>
    <p className='text-sm text-gray-500'>Pagos recibidos hoy</p>
    <p className='mt-1 break-all text-2xl font-bold text-gray-800'>{money(close.paymentsTotal)}</p>
    {Object.keys(close.paymentsByMethod).length ? <dl className='mt-3 space-y-2'>{Object.entries(close.paymentsByMethod).map(([method, amount]) => <div key={method} className='flex flex-wrap justify-between gap-2 text-sm'>
      <dt className='text-gray-500'>{PAYMENT_METHOD_LABELS[method] || method}</dt><dd className='break-all font-semibold text-gray-700'>{money(amount)}</dd>
    </div>)}</dl> : <div className='mt-3'><Empty>Sin pagos recibidos hoy.</Empty></div>}
    <dl className='mt-4 space-y-3 border-t border-gray-100 pt-4'>
      <div><dt className='text-sm text-gray-500'>Pedidos creados hoy</dt><dd className='mt-1 break-words font-semibold text-gray-800'>{close.createdCount} · {money(close.createdTotal)}</dd></div>
      <div><dt className='text-sm text-gray-500'>Pedidos completados hoy</dt><dd className='mt-1 font-semibold text-gray-800'>{close.completedCount}</dd></div>
    </dl>
  </TodaySection>
}
