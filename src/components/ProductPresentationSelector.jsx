import { useId, useState } from 'react'
import {
  buildSpecialPresentation,
  defaultSpecialLabel,
  presentationSelectorModel,
  updateSpecialPresentationDraft,
  formatPresentationMoney,
  unitPriceLabel,
} from '../utils/productPresentations.js'
export default function ProductPresentationSelector({
  presentations = [],
  selected,
  onChange,
  admin = false,
  specialOption,
  specialSelected = false,
}) {
  const { active, selectedCatalogId, hasSnapshot } = presentationSelectorModel(
    presentations,
    selected,
    { admin: specialSelected }
  )
  const matchesSelected = (row) =>
    !specialSelected && row.id === selectedCatalogId
  if (admin)
    return (
      <AdminPresentationSelector
        key={JSON.stringify([
          selected || null,
          presentationSelectorModel(presentations, selected, { admin: true })
            .specialSelected,
        ])}
        presentations={presentations}
        selected={selected}
        onChange={onChange}
      />
    )
  return (
    <fieldset className='min-w-0 space-y-2'>
      <legend className='mb-2 font-semibold text-gray-800'>Presentación</legend>
      {hasSnapshot && !specialSelected && (
        <div
          aria-label='Presentación guardada seleccionada'
          className='rounded-xl border border-emerald-500 bg-emerald-50 p-3 text-sm break-words'
        >
          {selected.label} · {formatPresentationMoney(selected.price)}{' '}
          (guardada)
          <span className='mt-1 block text-xs text-gray-600'>
            {selected.units} piezas
            {Number(selected.units) > 1
              ? ` · ${unitPriceLabel(selected)} c/u`
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
              {unitPriceLabel(row)} c/u
            </span>
          )}
        </button>
      ))}
      {specialOption}
    </fieldset>
  )
}

function AdminPresentationSelector({ presentations, selected, onChange }) {
  const model = presentationSelectorModel(presentations, selected, {
    admin: true,
  })
  const [specialActive, setSpecialActive] = useState(model.specialSelected)
  const [draft, setDraft] = useState(() => ({
    label: model.specialSelected
      ? selected.label
      : defaultSpecialLabel(selected?.units || 1),
    units: selected?.units || 1,
    price: selected?.price ?? '',
    nameEdited: model.specialSelected,
  }))
  const [errors, setErrors] = useState({})
  const errorId = useId()
  const change = (field, value) => {
    setDraft((previous) =>
      updateSpecialPresentationDraft(previous, field, value)
    )
    setErrors({})
  }
  const fields = [
    { field: 'label', label: 'Nombre', type: 'text' },
    { field: 'units', label: 'Unidades', type: 'number', min: 1, step: 1 },
    {
      field: 'price',
      label: 'Precio del paquete (C$)',
      type: 'number',
      min: 0,
      step: 'any',
    },
  ]
  return (
    <ProductPresentationSelector
      presentations={presentations}
      selected={selected}
      specialSelected={specialActive}
      onChange={(row) => {
        setSpecialActive(false)
        setErrors({})
        onChange(row)
      }}
      specialOption={
        <div className='min-w-0 space-y-3'>
          <button
            type='button'
            aria-pressed={specialActive}
            onClick={() => setSpecialActive(true)}
            className={`min-h-10 w-full min-w-0 rounded-xl border p-3 text-left text-sm font-medium ${specialActive ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'}`}
          >
            Paquete especial
          </button>
          {specialActive && (
            <div className='min-w-0 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3'>
              {fields.map(({ field, label, ...input }) => (
                <label
                  key={field}
                  className='block min-w-0 text-sm font-medium text-gray-700'
                >
                  {label}
                  <input
                    {...input}
                    required
                    value={draft[field]}
                    aria-invalid={!!errors[field]}
                    aria-describedby={
                      errors[field] ? `${errorId}-${field}` : undefined
                    }
                    onChange={(event) => change(field, event.target.value)}
                    className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3'
                  />
                  {errors[field] && (
                    <span
                      id={`${errorId}-${field}`}
                      role='alert'
                      className='mt-1 block text-sm font-normal text-red-700'
                    >
                      {errors[field]}
                    </span>
                  )}
                </label>
              ))}
              <button
                type='button'
                className='min-h-10 w-full min-w-0 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white'
                onClick={() => {
                  const { snapshot, errors: nextErrors } =
                    buildSpecialPresentation(draft)
                  setErrors(nextErrors)
                  if (snapshot)
                    onChange({
                      id: null,
                      label: snapshot.presentation_label,
                      units: snapshot.units_per_presentation,
                      price: snapshot.unit_price,
                    })
                }}
              >
                Aplicar paquete especial
              </button>
            </div>
          )}
        </div>
      }
    />
  )
}
