import WhatsAppCatalog from '../components/WhatsAppCatalog'
import { toggleCatalogSelection } from '../utils/whatsappCatalog.js'
import ProductOptionsEditor from '../components/ProductOptionsEditor'
import { useProductOptionsEditor } from '../hooks/useProductOptions'
import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'
import { getImageUrl } from '../utils/getImageUrl'
import { prepareFile, uploadCompressedImage } from '../utils/uploadImage'
import { createPhotoDraft } from '../utils/productPhotoDraft'
import { formatPresentationMoney } from '../utils/productPresentations'
import { productPriceDisplay } from '../utils/productPriceDisplay.js'
import { productPricePayload } from '../utils/productPricePayload.js'
import { fromFiles, fromProduct, uploadGallery } from '../utils/productGallery'
import ProductGallery from '../components/ProductGallery'
import ProductVideoField from '../components/ProductVideoField'
import ProductTextField from '../components/ProductTextField'
import ProductMaterialPreset from '../components/ProductMaterialPreset'
import { storefrontProductPath } from '../utils/storefrontRoutes.js'
import { productTextContext } from '../utils/productTextEnhance'
import { useBusiness } from '../context/BusinessContext'
import { businessFilter } from '../data/scope'
import {
  fetchProductsForBusiness,
  createProduct,
  updateProduct,
  setProductVisibility,
  deleteProduct as deleteProductRow,
} from '../data/products'
import AdminLogin from '../components/AdminLogin'
import CategoryManager from '../components/CategoryManager'
import toast from 'react-hot-toast'
import { fetchCalcQuote, fetchProductForQuote } from '../data/calcQuotes'
import { newProductForm, productFormFromQuote } from '../utils/quoteForms'

