import {
  activeOptions,
  formatPresentationMoney,
  unitPrice,
} from '../utils/productPresentations.js'
export default function ProductPresentationSelector({
  presentations = [],
  selected,
  onChange,
}) {
  const active = activeOptions(presentations)
  const matchesSelected = (row) =>
    !!row.id &&
    row.id === selected?.id &&
    row.label === selected.label &&
    Number(row.units) === Number(selected.units) &&
    Number(row.price) === Number(selected.price)
  const hasSnapshot = selected && !active.some(matchesSelected)
  return (
    <fieldset className='min-w-0 space-y-2'>
      <legend className='mb-2 font-semibold text-gray-800'>Presentación</legend>
      {hasSnapshot && (
        <div
          aria-label='Presentación guardada seleccionada'
          className='rounded-xl border border-emerald-500 bg-emerald-50 p-3 text-sm break-words'
        >
          {selected.label} · {formatPresentationMoney(selected.price)}{' '}
          (guardada)
          <span className='mt-1 block text-xs text-gray-600'>
            {selected.units} piezas
            {Number(selected.units) > 1
              ? ` · ${formatPresentationMoney(unitPrice(selected))} c/u`
              : ''}
          </span>
        </div>
      )}
      {active.map((row) => (
        <button
          key={row.id}
          type='button'
          aria-pressed={matchesSelected(row)}
          onClick={() => onChange(row)}
          className={`min-h-10 w-full min-w-0 rounded-xl border p-3 text-left ${matchesSelected(row) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'}`}
        >
          <span className='block text-sm font-medium break-words'>
            {row.label} · {formatPresentationMoney(row.price)}
          </span>
          {row.units > 1 && (
            <span className='mt-1 block text-xs text-gray-500'>
              {formatPresentationMoney(unitPrice(row))} c/u
            </span>
          )}
        </button>
      ))}
    </fieldset>
  )
}
