import { Link } from 'react-router-dom'
import { getOrderChargeTotal, getPaymentSummary } from '../../utils/orderPayments.js'
import { dateKey, STATUS_LABELS, FOLLOW_UP_LABELS } from '../../utils/todayPanel.js'

const statusColors = {
  backlog: 'bg-gray-100 text-gray-600', pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800', in_progress: 'bg-purple-100 text-purple-800',
  ready: 'bg-teal-100 text-teal-800', completed: 'bg-green-100 text-green-800', canceled: 'bg-gray-100 text-gray-500',
}
const money = value => `C$ ${Number(value).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function shortDate(value) {
  const day = dateKey(value)
  return day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('es-NI', { timeZone: 'America/Managua', day: 'numeric', month: 'short' }) : 'Sin fecha de entrega'
}

export default function TodayOrderRow({ order, ordersPath, showDeposit = false, showFollowUp = false, today }) {
  const { balance } = getPaymentSummary(order.order_payments, getOrderChargeTotal(order))
  return (
    <Link to={`${ordersPath}?order=${encodeURIComponent(order.id)}`} className='block min-h-10 min-w-0 rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2'>
      <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
        <span className='break-all text-xs font-bold text-gray-500'>#{order.order_number || '—'}</span>
        <span className='min-w-0 break-words text-sm font-semibold text-gray-800 [overflow-wrap:anywhere]'>{order.customer_name || 'Cliente sin nombre'}</span>
        {order.priority === 'urgent' && <span className='rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800'>Urgente</span>}
      </div>
      <div className='mt-2 flex flex-wrap items-center gap-2 text-xs'>
        <span className={`rounded-full px-2 py-1 font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[order.status] || order.status}</span>
        {balance > 0 && <span className='break-all font-semibold text-red-700'>Saldo {money(balance)}</span>}
        {showDeposit && order.withoutDeposit && <span className='rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800'>Sin anticipo</span>}
      </div>
      <p className='mt-2 break-words text-xs text-gray-500'>
        {shortDate(order.estimated_delivery_date)} · {order.delivery_method === 'pickup' ? 'Recoger en tienda' : order.delivery_method === 'delivery' ? 'Entrega a domicilio' : 'Modalidad sin definir'}
      </p>
      {showFollowUp && <div className='mt-2 border-t border-gray-100 pt-2 text-sm text-gray-700'>
        <p className='break-words [overflow-wrap:anywhere]'>{FOLLOW_UP_LABELS[order.follow_up_reason] || order.follow_up_reason || 'Seguimiento pendiente'}</p>
        <p className={`mt-1 text-xs ${dateKey(order.follow_up_date) < today ? 'text-red-700' : 'text-gray-500'}`}>{dateKey(order.follow_up_date) < today ? 'Atrasado' : 'Hoy'} · {shortDate(order.follow_up_date)}</p>
      </div>}
    </Link>
  )
}
