export default function PiecesToProducePanel({ summary, selectedKey = null, onSelect }) {
  return (
    <section id='pieces-to-produce-panel' aria-label='Resumen de piezas pendientes' className='min-w-0 rounded-xl border border-gray-200 bg-white p-3 sm:p-4'>
      {summary.rows.length === 0 ? (
        <p className='text-sm text-gray-500'>No hay piezas pendientes de producir.</p>
      ) : (
        <ul className='space-y-1'>
          {summary.rows.map(row => {
            const selected = row.key === selectedKey
            return (
              <li key={row.key}>
                <button
                  type='button'
                  aria-pressed={selected}
                  onClick={() => onSelect?.(selected ? null : row.key)}
                  className={`flex w-full min-h-11 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border px-2 py-2 text-left transition-colors ${selected ? 'border-[#51c879] bg-green-50' : 'border-transparent hover:bg-gray-50'}`}
                >
                  <span className='block min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]'>
                    <span className='text-sm text-gray-800'>{row.name}</span>
                    {!row.linked && <span className='ml-2 text-xs text-gray-400'>sin vincular</span>}
                    <span className='block text-xs text-gray-400'>{row.orderNumbers.map(number => `#${number}`).join(', ')}</span>
                  </span>
                  <strong className='text-sm text-gray-800'>{`${row.pieces} piezas`}</strong>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className='mt-3 border-t border-gray-100 pt-2 text-xs font-medium text-gray-600'>
        {`Total: ${summary.totalPieces} piezas en ${summary.orderCount} pedidos`}
      </p>
    </section>
  )
}
