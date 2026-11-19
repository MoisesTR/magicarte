import { useEffect, useRef, useState } from 'react'
import { supabase } from '../config/supabaseClient'
import { detectProductDesigns } from '../utils/productDesignDetection.js'
import {
  matchDesignPhotos,
  applyDesignPhotos,
  appendDetectedDesigns,
} from '../utils/productDesignPhotos.js'
import { createGalleryPreview } from '../utils/productGallery.js'
import { fetchProductOptions } from '../data/productPresentations'
import {
  copyDesigns,
  moveOption,
  formatPresentationMoney,
  presentationPrice,
} from '../utils/productPresentations'
import { prepareFile } from '../utils/uploadImage'
import toast from 'react-hot-toast'

function DesignPhoto({ row }) {
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!row.imageFile) return
    let active = true
    const resource = createGalleryPreview(row.imageFile, { prepareFile })
    resource.ready
      .then((url) => {
        if (active) setPreview({ file: row.imageFile, url })
      })
      .catch(() => {
        if (active) setPreview(null)
      })
    return () => {
      active = false
      resource.dispose()
    }
  }, [row.imageFile])
  const src = row.imageFile
    ? preview?.file === row.imageFile
      ? preview.url
      : null
    : row.image_url
  return src ? (
    <img
      src={src}
      alt={row.name}
      className='h-16 w-16 rounded-lg object-cover'
    />
  ) : (
    <p className='text-xs text-gray-500'>Foto lista para guardar</p>
  )
}

const input =
  'min-h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm'
const button =
  'min-h-10 min-w-10 rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:opacity-40'
