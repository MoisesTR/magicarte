import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'
import { getImageUrl } from '../utils/getImageUrl'
import { uploadCompressedImage } from '../utils/uploadImage'
import { generateFacebookMarketplaceListing, generateProductDescription } from '../utils/gemini'
import AdminLogin from '../components/AdminLogin'
import CategoryManager from '../components/CategoryManager'
import toast from 'react-hot-toast'
import heic2any from 'heic2any'

export default function Admin() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [mainPreviewUrl, setMainPreviewUrl] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [generatingListing, setGeneratingListing] = useState(false)
  const [showListingModal, setShowListingModal] = useState(false)
  const [generatedListing, setGeneratedListing] = useState('')

  const isHeic = (file) => file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)

  const setMainImage = async (file) => {
    setImageFiles(prev => ({ ...prev, main: file }))
    if (isHeic(file)) {
      try {
        const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.5 })
        setMainPreviewUrl(URL.createObjectURL(Array.isArray(blob) ? blob[0] : blob))
      } catch {
        setMainPreviewUrl(null)
      }
    } else {
      setMainPreviewUrl(URL.createObjectURL(file))
    }
  }

  const DEFAULT_MATERIAL = 'Trabajo realizado en MDF (Fibrán) mediante técnica de corte láser. Cada pieza es lijada, pintada a mano y barnizada con capa protectora 🎨'
  const DEFAULT_CARE = `Para limpiar tu producto te recomendamos usar una brocha seca (como las de maquillaje) o un plumero para sacar el polvo de los relieves y rendijas de forma delicada.

No recomendamos usar ningún producto líquido, ya sea agua o químicos de limpieza, ya que pueden afectar el acabado de la madera (MDF) o la pintura.

No exponer a los rayos directos del sol durante períodos prolongados de tiempo, ya que podría opacar la pintura y perder su brillo.

Cada pieza es una obra artesanal única, por lo que te pedimos manejarla con cuidado y cariño. El MDF no resiste impactos fuertes ni caídas.`

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    category_id: '',
    stock_quantity: 1,
    image_url: '',
    secondary_images: [],
    material_technique: DEFAULT_MATERIAL,
    care_instructions: DEFAULT_CARE,
    is_visible: true
  })

  const [imageFiles, setImageFiles] = useState({
    main: null,
    secondary: []
  })

  // Fetch data
  const { data: categoriesData = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    order: { column: 'order' }
  })

  const getCategoryName = (categoryId) => {
    if (!categoryId) return ''
    const category = categoriesData.find((item) => item.id === categoryId)
    return category?.name || ''
  }

  const formatDimensions = (product) => {
    const length = product.length ?? ''
    const width = product.width ?? ''
    if (length === '' && width === '') return ''
    if (length !== '' && width !== '') return `${length} x ${width}`
    return length !== '' ? `${length}` : `${width}`
  }

  const buildFacebookListing = (product) => {
    const categoryName = getCategoryName(product.category_id)
    const dimensions = formatDimensions(product)
    const lines = [
      `Titulo: ${product.name || ''}`,
      `Descripcion: ${product.description || ''}`,
      `Precio: C$ ${product.price ?? ''}`,
      `Categoria: ${categoryName}`,
      `Dimensiones: ${dimensions}`,
      'Tiempo de entrega: de 3 a 5 dias habiles',
      'Pago: Se debe dar o cancelar la mitad del producto personalizado 2 dias antes de la entrega como maximo para poder dar inicio.'
    ]

    return lines.filter(Boolean).join('\n')
  }

  const getFormProductContext = () => ({
    ...formData,
    category: getCategoryName(formData.category_id),
  })

  const handleGenerateDescription = async () => {
    if (!formData.name.trim()) {
      toast.error('Escribe el nombre del producto primero')
      return
    }

    setGeneratingDescription(true)
    try {
      const description = await generateProductDescription(getFormProductContext())
      setFormData((prev) => ({ ...prev, description }))
      toast.success('Descripción generada')
    } catch (error) {
      toast.error(error.message || 'No se pudo generar la descripción')
    } finally {
      setGeneratingDescription(false)
    }
  }

  const handleGenerateListing = async () => {
    if (!formData.name.trim()) {
      toast.error('Escribe el nombre del producto primero')
      return
    }

    setGeneratingListing(true)
    try {
      const listing = await generateFacebookMarketplaceListing(getFormProductContext())
      setGeneratedListing(listing)
      setShowListingModal(true)
    } catch (error) {
      toast.error(error.message || 'No se pudo generar el listing')
    } finally {
      setGeneratingListing(false)
    }
  }

  const copyGeneratedListing = async () => {
    if (!generatedListing) return

    try {
      await navigator.clipboard.writeText(generatedListing)
      toast.success('Listing copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar el listing')
    }
  }

  const copyListing = async (product) => {
    const text = buildFacebookListing(product)
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Listing copiado al portapapeles')
    } catch (error) {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        toast.success('Listing copiado al portapapeles')
      } catch (copyError) {
        toast.error('No se pudo copiar el listing')
      } finally {
        document.body.removeChild(textarea)
      }
    }
  }

  const fetchProducts = async () => {
    setLoadingProducts(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        toast.error(`Error al cargar productos: ${error.message}`)
      } else {
        setProducts(data || [])
      }
    } catch (error) {
      toast.error('Error inesperado al cargar productos')
    } finally {
      setLoadingProducts(false)
    }
  }

  const uploadImage = async (file, folder = 'products') => {
    if (!file) return null

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${folder}/${fileName}`

      const { data, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {

        // Si es error de permisos, mostrar mensaje específico
        if (uploadError.message?.includes('row-level security') || uploadError.statusCode === '403') {
          toast.error('Error de Storage: Verifica las políticas del bucket "images" en Supabase')
          return null
        }

        throw uploadError
      }

      return filePath
    } catch (error) {
      return null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Upload main image
      let mainImagePath = formData.image_url
      if (imageFiles.main) {
        mainImagePath = await uploadCompressedImage(imageFiles.main)
      }

      // Upload secondary images
      let secondaryImagePaths = formData.secondary_images
      if (imageFiles.secondary.length > 0) {
        const uploadPromises = imageFiles.secondary.map(file => uploadCompressedImage(file))
        const uploadedPaths = await Promise.all(uploadPromises)
        secondaryImagePaths = uploadedPaths.filter(path => path !== null)
      }

      const productData = {
        ...formData,
        price: parseFloat(formData.price),
        stock_quantity: parseInt(formData.stock_quantity),
        width: parseFloat(formData.width),
        length: parseFloat(formData.length),
        image_url: mainImagePath,
        secondary_images: secondaryImagePaths
      }

      let result
      if (editingProduct) {
        result = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)
      } else {
        result = await supabase
          .from('products')
          .insert([productData])
      }

      if (result.error) {

        // Mensaje específico para errores de permisos
        if (result.error.message?.includes('row-level security') || result.error.code === '42501') {
          toast.error('Error de permisos: Configura las políticas de Supabase para la tabla "products".')
        } else {
          toast.error(`Error al guardar el producto: ${result.error.message}`)
        }
      } else {
        toast.success(editingProduct ? 'Producto actualizado!' : 'Producto creado!')
        resetForm()
        fetchProducts()
      }
    } catch (error) {
      toast.error('Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const toggleVisibility = async (product) => {
    const { error } = await supabase
      .from('products')
      .update({ is_visible: !product.is_visible })
      .eq('id', product.id)
    if (error) {
      toast.error('Error al actualizar visibilidad')
    } else {
      toast.success(product.is_visible ? 'Producto ocultado' : 'Producto publicado')
      fetchProducts()
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      width: '',
      length: '',
      description: '',
      category_id: '',
      stock_quantity: 1,
      image_url: '',
      secondary_images: [],
      material_technique: DEFAULT_MATERIAL,
      care_instructions: DEFAULT_CARE,
      is_visible: true
    })
    setImageFiles({ main: null, secondary: [] })
    setMainPreviewUrl(null)
    setEditingProduct(null)
    setShowForm(false)
    setGeneratedListing('')
    setShowListingModal(false)
  }

  const editProduct = (product) => {
    setFormData({
      name: product.name || '',
      price: product.price || '',
      description: product.description || '',
      category_id: product.category_id || '',
      width: product.width || '',
      length: product.length || '',
      stock_quantity: product.stock_quantity || 1,
      image_url: product.image_url || '',
      secondary_images: product.secondary_images || [],
      material_technique: product.material_technique || '',
      care_instructions: product.care_instructions || '',
      is_visible: product.is_visible !== false
    })
    setEditingProduct(product)
    setShowForm(true)
  }

  const deleteProduct = async (id) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

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

      if (user) {
        // User authenticated
        fetchProducts()
      }
    }

    checkUser()
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    fetchProducts()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProducts([])
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
        <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-6 mb-6'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold text-gray-800'>Panel de Administración</h1>
              <p className='text-gray-500 text-sm mt-1'>{user.email}</p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <button
                onClick={() => setShowForm(true)}
                className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm'
              >
                + Nuevo Producto
              </button>
              <button
                onClick={() => navigate('/admin/orders')}
                className='bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors'
              >
                📦 Pedidos
              </button>
              <button
                onClick={() => setShowCategoryManager(true)}
                className='bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors'
              >
                📁 Categorías
              </button>
              <button
                onClick={handleLogout}
                className='bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-red-100 transition-colors'
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

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
                {/* Inline delete confirmation */}
                {confirmDeleteId === product.id ? (
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
                )}
              </div>
              <div className='p-4'>
                <h3 className='font-semibold text-gray-800 mb-1 line-clamp-1'>{product.name}</h3>
                <p className='text-gray-500 text-sm mb-3 line-clamp-2'>{product.description}</p>
                <div className='flex justify-between items-center mb-3'>
                  <span className='text-base font-bold text-gray-800'>C$ {product.price}</span>
                  <span className='text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full'>Stock: {product.stock_quantity}</span>
                </div>
                <button
                  onClick={() => copyListing(product)}
                  className='w-full bg-gray-50 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors'
                >
                  Copiar listing (Facebook)
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Category Manager Modal */}
        <CategoryManager 
          isOpen={showCategoryManager} 
          onClose={() => setShowCategoryManager(false)} 
        />

        {/* Form Modal */}
        {showForm && (
          <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
            <div className='bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
              <div className='p-6'>
                <div className='flex justify-between items-center mb-6'>
                  <h2 className='text-2xl font-bold text-gray-800'>
                    {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                  </h2>
                  <button
                    onClick={resetForm}
                    className='text-gray-500 hover:text-gray-700 text-2xl'
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleSubmit} className='space-y-6'>
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
                        required
                        step='0.01'
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                        placeholder='250.00'
                      />
                    </div>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Largo
                      </label>
                      <input
                        type='number'
                        required
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
                        required
                        value={formData.width}
                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      />
                    </div>
                  </div>

                  <div>
                    <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                      <div>
                        <label className='text-sm font-medium text-gray-700'>
                          Descripción
                        </label>
                        <p className='mt-1 text-xs text-gray-400'>
                          Mejor resultado con nombre, categoría, precio, medidas y notas.
                        </p>
                      </div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <button
                          type='button'
                          onClick={handleGenerateDescription}
                          disabled={generatingDescription}
                          className='inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60'
                        >
                          {generatingDescription && (
                            <svg className='h-3.5 w-3.5 animate-spin' viewBox='0 0 24 24'>
                              <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' fill='none' />
                              <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
                            </svg>
                          )}
                          {generatingDescription ? 'Generando...' : '✨ Generar'}
                        </button>
                        <button
                          type='button'
                          onClick={handleGenerateListing}
                          disabled={generatingListing}
                          className='inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#51c879] to-[#50bfe6] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
                        >
                          {generatingListing && (
                            <svg className='h-3.5 w-3.5 animate-spin' viewBox='0 0 24 24'>
                              <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' fill='none' />
                              <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
                            </svg>
                          )}
                          {generatingListing ? 'Generando...' : '✨ Listing para Facebook'}
                        </button>
                      </div>
                    </div>
                    <textarea
                      required
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      placeholder='Agrega notas para la IA: ocasión, colores, nombres, estilo, detalles personalizados...'
                    />
                  </div>

                  {/* Material y Técnica */}
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      🎨 Material y Técnica
                    </label>
                    <textarea
                      rows={2}
                      value={formData.material_technique}
                      onChange={(e) => setFormData({ ...formData, material_technique: e.target.value })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      placeholder='Ej: Trabajo realizado en MDF (Fibrán) mediante técnica de corte láser...'
                    />
                  </div>

                  {/* Cuidados */}
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      ✨ Cuidados del Producto
                    </label>
                    <textarea
                      rows={3}
                      value={formData.care_instructions}
                      onChange={(e) => setFormData({ ...formData, care_instructions: e.target.value })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                      placeholder='Ej: Para limpiar tu producto te recomendamos usar una brocha seca...'
                    />
                  </div>

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
                        <option value=''>Selecciona una categoría</option>
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
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Imagen Principal
                    </label>
                    <div
                      className={`relative border-2 border-dashed rounded-xl overflow-hidden transition-colors cursor-pointer ${
                        dragging ? 'border-[#51c879] bg-[#51c879]/5' : 'border-gray-300 hover:border-[#51c879]'
                      }`}
                      onClick={() => document.getElementById('mainImageInput').click()}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragging(false)
                        const file = e.dataTransfer.files[0]
                        if (file && (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))) {
                          setMainImage(file)
                        }
                      }}
                    >
                      {(imageFiles.main || formData.image_url) ? (
                        <div className='relative aspect-[4/3]'>
                          <img
                            src={imageFiles.main ? (mainPreviewUrl || getImageUrl(null)) : getImageUrl(formData.image_url)}
                            alt='Preview'
                            className='w-full h-full object-cover'
                          />
                          <div className='absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center'>
                            <span className='text-white font-medium text-sm'>Cambiar imagen</span>
                          </div>
                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation()
                              setImageFiles({ ...imageFiles, main: null })
                              setMainPreviewUrl(null)
                            }}
                            className='absolute top-2 right-2 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm hover:bg-red-600'
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className='flex flex-col items-center justify-center py-10 text-gray-400'>
                          <svg className='w-10 h-10 mb-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' />
                          </svg>
                          <span className='text-sm font-medium'>{dragging ? 'Soltar imagen aquí' : 'Click o arrastra una imagen'}</span>
                          <span className='text-xs mt-1'>JPG, PNG, HEIC</span>
                        </div>
                      )}
                    </div>
                    <input
                      id='mainImageInput'
                      type='file'
                      accept='image/*'
                      className='hidden'
                      onChange={(e) => e.target.files[0] && setMainImage(e.target.files[0])}
                    />
                  </div>

                  {/* Secondary Images */}
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Imágenes Adicionales
                    </label>
                    <div className='flex flex-wrap gap-3'>
                      {/* Existing images */}
                      {formData.secondary_images?.map((img, index) => (
                        <div key={`existing-${index}`} className='relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200'>
                          <img src={getImageUrl(img)} alt={`Imagen ${index + 1}`} className='w-full h-full object-cover' />
                          <button
                            type='button'
                            onClick={() => setFormData({
                              ...formData,
                              secondary_images: formData.secondary_images.filter((_, i) => i !== index)
                            })}
                            className='absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs hover:bg-red-600'
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {/* New file previews */}
                      {imageFiles.secondary.map((file, index) => (
                        <div key={`new-${index}`} className='relative w-24 h-24 rounded-lg overflow-hidden border-2 border-[#51c879]'>
                          <img src={URL.createObjectURL(file)} alt={`Nueva ${index + 1}`} className='w-full h-full object-cover' />
                          <button
                            type='button'
                            onClick={() => setImageFiles({
                              ...imageFiles,
                              secondary: imageFiles.secondary.filter((_, i) => i !== index)
                            })}
                            className='absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs hover:bg-red-600'
                          >
                            ×
                          </button>
                          <span className='absolute bottom-0 left-0 right-0 bg-[#51c879] text-white text-[10px] text-center'>Nueva</span>
                        </div>
                      ))}
                      {/* Add button */}
                      <button
                        type='button'
                        onClick={() => document.getElementById('secondaryImageInput').click()}
                        className='w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#51c879] hover:text-[#51c879] transition-colors'
                      >
                        <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
                        </svg>
                        <span className='text-xs mt-1'>Agregar</span>
                      </button>
                    </div>
                    <input
                      id='secondaryImageInput'
                      type='file'
                      accept='image/*'
                      multiple
                      className='hidden'
                      onChange={(e) => setImageFiles({
                        ...imageFiles,
                        secondary: [...imageFiles.secondary, ...Array.from(e.target.files)]
                      })}
                    />
                  </div>

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
                      disabled={loading}
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
        {showListingModal && (
          <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4'>
            <div className='bg-white rounded-2xl max-w-lg w-full shadow-xl'>
              <div className='p-6'>
                <div className='mb-4 flex items-start justify-between gap-4'>
                  <div>
                    <h3 className='text-xl font-bold text-gray-800'>Listing para Facebook</h3>
                    <p className='mt-1 text-sm text-gray-500'>Revisa el texto antes de publicarlo.</p>
                  </div>
                  <button
                    type='button'
                    onClick={() => setShowListingModal(false)}
                    className='text-2xl leading-none text-gray-400 transition-colors hover:text-gray-600'
                  >
                    ×
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={12}
                  value={generatedListing}
                  className='w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700 focus:outline-none'
                />
                <div className='mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
                  <button
                    type='button'
                    onClick={() => setShowListingModal(false)}
                    className='rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50'
                  >
                    Cerrar
                  </button>
                  <button
                    type='button'
                    onClick={copyGeneratedListing}
                    className='rounded-xl bg-gradient-to-r from-[#51c879] to-[#50bfe6] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90'
                  >
                    Copiar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
