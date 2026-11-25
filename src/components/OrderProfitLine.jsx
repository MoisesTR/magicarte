import { orderProfit } from '../utils/orderProfit.js'

const currency = value => `C$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`

export default function OrderProfitLine({ order, quotesByProductId, loading, error }) {
  const estimate = orderProfit(order, quotesByProductId)
  const prefix = estimate.approximate ? '~' : ''
  return (
    <div className='min-w-0 break-words text-xs text-gray-500 mt-1'>
      {loading ? 'Ganancia estimada: cargando costos…' : error ? 'Ganancia estimada: no se pudo cargar el costo' : estimate.profit === null ? (
        <>
          <p>Ganancia estimada: sin costo vinculado</p>
          <p className='text-[11px]'>Vincule una cotización en el producto</p>
        </>
      ) : (
        <p>
          <span title={estimate.approximate ? 'Estimado con el costo por pieza de la cotización' : undefined}>
            {`Ganancia estimada: ${prefix}${currency(estimate.profit)}${estimate.marginPct === null ? '' : ` (${estimate.marginPct}%)`} · Costo ${prefix}${currency(estimate.cost)}`}
          </span>
          {estimate.missingItems.length > 0 && (
            <span className='text-gray-400'>{` · ${estimate.missingItems.length} ${estimate.missingItems.length === 1 ? 'producto sin costo' : 'productos sin costo'}`}</span>
          )}
        </p>
      )}
    </div>
  )
}
