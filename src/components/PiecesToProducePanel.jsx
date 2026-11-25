export default function PiecesToProducePanel({ summary }) {
  return (
    <section id='pieces-to-produce-panel' aria-label='Resumen de piezas pendientes' className='min-w-0 rounded-xl border border-gray-200 bg-white p-3 sm:p-4'>
      {summary.rows.length === 0 ? (
        <p className='text-sm text-gray-500'>No hay piezas pendientes de producir.</p>
      ) : (
        <ul className='divide-y divide-gray-100'>
          {summary.rows.map(row => (
            <li key={row.key} className='flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 first:pt-0'>
              <div className='min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]'>
                <span className='text-sm text-gray-800'>{row.name}</span>
                {!row.linked && <span className='ml-2 text-xs text-gray-400'>sin vincular</span>}
                <p className='text-xs text-gray-400'>{row.orderNumbers.map(number => `#${number}`).join(', ')}</p>
              </div>
              <strong className='text-sm text-gray-800'>{`${row.pieces} piezas`}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className='mt-3 border-t border-gray-100 pt-2 text-xs font-medium text-gray-600'>
        {`Total: ${summary.totalPieces} piezas en ${summary.orderCount} pedidos`}
      </p>
    </section>
  )
}