export default function ProductOptionsEditor({
  options,
  products = [],
  productId,
  businessId,
  disabled = false,
  mainImage,
  productName = '',
}) {
  const [busy, setBusy] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [suggestions, setSuggestions] = useState(null)
  const [bulkFiles, setBulkFiles] = useState([])
  const requestVersion = useRef(0)
  const setOptionsRef = useRef(options.setOptions)
  setOptionsRef.current = options.setOptions
  useEffect(() => {
    requestVersion.current += 1
    setSuggestions(null)
    setBulkFiles([])
    setBusy(false)
    setOptionsRef.current({ uploading: false })
    return () => {
      requestVersion.current += 1
    }
  }, [productId, businessId, options.revision, mainImage?.file, mainImage?.url])
  if (options.loading)
    return <p className='text-sm text-gray-400'>Cargando presentaciones...</p>
  if (options.error)
    return (
      <p role='alert' className='text-sm text-red-600'>
        No se pudieron cargar las presentaciones. Cierra y vuelve a abrir el
        producto.
      </p>
    )
  if (!options.available) return null
  const update = (key, index, changes) =>
    options.setOptions({
      [key]: options[key].map((row, i) =>
        i === index ? { ...row, ...changes } : row
      ),
    })
  const detect = async () => {
    const request = ++requestVersion.current
    setBusy(true)
    options.setOptions({ uploading: true })
    try {
      const rows = await detectProductDesigns(
        {
          mainImage,
          productName,
          existingNames: options.designs.map((row) => row.name),
        },
        {
          prepareFile,
          getSession: () => supabase.auth.getSession(),
        }
      )
      if (request === requestVersion.current) setSuggestions(rows)
    } catch (error) {
      if (request === requestVersion.current)
        toast.error(
          error?.message ||
            'No se pudieron detectar los diseños. Intenta de nuevo.'
        )
    } finally {
      if (request === requestVersion.current) {
        setBusy(false)
        options.setOptions({ uploading: false })
      }
    }
  }
  const selectBulkPhotos = (files) => {
    try {
      matchDesignPhotos(files, options.designs)
      setBulkFiles(Array.from(files))
    } catch (error) {
      toast.error(error.message)
    }
  }
  const bulkPlan = matchDesignPhotos(bulkFiles, options.designs)
  const copy = async () => {
    const request = ++requestVersion.current
    setBusy(true)
    options.setOptions({ uploading: true })
    try {
      const result = await fetchProductOptions(sourceId, businessId)
      if (request !== requestVersion.current) return
      if (result.error) throw result.error
      const existing = new Set(
        options.designs.map((row) => row.name.trim().toLowerCase())
      )
      const additions = copyDesigns(result.designs).filter(
        (row) => !existing.has(row.name.trim().toLowerCase())
      )
      options.setOptions({ designs: [...options.designs, ...additions] })
      toast.success('Diseños copiados; los nombres repetidos se omitieron')
    } catch (error) {
      if (request === requestVersion.current)
        toast.error(`Error al copiar: ${error.message}`)
    } finally {
      if (request === requestVersion.current) {
        setBusy(false)
        options.setOptions({ uploading: false })
      }
    }
  }
  return (
    <fieldset disabled={disabled || busy} className='min-w-0 space-y-5'>
      {['presentations', 'designs'].map((key) => (
        <section
          key={key}
          className='min-w-0 space-y-3 rounded-xl border border-gray-200 p-3'
        >
          <h3 className='font-semibold text-gray-800'>
            {key === 'presentations' ? 'Presentaciones' : 'Diseños para elegir'}
          </h3>
          {key === 'presentations' && (
            <p className='text-xs text-gray-500'>
              Sin presentaciones, el producto se vende con su precio habitual.
              Con presentaciones activas, el precio del catálogo se guarda como
              el precio de la presentación más económica, no por pieza.
              {options.presentations.some((row) => row.is_active !== false)
                ? ` Precio del catálogo: ${formatPresentationMoney(presentationPrice(options.presentations))}.`
                : ''}
            </p>
          )}
          {key === 'designs' && (
            <div className='space-y-3'>
              <p className='text-xs text-gray-500'>
                Una sola foto principal puede mostrar todos los diseños. Las
                fotos individuales son opcionales; numera la foto en el orden de
                los diseños activos.
              </p>
              <button
                type='button'
                className={button}
                disabled={!mainImage?.file && !mainImage?.url}
                onClick={detect}
              >
                Detectar diseños en la foto
              </button>
              {suggestions && (
                <div
                  className='space-y-2 rounded-xl border border-gray-200 p-3'
                  aria-label='Diseños sugeridos'
                >
                  <p role='status' className='text-sm'>
                    {suggestions.length
                      ? 'Revisa los nombres y selecciona los diseños que deseas agregar.'
                      : 'No se encontraron diseños nuevos. Puedes agregarlos manualmente.'}
                  </p>
                  {suggestions.map((row, index) => (
                    <div key={index} className='flex items-center gap-2'>
                      <input
                        type='checkbox'
                        aria-label={`Seleccionar sugerencia ${index + 1}`}
                        checked={row.checked}
                        onChange={(event) =>
                          setSuggestions((previous) =>
                            previous.map((item, i) =>
                              i === index
                                ? { ...item, checked: event.target.checked }
                                : item
                            )
                          )
                        }
                      />
                      <input
                        className={input}
                        aria-label={`Nombre sugerido ${index + 1}`}
                        maxLength={60}
                        value={row.name}
                        onChange={(event) =>
                          setSuggestions((previous) =>
                            previous.map((item, i) =>
                              i === index
                                ? { ...item, name: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  ))}
                  <button
                    type='button'
                    className={button}
                    disabled={
                      !suggestions.some((row) => row.checked && row.name.trim())
                    }
                    onClick={() => {
                      options.setOptions({
                        designs: appendDetectedDesigns(
                          options.designs,
                          suggestions
                        ),
                      })
                      setSuggestions(null)
                    }}
                  >
                    Agregar seleccionados
                  </button>
                  <button
                    type='button'
                    className={button}
                    onClick={() => setSuggestions(null)}
                  >
                    Descartar sugerencias
                  </button>
                </div>
              )}
              <label className='block text-sm font-medium'>
                Subir fotos de diseños
                <input
                  type='file'
                  accept='image/*,.heic,.heif'
                  multiple
                  className={`${input} mt-1 py-2`}
                  onChange={(event) => {
                    selectBulkPhotos(event.target.files || [])
                    event.target.value = ''
                  }}
                />
              </label>
              {bulkFiles.length > 0 && (
                <div className='space-y-2 rounded-xl border border-gray-200 p-3'>
                  <p role='status' className='text-sm'>
                    {bulkPlan.assigned}{' '}
                    {bulkPlan.assigned === 1 ? 'asignada' : 'asignadas'},{' '}
                    {bulkPlan.created}{' '}
                    {bulkPlan.created === 1 ? 'nueva' : 'nuevas'}
                  </p>
                  <p className='text-xs text-gray-500'>
                    Los nombres de archivo se comparan con los diseños. Las
                    fotos reemplazan las existentes y se suben al guardar el
                    producto.
                  </p>
                  <button
                    type='button'
                    className={button}
                    onClick={() => {
                      options.setOptions({
                        designs: applyDesignPhotos(options.designs, bulkPlan),
                      })
                      setBulkFiles([])
                    }}
                  >
                    Aplicar fotos
                  </button>
                  <button
                    type='button'
                    className={button}
                    onClick={() => setBulkFiles([])}
                  >
                    Cancelar fotos
                  </button>
                </div>
              )}
            </div>
          )}
          {options[key].map((row, index) => (
            <div
              key={row.id || index}
              className='min-w-0 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3'
            >
              <label className='block text-xs text-gray-600'>
                {key === 'designs' && row.is_active !== false
                  ? `${options.designs.slice(0, index + 1).filter((item) => item.is_active !== false).length} · Nombre`
                  : 'Nombre'}
                <input
                  required
                  className={`${input} mt-1`}
                  value={key === 'presentations' ? row.label : row.name}
                  onChange={(event) =>
                    update(key, index, {
                      [key === 'presentations' ? 'label' : 'name']:
                        event.target.value,
                    })
                  }
                />
              </label>
              {key === 'presentations' ? (
                <div className='grid grid-cols-2 gap-2'>
                  <label className='text-xs text-gray-600'>
                    Unidades
                    <input
                      required
                      type='number'
                      min='1'
                      step='1'
                      className={`${input} mt-1`}
                      value={row.units}
                      onChange={(event) =>
                        update(key, index, { units: event.target.value })
                      }
                    />
                  </label>
                  <label className='text-xs text-gray-600'>
                    Precio (C$)
                    <input
                      required
                      type='number'
                      min='0'
                      step='0.01'
                      className={`${input} mt-1`}
                      value={row.price}
                      onChange={(event) =>
                        update(key, index, { price: event.target.value })
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className='space-y-2'>
                  {(row.image_url || row.imageFile) && (
                    <div className='flex items-center gap-2'>
                      <DesignPhoto row={row} />
                      <button
                        className={button}
                        type='button'
                        onClick={() =>
                          update(key, index, {
                            image_url: null,
                            imageFile: null,
                          })
                        }
                      >
                        Quitar foto
                      </button>
                    </div>
                  )}
                  <label className='block text-xs text-gray-600'>
                    Foto opcional
                    <input
                      type='file'
                      accept='image/*,.heic,.heif'
                      className={`${input} mt-1 py-2`}
                      onChange={(event) =>
                        event.target.files?.[0] &&
                        update('designs', index, {
                          imageFile: event.target.files[0],
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <div className='flex flex-wrap items-center gap-2'>
                <label className='flex min-h-10 items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={row.is_active !== false}
                    onChange={(event) =>
                      update(key, index, { is_active: event.target.checked })
                    }
                  />
                  Activo
                </label>
                <button
                  type='button'
                  className={button}
                  aria-label={`Subir ${key === 'presentations' ? row.label : row.name}`}
                  disabled={index === 0}
                  onClick={() =>
                    options.setOptions({
                      [key]: moveOption(options[key], index, -1),
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type='button'
                  className={button}
                  aria-label={`Bajar ${key === 'presentations' ? row.label : row.name}`}
                  disabled={index === options[key].length - 1}
                  onClick={() =>
                    options.setOptions({
                      [key]: moveOption(options[key], index, 1),
                    })
                  }
                >
                  ↓
                </button>
                <button
                  type='button'
                  className={`${button} text-red-600`}
                  onClick={() =>
                    options.setOptions({
                      [key]: options[key].filter((_, i) => i !== index),
                    })
                  }
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          <button
            type='button'
            className={button}
            onClick={() =>
              options.setOptions({
                [key]: [
                  ...options[key],
                  key === 'presentations'
                    ? { label: '', units: 1, price: '', is_active: true }
                    : { name: '', image_url: null, is_active: true },
                ],
              })
            }
          >
            {key === 'presentations'
              ? 'Agregar presentación'
              : 'Agregar diseño'}
          </button>
        </section>
      ))}
      <div className='min-w-0 space-y-2'>
        <label className='block text-sm font-medium'>
          Copiar diseños de otro producto
          <select
            className={`${input} mt-1`}
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            <option value=''>Selecciona un producto</option>
            {products
              .filter((row) => row.id !== productId)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className={button}
          type='button'
          disabled={!sourceId}
          onClick={copy}
        >
          Copiar diseños
        </button>
      </div>
      {busy && (
        <p role='status' className='text-sm text-gray-500'>
          Procesando diseños...
        </p>
      )}
    </fieldset>
  )
}
