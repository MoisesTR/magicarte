import { useEffect, useState } from 'react'
import { fetchCostQuotes } from '../data/calcQuotes'
import { itemCost } from '../utils/orderProfit.js'

const currency = value => `C$${new Intl.NumberFormat('en-US', { minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2, maximumFractionDigits: 2 }).format(value)}`

export default function ProductCostQuoteField({ businessId, value, onChange, initialQuote, disabled }) {
  const [quotes, setQuotes] = useState(() => initialQuote ? [initialQuote] : [])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    let ignore = false
    const load = async () => {
      try {
        const { data, error } = await fetchCostQuotes(businessId)
        if (error) throw error
        if (!ignore) setQuotes(data || [])
      } catch {
        if (!ignore) setError(true)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [businessId])
  const selected = quotes.find(quote => quote.id === value)
  const estimate = itemCost({ quantity: 1 }, selected)
  const visible = quotes.filter(quote => quote.id === value || (quote.name || '').toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es').trim()))
  return (
    <div className='min-w-0 space-y-2'>
      <label htmlFor='product-cost-quote' className='block text-sm font-medium text-gray-700'>Cotización de costo</label>
      <input type='search' aria-label='Buscar cotización de costo' placeholder='Buscar cotización por nombre'
        value={search} onChange={event => setSearch(event.target.value)} disabled={disabled || loading}
        className='w-full min-w-0 min-h-11 px-3 py-2 border border-gray-300 rounded-xl text-sm' />
      <select id='product-cost-quote' value={value || ''} onChange={event => onChange(event.target.value || null)}
        disabled={disabled || loading} aria-describedby='product-cost-quote-hint'
        className='w-full min-w-0 min-h-11 px-3 py-2 border border-gray-300 rounded-xl text-sm'>
        <option value=''>Sin cotización</option>
        {value && !selected && <option value={value}>Cotización vinculada no disponible</option>}
        {visible.map(quote => (
          <option key={quote.id} value={quote.id}>
            {`${quote.name} · ${quote.updated_at ? new Date(quote.updated_at).toLocaleDateString('es-NI', { timeZone: 'America/Managua' }) : 'Sin fecha'} · ${quote.summary?.unitCost != null ? `${currency(quote.summary.unitCost)} por pieza` : 'Sin costo por pieza'}`}
          </option>
        ))}
      </select>
      <p id='product-cost-quote-hint' className='text-xs text-gray-500'>Se usa para estimar la ganancia de los pedidos.</p>
      {loading && <p className='text-xs text-gray-500'>Cargando cotizaciones…</p>}
      {error && <p role='status' className='text-xs text-amber-700'>No se pudieron cargar las cotizaciones. Cierre y abra el formulario para reintentar.</p>}
      {estimate && <p className='text-xs text-gray-600'>
        {estimate.exact
          ? `Costo fijo ${currency(selected.summary.costModel.fixedPerOrder)} por pedido + ${currency(selected.summary.costModel.variablePerPiece)} por pieza`
          : `${currency(selected.summary.unitCost)} por pieza (aprox.)`}
      </p>}
    </div>
  )
}
