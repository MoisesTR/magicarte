import { useEffect, useRef, useState } from 'react'
import { createGalleryPreview, fromFiles, makeMain, move, remove } from '../utils/productGallery.js'

function GalleryPhoto({ item, index, prepareFile, resolveUrl }) {
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!item.file) return
    let active = true
    const resource = createGalleryPreview(item.file, { prepareFile })
    resource.ready.then(url => { if (active) setPreview(url) }).catch(() => {
      if (active) setPreview(null)
    })
    return () => { active = false; resource.dispose() }
  }, [item.file, prepareFile])
  const src = item.file ? preview : resolveUrl(item.url)
  return src ? (
    <img src={src} alt={`Foto ${index + 1}`} className='aspect-square w-full object-cover' />
  ) : (
    <div className='flex aspect-square items-center justify-center px-2 text-center text-xs text-gray-500'>Vista previa no disponible</div>
  )
}

export default function ProductGallery({ items, onChange, prepareFile, resolveUrl, disabled = false }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)
  const addFiles = files => {
    if (disabled) return
    const photos = Array.from(files).filter(file => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (photos.length) onChange(current => [...current, ...fromFiles(photos, crypto.randomUUID())])
  }
  return (
    <fieldset disabled={disabled} className='min-w-0'>
      <legend className='mb-2 text-sm font-medium text-gray-700'>Fotos del producto</legend>
      <p className='mb-3 text-xs text-gray-500'>La primera foto es la principal. Usa las flechas para ordenar las fotos.</p>
      <div className='grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3'>
        {items.map((item, index) => (
          <div key={item.id} className={`min-w-0 overflow-hidden rounded-xl border ${index === 0 ? 'border-[#51c879]' : 'border-gray-200'}`}>
            <div className='relative'>
              <GalleryPhoto item={item} index={index} prepareFile={prepareFile} resolveUrl={resolveUrl} />
              {index === 0 && <span className='absolute bottom-1 left-1 rounded bg-[#237a42] px-2 py-1 text-xs font-semibold text-white'>Principal</span>}
              <button
                type='button'
                aria-label={`Eliminar foto ${index + 1}`}
                onClick={() => onChange(current => remove(current, index))}
                className='absolute right-1 top-1 flex min-h-8 min-w-8 items-center justify-center rounded-full bg-red-600 text-lg text-white hover:bg-red-700'
              >×</button>
            </div>
            <div className='space-y-1 p-2'>
              {index > 0 && (
                <button type='button' onClick={() => onChange(current => makeMain(current, index))} className='min-h-8 w-full rounded-md border border-gray-300 px-1 text-xs font-semibold text-gray-700 hover:bg-gray-50'>Hacer principal</button>
              )}
              <div className='flex gap-1'>
                <button type='button' disabled={index === 0 || disabled} aria-label={`Mover foto ${index + 1} a la izquierda`} onClick={() => onChange(current => move(current, index, index - 1))} className='min-h-8 min-w-8 flex-1 rounded-md border border-gray-300 text-gray-700 disabled:opacity-30'>←</button>
                <button type='button' disabled={index === items.length - 1 || disabled} aria-label={`Mover foto ${index + 1} a la derecha`} onClick={() => onChange(current => move(current, index, index + 1))} className='min-h-8 min-w-8 flex-1 rounded-md border border-gray-300 text-gray-700 disabled:opacity-30'>→</button>
              </div>
            </div>
          </div>
        ))}
        <button
          type='button'
          onClick={() => input.current?.click()}
          onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}
          className={`flex min-h-32 min-w-0 flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center text-sm text-gray-600 ${dragging ? 'border-[#51c879] bg-green-50' : 'border-gray-300 hover:border-[#51c879]'}`}
        >
          <span aria-hidden='true' className='text-2xl'>+</span>
          <span>Agregar fotos</span>
          <span className='mt-1 text-xs text-gray-400'>Toca o arrastra aquí</span>
          <span className='mt-1 text-xs text-gray-400'>JPG, PNG, HEIC y HEIF</span>
        </button>
      </div>
      <input ref={input} type='file' accept='image/*,.heic,.heif' multiple className='hidden' onChange={event => { addFiles(event.target.files); event.target.value = '' }} />
    </fieldset>
  )
}
