import { useEffect, useRef, useState } from 'react'
import { fetchPublicPresentations } from '../data/productPresentations'
import { getImageUrl } from '../utils/getImageUrl'
import {
  catalogFilenames,
  chooseCatalogDelivery,
  selectVisibleProducts,
} from '../utils/whatsappCatalog.js'
import { createCatalogCard } from '../utils/catalogCanvas.js'
import {
  shareCatalogFiles,
  saveCatalogToFolder,
  downloadCatalogFiles,
} from '../utils/catalogDelivery.js'

export default function WhatsAppCatalog({
  products,
  visibleProducts,
  selectedIds,
  onSelectionChange,
  onCancel,
  businessId,
}) {
  const [includePrice, setIncludePrice] = useState(true)
  const [cards, setCards] = useState([])
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [delivering, setDelivering] = useState(false)
  const [shareInChunks, setShareInChunks] = useState(false)
  const generation = useRef(0)
  const previewUrls = useRef([])
  const running = useRef(false)
  const selected = products.filter((product) =>
    selectedIds.includes(product.id)
  )
  const files = cards.map((card) => card.file)
  const capabilities =
    typeof navigator === 'undefined'
      ? {}
      : {
          canShare: navigator.canShare?.bind(navigator),
          share: navigator.share?.bind(navigator),
          showDirectoryPicker:
            typeof window !== 'undefined'
              ? window.showDirectoryPicker?.bind(window)
              : undefined,
        }
  const delivery = chooseCatalogDelivery(
    files,
    capabilities,
    shareInChunks ? 10 : Infinity
  )

  useEffect(() => {
    generation.current += 1
    running.current = false
    setCards([])
    setProgress(null)
    setError('')
    setShareInChunks(false)
    return () => {
      generation.current += 1
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
      previewUrls.current = []
    }
  }, [selectedIds, includePrice, businessId, products])

  const generate = async () => {
    if (running.current || !selected.length) return
    running.current = true
    const request = ++generation.current
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current = []
    setCards([])
    setError('')
    setProgress({ current: 1, total: selected.length })
    try {
      // Existing read-only, business-scoped batch; no product or option is saved.
      const result = includePrice
        ? await fetchPublicPresentations(
            businessId,
            selected.map((product) => product.id)
          )
        : { data: [] }
      if (request !== generation.current) return
      if (result.error)
        throw new Error('No se pudieron cargar los precios. Intente de nuevo.')
      const names = catalogFilenames(selected)
      const generated = []
      for (let index = 0; index < selected.length; index += 1) {
        if (request !== generation.current) return
        const product = selected[index]
        setProgress({ current: index + 1, total: selected.length })
        // Yield a frame so progress can paint before canvas drawing begins.
        await new Promise((resolve) => requestAnimationFrame(resolve))
        if (request !== generation.current) return
        const rendered = await createCatalogCard(
          product,
          (result.data || []).filter((row) => row.product_id === product.id),
          { includePrice, resolveImageUrl: getImageUrl }
        )
        if (request !== generation.current) return
        const file = new File([rendered.blob], names[index], {
          type: 'image/jpeg',
        })
        const url = URL.createObjectURL(file)
        previewUrls.current.push(url)
        generated.push({
          file,
          url,
          name: product.name,
          missingPhotos: rendered.missingPhotos,
        })
      }
      setCards(generated)
    } catch (failure) {
      if (request === generation.current) {
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
        previewUrls.current = []
        setError(
          failure.message ||
            'No se pudieron generar las imágenes. Intente de nuevo.'
        )
      }
    } finally {
      if (request === generation.current) {
        running.current = false
        setProgress(null)
      }
    }
  }

  const deliver = async (operation, sharedFiles) => {
    if (delivering) return
    setDelivering(true)
    setError('')
    try {
      await operation()
    } catch {
      if (sharedFiles?.length > 10) {
        setShareInChunks(true)
        setError(
          'No se pudo compartir el lote completo. Intente compartir por grupos o descargar las imágenes.'
        )
      } else
        setError(
          'No se pudieron entregar las imágenes. Puede intentar con Descargar imágenes.'
        )
    } finally {
      setDelivering(false)
    }
  }
  const missing = cards.filter((card) => card.missingPhotos)

  return (
    <section aria-label='Catálogo para WhatsApp' className='mt-6'>
      {cards.length > 0 && (
        <div
          id='catalog-previews'
          className='shadow-soft scroll-mt-40 rounded-2xl bg-white p-4 sm:p-6'
        >
          <h2 className='text-lg font-semibold text-gray-800'>
            Catálogo para WhatsApp
          </h2>
          <p className='mt-1 text-sm text-gray-500'>
            {cards.length} imágenes listas. Revise las tarjetas antes de
            enviarlas.
          </p>
          {missing.length > 0 && (
            <p
              role='status'
              className='mt-3 text-sm break-words text-amber-800'
            >
              Fotos no disponibles:{' '}
              {missing.map((card) => card.name).join(', ')}. Se usaron
              marcadores de posición.
            </p>
          )}
          <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
            {cards.map((card) => (
              <figure key={card.file.name} className='min-w-0'>
                <img
                  src={card.url}
                  alt={`Tarjeta de ${card.name}`}
                  width='1080'
                  height='1350'
                  className='aspect-[4/5] w-full rounded-xl border border-gray-200 object-contain'
                />
                <figcaption className='mt-1 text-xs break-words text-gray-500'>
                  {card.name}
                </figcaption>
              </figure>
            ))}
          </div>
          <div className='mt-4 flex flex-wrap gap-2'>
            {delivery.kind === 'share' &&
              delivery.chunks.map((chunk) => (
                <button
                  key={chunk.label}
                  type='button'
                  disabled={delivering}
                  onClick={() =>
                    deliver(() => shareCatalogFiles(chunk.files), chunk.files)
                  }
                  className='min-h-11 rounded-xl bg-[#237a42] px-4 py-2 font-semibold text-white disabled:opacity-50'
                >
                  {delivery.chunks.length === 1
                    ? 'Compartir en WhatsApp'
                    : `Compartir ${chunk.label}`}
                </button>
              ))}
            {delivery.kind === 'folder' && (
              <button
                type='button'
                disabled={delivering}
                onClick={() => deliver(() => saveCatalogToFolder(files))}
                className='min-h-11 rounded-xl bg-[#237a42] px-4 py-2 font-semibold text-white disabled:opacity-50'
              >
                Guardar en carpeta
              </button>
            )}
            <button
              type='button'
              disabled={delivering}
              onClick={() => deliver(() => downloadCatalogFiles(files))}
              className='min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-800 disabled:opacity-50'
            >
              Descargar imágenes
            </button>
          </div>
          <p className='mt-2 text-xs text-gray-500'>
            Si se lo solicita el navegador, permita descargar varios archivos.
          </p>
        </div>
      )}
      <div aria-hidden='true' className='h-80 sm:h-56' />
      <div
        className='fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[55dvh] max-w-7xl overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-4 shadow-lg'
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h2 className='font-semibold text-gray-800'>
            {selected.length} seleccionados
          </h2>
          {cards.length > 0 && (
            <a
              href='#catalog-previews'
              className='min-h-11 py-3 text-sm font-medium text-[#237a42] underline'
            >
              {cards.length} imágenes listas · Ver imágenes
            </a>
          )}
          <button
            type='button'
            onClick={onCancel}
            className='min-h-11 rounded-lg px-3 text-sm font-medium text-gray-700'
          >
            Cancelar
          </button>
        </div>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          <button
            type='button'
            disabled={!!progress || delivering || !visibleProducts.length}
            onClick={() =>
              onSelectionChange((previous) =>
                selectVisibleProducts(previous, visibleProducts)
              )
            }
            className='min-h-11 text-left text-sm font-medium text-[#237a42] disabled:opacity-50'
          >
            Seleccionar todos (visibles con el filtro actual)
          </button>
          <button
            type='button'
            disabled={!!progress || delivering || !selected.length}
            onClick={() => onSelectionChange([])}
            className='min-h-11 px-2 text-sm text-gray-600 disabled:opacity-50'
          >
            Limpiar
          </button>
          <label className='flex min-h-11 items-center gap-2 text-sm text-gray-700'>
            <input
              type='checkbox'
              checked={includePrice}
              disabled={!!progress || delivering}
              onChange={(event) => setIncludePrice(event.target.checked)}
              className='h-5 w-5 accent-[#237a42]'
            />
            Incluir precio
          </label>
        </div>
        <button
          type='button'
          disabled={!selected.length || !!progress || delivering}
          onClick={generate}
          className='min-h-11 w-full rounded-xl bg-[#237a42] px-4 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto'
        >
          Generar imágenes
        </button>
        {error && (
          <p
            role='alert'
            className='mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700'
          >
            {error}
          </p>
        )}
        {progress && (
          <p
            role='status'
            aria-live='polite'
            className='mt-2 text-sm text-gray-600'
          >
            Generando {progress.current} de {progress.total}…
          </p>
        )}
      </div>
    </section>
  )
}