export default function Admin() {
  const location = useLocation()
  const navigate = useNavigate()
  const quoteId = new URLSearchParams(location.search).get('cotizacion')
  const handledQuote = useRef(null)
  const quoteRequest = useRef(0)
  const [sourceQuote, setSourceQuote] = useState(null)
  const [existingQuoteProduct, setExistingQuoteProduct] = useState(null)
  const { currentBusinessId, currentBusiness } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [products, setProducts] = useState([])
  const [catalogMode, setCatalogMode] = useState(false)
  const [catalogSelectedIds, setCatalogSelectedIds] = useState([])
  useEffect(() => {
    setCatalogMode(false)
    setCatalogSelectedIds([])
  }, [currentBusinessId])
  const [showForm, setShowForm] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const productOptions = useProductOptionsEditor(editingProduct?.id, currentBusinessId, showForm)
  const resetProductOptions = productOptions.reset
  const [loading, setLoading] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [draftFiles, setDraftFiles] = useState([])
  const [draftNote, setDraftNote] = useState('')
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [draggingDraft, setDraggingDraft] = useState(false)
  const [fromPhotoDraft, setFromPhotoDraft] = useState(false)
  const draftInput = useRef(null)
  const draftRunning = useRef(false)
  const activeBusinessId = useRef(currentBusinessId)
  activeBusinessId.current = currentBusinessId

  // Form state
  const [formData, setFormData] = useState(newProductForm)
  const [gallery, setGallery] = useState([])
  const [videoUploading, setVideoUploading] = useState(false)
  const videoBusy = useRef(false)

  // Fetch data
  const { data: categoriesData = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    filters: businessFilter(currentBusinessId),
    order: { column: 'order' }
  })

  const selectDraftPhotos = (files) => {
    if (draftRunning.current) return
    const selected = Array.from(files)
    const photos = selected.filter(file => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (photos.length !== selected.length) toast.error('Solo se aceptan fotos. Se omitieron otros archivos.')
    setDraftFiles(photos)
  }

  const handlePhotoDraft = async () => {
    if (draftRunning.current || !draftFiles.length) return
    draftRunning.current = true
    setGeneratingDraft(true)
    const request = ++quoteRequest.current
    const businessId = currentBusinessId
    try {
      const result = await createPhotoDraft({ files: draftFiles, note: draftNote, categories: categoriesData }, {
        prepareFile,
        getSession: () => supabase.auth.getSession(),
      })
      // Do not overwrite a form opened later or carry a draft into another business.
      if (request !== quoteRequest.current || businessId !== activeBusinessId.current) return
      setSourceQuote(null)
      setExistingQuoteProduct(null)
      setEditingProduct(null)
      productOptions.reset()
      setFromPhotoDraft(true)
      setFormData(result.formData)
      setGallery(fromFiles([result.imageFiles.main, ...result.imageFiles.secondary].filter(Boolean), crypto.randomUUID()))
      setShowForm(true)
      setDraftFiles([])
      setDraftNote('')
      if (result.error) toast.error(result.error)
      else toast.success('Borrador listo: revise y agregue el precio')
    } finally {
      draftRunning.current = false
      setGeneratingDraft(false)
    }
  }

  const fetchProducts = async () => {
    setLoadingProducts(true)
    try {
      const { data, error } = await fetchProductsForBusiness(currentBusinessId)

      if (error) {
        toast.error(`Error al cargar productos: ${error.message}`)
      } else {
        setProducts(data || [])
      }
    } catch {
      toast.error('Error inesperado al cargar productos')
    } finally {
      setLoadingProducts(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (videoBusy.current || loading) return
    setLoading(true)

    try {
      productOptions.validate()
      const pricing = productPricePayload(formData, productOptions.hasPresentations ? productOptions.price(formData.price) : formData.price)
      const imagePayload = await uploadGallery(gallery, uploadCompressedImage)

      const productData = {
        ...formData,
        ...pricing,
        stock_quantity: parseInt(formData.stock_quantity),
        width: formData.width === '' ? null : parseFloat(formData.width),
        length: formData.length === '' ? null : parseFloat(formData.length),
        ...imagePayload
      }

      let result
      if (editingProduct) {
        result = await updateProduct(editingProduct.id, productData)
      } else {
        if (sourceQuote) productData.calc_quote_id = sourceQuote.id
        result = await createProduct(productData, currentBusinessId)
      }

      if (result.error) {

        // Mensaje específico para errores de permisos
        if (result.error.message?.includes('row-level security') || result.error.code === '42501') {
          toast.error('Error de permisos: Configura las políticas de Supabase para la tabla "products".')
        } else {
          toast.error(`Error al guardar el producto: ${result.error.message}`)
        }
      } else {
        const savedId = editingProduct?.id || result.data?.[0]?.id
        await productOptions.save(savedId)
        if (!editingProduct && sourceQuote) {
          const params = new URLSearchParams(location.search)
          params.delete('cotizacion')
          params.delete('entrega')
          navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true })
        }
        if (result.priceModeAvailable === false && pricing.price_mode !== 'fixed') {
          toast.error('Producto guardado con precio fijo. Aplique la migración antes de publicar precios «Desde» o «A cotizar».')
        } else if (result.videoAvailable === false && productData.video_url) {
          toast.error('Producto guardado sin video. Aplique la migración antes de agregar videos.')
        } else toast.success(editingProduct ? 'Producto actualizado!' : 'Producto creado!')
        resetForm()
        fetchProducts()
      }
    } catch (error) {
      toast.error(error.message || 'Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const toggleVisibility = async (product) => {
    const { error } = await setProductVisibility(product.id, !product.is_visible)
    if (error) {
      toast.error('Error al actualizar visibilidad')
    } else {
      toast.success(product.is_visible ? 'Producto ocultado' : 'Producto publicado')
      fetchProducts()
    }
  }

  const resetForm = () => {
    productOptions.reset()
    quoteRequest.current += 1
    setSourceQuote(null)
    setExistingQuoteProduct(null)
    setFromPhotoDraft(false)
    setFormData(newProductForm())
    setGallery([])
    setEditingProduct(null)
    setShowForm(false)
  }

  const editProduct = (product) => {
    quoteRequest.current += 1
    setSourceQuote(null)
    setExistingQuoteProduct(null)
    setFromPhotoDraft(false)
    setFormData({
      name: product.name || '',
      price: product.price ?? '',
      price_mode: productPriceDisplay(product).mode,
      description: product.description || '',
      category_id: product.category_id || '',
      width: product.width || '',
      length: product.length || '',
      stock_quantity: product.stock_quantity || 1,
      image_url: product.image_url || '',
      video_url: product.video_url || null,
      secondary_images: product.secondary_images || [],
      material_technique: product.material_technique || '',
      care_instructions: product.care_instructions || '',
      is_visible: product.is_visible !== false
    })
    setGallery(fromProduct(product))
    setEditingProduct(product)
    setShowForm(true)
  }

  const deleteProduct = async (id) => {
    const { error } = await deleteProductRow(id)

    if (error) {
      toast.error('Error al eliminar el producto')
    } else {
      toast.success('Producto eliminado')
      setConfirmDeleteId(null)
      fetchProducts()
    }
  }

  // Effects
  useEffect(() => {
    // Verificar si hay usuario autenticado
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setCheckingAuth(false)

    }

    checkUser()
  }, [])

  // Fetch only once we know the user AND the real business id; refetch on switch.
  useEffect(() => {
    if (user && currentBusinessId) fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, user])

  useEffect(() => {
    quoteRequest.current += 1
    setDraftFiles([])
    setDraftNote('')
  }, [currentBusinessId])

  useEffect(() => {
    if (!user || !currentBusinessId || currentBusiness.slug !== 'magicarte' || !quoteId) return
    const key = `${currentBusinessId}:${quoteId}`
    if (handledQuote.current === key) return
    let ignore = false
    const request = ++quoteRequest.current
    const isCurrent = () => !ignore && request === quoteRequest.current

    const loadQuote = async () => {
      try {
        const { data: quote, error } = await fetchCalcQuote(quoteId, currentBusinessId)
        if (!isCurrent()) return
        if (error || !quote) {
          handledQuote.current = key
          toast.error('No se encontró la cotización')
          return
        }
        const { data: product, error: productError } = await fetchProductForQuote(quoteId, currentBusinessId)
        if (!isCurrent()) return
        // The duplicate notice is best-effort; it must never block the prefilled form.
        handledQuote.current = key
        resetProductOptions()
        setFromPhotoDraft(false)
        setFormData(productFormFromQuote(quote))
        setEditingProduct(null)
        setGallery([])
        setSourceQuote(quote)
        setExistingQuoteProduct(productError ? null : product)
        setShowForm(true)
      } catch {
        if (isCurrent()) {
          handledQuote.current = key
          toast.error('No se pudo completar el formulario desde la cotización')
        }
      }
    }
    loadQuote()
    return () => { ignore = true }
  }, [user, currentBusinessId, currentBusiness.slug, quoteId, resetProductOptions])

  const handleLogin = (userData) => {
    setUser(userData)
    fetchProducts()
  }

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879] mx-auto mb-4'></div>
          <p className='text-gray-600'>Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!user) {
    return <AdminLogin onLogin={handleLogin} />
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-7xl mx-auto px-4'>

        {/* Header */}
        <div className='admin-page-header bg-white rounded-2xl shadow-soft p-4 sm:p-6 mb-6'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold text-gray-800'>Productos</h1>
              <p className='text-gray-500 text-sm mt-1'>{currentBusiness?.name} · {user.email}</p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <button type='button' disabled={catalogMode || loadingProducts} onClick={() => { setCatalogSelectedIds([]); setConfirmDeleteId(null); setCatalogMode(true) }} className='min-h-11 rounded-xl border border-[#237a42] px-4 py-2.5 text-sm font-semibold text-[#237a42] disabled:opacity-50'>Crear catálogo</button>
              <button
                onClick={() => { resetForm(); setShowForm(true) }}
                className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm'
              >
                + Nuevo Producto
              </button>
	              <button
	                onClick={() => setShowCategoryManager(true)}
                className='bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors'
              >
                📁 Categorías
              </button>
            </div>
          </div>
        </div>

        {/* Photo draft: originals stay local until the existing save flow uploads them. */}
        <section aria-labelledby='photo-draft-title' className='mb-6 rounded-2xl bg-white p-4 shadow-soft sm:p-6'>
          <h2 id='photo-draft-title' className='font-semibold text-gray-800'>Crear borrador desde fotos</h2>
          <p id='photo-draft-help' className='mt-1 text-sm text-gray-500'>
            Seleccione varias fotos de un solo producto. La IA analiza hasta 6; todas se adjuntan al borrador y se suben solo al guardar.
          </p>
          <fieldset disabled={generatingDraft} aria-busy={generatingDraft} className='mt-4 space-y-3 disabled:opacity-60'>
            <button
              type='button'
              aria-describedby='photo-draft-help'
              className={`w-full rounded-xl border-2 border-dashed p-5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${draggingDraft ? 'border-[#51c879] bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-600 hover:border-[#51c879]'}`}
              onClick={() => draftInput.current?.click()}
              onDragOver={(event) => { event.preventDefault(); if (!draftRunning.current) setDraggingDraft(true) }}
              onDragLeave={() => setDraggingDraft(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDraggingDraft(false)
                selectDraftPhotos(event.dataTransfer.files)
              }}
            >
              {draggingDraft ? 'Suelta las fotos aquí' : 'Seleccionar fotos o arrastrarlas aquí'}
              <span className='mt-1 block text-xs text-gray-400'>JPG, PNG, HEIC y HEIF · varias fotos del mismo producto</span>
            </button>
            <input
              ref={draftInput}
              type='file'
              accept='image/*,.heic,.heif'
              multiple
              className='hidden'
              onChange={(event) => { selectDraftPhotos(event.target.files); event.target.value = '' }}
            />
            {draftFiles.length > 0 && (
              <p className='break-words text-sm text-gray-600'>
                {draftFiles.length} foto{draftFiles.length !== 1 ? 's' : ''}: {draftFiles.map(file => file.name).join(', ')}
              </p>
            )}
            <div>
              <label htmlFor='photo-draft-note' className='mb-1 block text-sm font-medium text-gray-700'>Notas para la IA (opcional)</label>
              <input
                id='photo-draft-note'
                type='text'
                value={draftNote}
                maxLength={1000}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder='Ej.: acrílico 3 mm, corte láser, 20 × 15 cm, se personaliza con nombre'
                className='w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#51c879]'
              />
            </div>
            <button
              type='button'
              onClick={handlePhotoDraft}
              disabled={generatingDraft || !draftFiles.length}
              className='rounded-xl bg-gradient-to-r from-[#51c879] to-[#50bfe6] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60'
            >
              {generatingDraft ? 'Analizando fotos...' : 'Crear borrador desde fotos'}
            </button>
            {generatingDraft && <p role='status' className='text-sm text-gray-500'>Analizando fotos...</p>}
          </fieldset>
        </section>

        {/* Search + count */}
        <div className='flex flex-col sm:flex-row sm:items-center gap-3 mb-4'>
          <input
            type='text'
            placeholder='Buscar producto...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm'
          />
          <p className='text-sm text-gray-500 whitespace-nowrap'>
            {loadingProducts ? 'Cargando...' : `${filteredProducts.length} producto${filteredProducts.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Products Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>

          {/* Loading skeletons */}
          {loadingProducts && Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className='bg-white rounded-2xl shadow-soft overflow-hidden animate-pulse'>
              <div className='aspect-square bg-gray-200' />
              <div className='p-4 space-y-2'>
                <div className='h-4 bg-gray-200 rounded w-3/4' />
                <div className='h-3 bg-gray-200 rounded w-full' />
                <div className='h-3 bg-gray-200 rounded w-1/2' />
                <div className='h-8 bg-gray-200 rounded-lg mt-3' />
              </div>
            </div>
          ))}

          {/* Empty state */}
          {!loadingProducts && filteredProducts.length === 0 && (
            <div className='col-span-full flex flex-col items-center justify-center py-20 text-gray-400'>
              <svg className='w-14 h-14 mb-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' />
              </svg>
              <p className='font-semibold text-gray-500 text-lg'>
                {searchQuery ? 'No se encontraron productos' : 'No hay productos todavía'}
              </p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className='mt-2 text-sm text-[#51c879] hover:underline'>
                  Limpiar búsqueda
                </button>
              )}
            </div>
          )}

          {/* Product cards */}
          {!loadingProducts && filteredProducts.map((product) => (
            <div key={product.id} className={`bg-white rounded-2xl shadow-soft overflow-hidden transition-opacity ${product.is_visible === false ? 'opacity-50' : ''}`}>
              <div className='relative aspect-square bg-gray-50'>
                <img
                  src={getImageUrl(product.image_url)}
                  alt={product.name}
                  className='w-full h-full object-contain'
                />
                {product.is_visible === false && (
                  <div className='absolute top-2 left-2'>
                    <span className='bg-gray-800/80 text-white text-xs font-semibold px-2 py-1 rounded-lg'>Oculto</span>
                  </div>
                )}
                {catalogMode && <label className='absolute bottom-2 left-2 right-2 flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow'><input type='checkbox' checked={catalogSelectedIds.includes(product.id)} onChange={() => setCatalogSelectedIds(previous => toggleCatalogSelection(previous, product.id))} className='h-5 w-5 shrink-0 accent-[#237a42]' /><span className='min-w-0 break-words'>Seleccionar {product.name}</span></label>}
                {/* Inline delete confirmation */}
                {!catalogMode && (confirmDeleteId === product.id ? (
                  <div className='absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3 rounded-t-2xl'>
                    <p className='text-white font-semibold text-sm'>¿Eliminar este producto?</p>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => deleteProduct(product.id)}
                        className='bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-600 transition-colors'
                      >
                        Sí, eliminar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className='bg-white text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors'
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className='absolute top-2 right-2 flex gap-1.5'>
                    <button
                      onClick={() => toggleVisibility(product)}
                      className={`p-2 rounded-lg shadow transition-colors ${product.is_visible === false ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      title={product.is_visible === false ? 'Publicar' : 'Ocultar'}
                    >
                      {product.is_visible === false ? (
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21' />
                        </svg>
                      ) : (
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' />
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => editProduct(product)}
                      className='bg-white text-gray-600 p-2 rounded-lg shadow hover:bg-gray-50 transition-colors'
                      title='Editar'
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(product.id)}
                      className='bg-white text-red-500 p-2 rounded-lg shadow hover:bg-red-50 transition-colors'
                      title='Eliminar'
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
              <div className='p-4'>
                <h3 className='font-semibold text-gray-800 mb-1 line-clamp-1'>{product.name}</h3>
                {storefrontProductPath(currentBusiness?.slug, product.id) && (
                  <a href={storefrontProductPath(currentBusiness?.slug, product.id)} target='_blank' rel='noopener noreferrer' className='mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[#237a42] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2'>Ver en la tienda <span aria-hidden='true'>↗</span></a>
                )}
                <p className='text-gray-500 text-sm mb-3 line-clamp-2'>{product.description}</p>
                <div className='flex justify-between items-center mb-3'>
                  <span className='text-base font-bold text-gray-800'>{productPriceDisplay(product).label}</span>
                  <span className='text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full'>Stock: {product.stock_quantity}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {catalogMode && <WhatsAppCatalog key={currentBusinessId} products={products} visibleProducts={filteredProducts} selectedIds={catalogSelectedIds} onSelectionChange={setCatalogSelectedIds} onCancel={() => { setCatalogMode(false); setCatalogSelectedIds([]) }} businessId={currentBusinessId} />}

        {/* Category Manager Modal */}
        <CategoryManager 
          isOpen={showCategoryManager} 
          onClose={() => setShowCategoryManager(false)} 
        />

        {/* Form Modal */}
        {showForm && (
          <div className='admin-modal-backdrop'>
            <div role='dialog' aria-modal='true' aria-labelledby='product-form-title' className='admin-modal-panel max-w-2xl bg-white'>
              <div className='admin-modal-body p-6'>
                <div className='flex justify-between items-center mb-6'>
                  <h2 id='product-form-title' className='text-2xl font-bold text-gray-800'>
                    {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                  </h2>
                  <button
                    onClick={resetForm}
                    aria-label='Cerrar'
                    className='rounded-lg px-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 text-2xl'
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleSubmit} className='space-y-6'>
                  {editingProduct && storefrontProductPath(currentBusiness?.slug, editingProduct.id) && (
                    <a href={storefrontProductPath(currentBusiness?.slug, editingProduct.id)} target='_blank' rel='noopener noreferrer' className='inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[#237a42] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2'>Ver en la tienda <span aria-hidden='true'>↗</span></a>
                  )}
                  {sourceQuote && !editingProduct && (
                    <div role='status' className='rounded-xl bg-blue-50 p-3 text-sm text-blue-800'>
                      Completado desde la cotización «{sourceQuote.name}». Se guardará oculto: agregue la foto y actívelo cuando esté listo.
                      {existingQuoteProduct && (
                        <p className='mt-1'>Esta cotización ya tiene el producto «{existingQuoteProduct.name}»</p>
                      )}
                    </div>
                  )}

                  {fromPhotoDraft && (
                    <div role='status' className='rounded-xl bg-blue-50 p-3 text-sm text-blue-800'>
                      Revise el nombre, la descripción y la categoría, y agregue el precio. Se guardará oculto; las medidas son opcionales.
                    </div>
                  )}

                  {/* Basic Info */}
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Nombre del Producto
                      </label>
                      <input
                        type='text'
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                        placeholder='Ej: Cuadro personalizado para mamá con nombres'
                      />
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Precio (C$)
                      </label>
                      <input
                        type='number'
                        required={formData.price_mode !== 'quote'}
                        min='0'
                        step='0.01'
                        readOnly={productOptions.hasPresentations}
                        value={productOptions.hasPresentations ? productOptions.price(formData.price) : formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        aria-describedby={productOptions.hasPresentations ? 'price-from-presentations' : undefined}
                        className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent ${productOptions.hasPresentations ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                        placeholder='250.00'
                      />
                      {productOptions.hasPresentations && (
                        <p id='price-from-presentations' className='mt-1 text-xs text-gray-500'>
                          Se calcula de las presentaciones: desde {formatPresentationMoney(productOptions.price(formData.price))}. Cambie los precios en «Presentaciones».
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor='product-price-mode' className='mb-2 block text-sm font-medium text-gray-700'>Cómo mostrar el precio</label>
                    <select id='product-price-mode' value={formData.price_mode || 'fixed'} onChange={event => setFormData({ ...formData, price_mode: event.target.value })} className='min-h-11 w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-[#51c879]'>
                      <option value='fixed'>Precio fijo</option>
                      <option value='from'>Desde (precio base)</option>
                      <option value='quote'>A cotizar</option>
                    </select>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Largo
                      </label>
                      <input
                        type='number'
                        step='any'
                        required={!fromPhotoDraft}
                        value={formData.length}
                        onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      />
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Ancho
                      </label>
                      <input
                        type='number'
                        step='any'
                        required={!fromPhotoDraft}
                        value={formData.width}
                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      />
                    </div>
                  </div>

                  <ProductTextField
                    key={`${currentBusinessId}:${quoteRequest.current}:description`}
                    field='description'
                    label='Descripción'
                    required
                    rows={8}
                    value={formData.description}
                    onChange={text => setFormData(current => ({ ...current, description: text }))}
                    context={productTextContext(formData)}
                    getSession={() => supabase.auth.getSession()}
                    placeholder='Escriba una base: ocasión, colores, nombres o detalles personalizados...'
                  />

                  <ProductMaterialPreset key={`${currentBusinessId}:${quoteRequest.current}:preset`} formData={formData} onChange={setFormData} />

                  <ProductTextField
                    key={`${currentBusinessId}:${quoteRequest.current}:material`}
                    field='material'
                    label='🎨 Material y Técnica'
                    rows={2}
                    value={formData.material_technique}
                    onChange={text => setFormData(current => ({ ...current, material_technique: text }))}
                    context={productTextContext(formData)}
                    getSession={() => supabase.auth.getSession()}
                    placeholder='Ej.: acrílico 3 mm, impresión UV, base de MDF...'
                  />

                  <ProductTextField
                    key={`${currentBusinessId}:${quoteRequest.current}:care`}
                    field='care'
                    label='✨ Cuidados del Producto'
                    rows={3}
                    value={formData.care_instructions}
                    onChange={text => setFormData(current => ({ ...current, care_instructions: text }))}
                    context={productTextContext(formData)}
                    getSession={() => supabase.auth.getSession()}
                    placeholder='Ej.: limpie con un paño suave y seco, evite el agua...'
                  />

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Categoría
                      </label>
                      <select
                        required
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      >
                        <option value=''>Seleccione una categoría</option>
                        {categoriesData.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Visibilidad
                      </label>
                      <button
                        type='button'
                        onClick={() => setFormData({ ...formData, is_visible: !formData.is_visible })}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border font-medium text-sm transition-colors ${
                          formData.is_visible
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-gray-50 border-gray-200 text-gray-500'
                        }`}
                      >
                        <span>{formData.is_visible ? 'Visible al público' : 'Oculto al público'}</span>
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          {formData.is_visible ? (
                            <>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' />
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' />
                            </>
                          ) : (
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21' />
                          )}
                        </svg>
                      </button>
                    </div>

                  <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Stock
                      </label>
                      <input
                        type='number'
                        required
                        min='0'
                        value={formData.stock_quantity}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      />
                    </div>
                  </div>

                  {/* Main Image Upload */}
                  <ProductGallery items={gallery} onChange={setGallery} prepareFile={prepareFile} resolveUrl={getImageUrl} disabled={loading || productOptions.loading || !!productOptions.error || productOptions.uploading} />

                  <ProductVideoField key={`${currentBusinessId}:${editingProduct?.id || 'new'}`} value={formData.video_url}
                    onChange={path => setFormData(current => ({ ...current, video_url: path }))}
                    onBusyChange={busy => { videoBusy.current = busy; setVideoUploading(busy) }}
                    disabled={loading || productOptions.loading || !!productOptions.error || productOptions.uploading} />

                  <ProductOptionsEditor mainImage={gallery[0] ? { file: gallery[0].file, url: gallery[0].url ? getImageUrl(gallery[0].url) : null } : null} productName={formData.name} options={productOptions} products={products} productId={editingProduct?.id} businessId={currentBusinessId} disabled={loading || productOptions.loading || !!productOptions.error || productOptions.uploading} />
                  {/* Submit Buttons */}
                  <div className='flex space-x-4 pt-6'>
                    <button
                      type='button'
                      onClick={resetForm}
                      className='flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors'
                    >
                      Cancelar
                    </button>
                    <button
                      type='submit'
                      disabled={videoUploading || loading || productOptions.loading || !!productOptions.error || productOptions.uploading}
                      className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all duration-200 disabled:opacity-50'
                    >
                      {loading ? (
                        <span className='flex items-center justify-center gap-2'>
                          <svg className='animate-spin h-5 w-5' viewBox='0 0 24 24'>
                            <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' fill='none'/>
                            <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'/>
                          </svg>
                          Subiendo imágenes...
                        </span>
                      ) : (editingProduct ? 'Actualizar' : 'Crear Producto')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
