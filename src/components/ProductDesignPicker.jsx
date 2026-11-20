import { useId, useRef, useState } from 'react'
import { designPickerModel } from '../utils/productDesignPhotos.js'
import {
  changeDesignQuantity,
  selectionTotals,
} from '../utils/productPresentations.js'

const button =
  'min-h-10 min-w-10 rounded-lg border border-gray-300 bg-white px-3 disabled:opacity-40'
export default function ProductDesignPicker({
  designs = [],
  selections = [],
  packs = 1,
  units = 1,
  onChange,
  admin = false,
  mainImageUrl,
}) {
  const [customName, setCustomName] = useState('')
  const totals = selectionTotals(packs, units, selections)
  const { tiles, showGroupHint } = designPickerModel(designs, selections)
  const dialog = useRef(null)
  const dialogTitle = useId()
  return (
    <section className='min-w-0 space-y-3' aria-label='Diseños para elegir'>
      <h3 className='font-semibold text-gray-800'>Diseños para elegir</h3>
      <p aria-live='polite' className='text-sm text-gray-600'>
        Elegidos {totals.chosen} de {totals.required}
        {totals.remaining > 0 ? ` · faltan ${totals.remaining}` : ''}
      </p>
      {admin && totals.remaining > 0 && (
        <p className='text-sm text-amber-700'>
          Faltan {totals.remaining} por elegir
        </p>
      )}
      {totals.over > 0 && (
        <p role='status' className='text-sm text-amber-700'>
          Sobran {totals.over} piezas. Puede ajustar los diseños o la cantidad
          de paquetes.
        </p>
      )}
      {showGroupHint && (
        <div className='flex items-center gap-3 rounded-xl bg-gray-50 p-3'>
          <p className='text-sm text-gray-700'>
            Elija sus diseños de la foto principal
          </p>
          {mainImageUrl && (
            <>
              <button
                type='button'
                aria-label='Ver foto principal'
                onClick={() => dialog.current?.showModal()}
                className='min-h-12 min-w-12 shrink-0 rounded-lg border border-gray-300 p-1'
              >
                <img
                  src={mainImageUrl}
                  alt=''
                  className='h-14 w-14 rounded object-cover'
                />
                <span className='sr-only'>Ver foto principal</span>
              </button>
              <dialog
                ref={dialog}
                aria-labelledby={dialogTitle}
                className='m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl rounded-xl bg-white p-4 backdrop:bg-black/70'
              >
                <div className='mb-3 flex items-center justify-between gap-3'>
                  <h4 id={dialogTitle} className='font-semibold'>
                    Foto principal del producto
                  </h4>
                  <button
                    type='button'
                    autoFocus
                    onClick={() => dialog.current?.close()}
                    className={button}
                  >
                    Cerrar foto principal
                  </button>
                </div>
                <img
                  src={mainImageUrl}
                  alt='Foto principal con los diseños disponibles'
                  className='max-h-[70dvh] w-full object-contain'
                />
              </dialog>
            </>
          )}
        </div>
      )}
      <div className='grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2'>
        {tiles.map((design, index) => {
          const selected = selections.find((row) =>
            design.id
              ? row.design_id === design.id
              : !row.design_id && row.design_name === design.name
          )
          return (
            <div
              key={design.id || `custom-${index}`}
              className='min-w-0 rounded-xl border border-gray-200 bg-white p-3'
            >
              {design.showPhoto && (
                <img
                  src={design.image_url}
                  alt=''
                  className='mb-2 aspect-square w-full rounded-lg object-cover'
                />
              )}
              <p className='text-sm font-medium break-words text-gray-800'>
                {!design.showPhoto && design.number != null && (
                  <span className='rounded bg-gray-100 px-1.5 py-0.5 font-semibold'>
                    {design.number}
                  </span>
                )}
                {!design.showPhoto && design.number != null ? ' · ' : ''}
                {design.name}
              </p>
              <div className='mt-2 flex items-center justify-between gap-1'>
                <button
                  type='button'
                  className={button}
                  aria-label={`Quitar ${design.name}`}
                  disabled={!selected?.quantity}
                  onClick={() =>
                    onChange(
                      changeDesignQuantity(
                        selections,
                        design,
                        -1,
                        totals.required
                      )
                    )
                  }
                >
                  −
                </button>
                <span className='text-sm tabular-nums'>
                  {selected?.quantity || 0}
                </span>
                <button
                  type='button'
                  className={button}
                  aria-label={`Agregar ${design.name}`}
                  disabled={totals.remaining === 0}
                  onClick={() =>
                    onChange(
                      changeDesignQuantity(
                        selections,
                        design,
                        1,
                        totals.required
                      )
                    )
                  }
                >
                  +
                </button>
              </div>
              {selected?.quantity > 0 && (
                <label className='mt-2 block text-xs text-gray-600'>
                  Nota
                  <input
                    className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-300 px-2 text-sm'
                    placeholder='Ej.: nombre para esta pieza'
                    value={selected.note || ''}
                    onChange={(event) =>
                      onChange(
                        selections.map((row) =>
                          row === selected
                            ? { ...row, note: event.target.value }
                            : row
                        )
                      )
                    }
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
      <div className='min-w-0 space-y-2 rounded-xl border border-dashed border-gray-300 p-3'>
        <label className='block text-sm font-medium text-gray-700'>
          Otro diseño
          <input
            className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-300 px-3'
            placeholder='Escriba el diseño que desea'
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
          />
        </label>
        <button
          type='button'
          className={`${button} text-sm`}
          disabled={!customName.trim() || totals.remaining === 0}
          onClick={() => {
            onChange(
              changeDesignQuantity(
                selections,
                { name: customName.trim() },
                1,
                totals.required
              )
            )
            setCustomName('')
          }}
        >
          Agregar otro diseño
        </button>
      </div>
    </section>
  )
}
