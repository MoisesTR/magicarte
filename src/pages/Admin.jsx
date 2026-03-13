import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'
import { getImageUrl } from '../utils/getImageUrl'
import { uploadCompressedImage } from '../utils/uploadImage'
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
  const [dragging, setDragging] = useState(false)
  const [mainPreviewUrl, setMainPreviewUrl] = useState(null)

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

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    category_id: '',
    stock_quantity: 1,
    image_url: '',
    secondary_images: []
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
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        toast.error(`Error al cargar productos: ${error.message}`)
      } else {
        // Products loaded successfully
        setProducts(data || [])
      }
    } catch (error) {
      toast.error('Error inesperado al cargar productos')
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
      secondary_images: []
    })
    setImageFiles({ main: null, secondary: [] })
    setMainPreviewUrl(null)
    setEditingProduct(null)
    setShowForm(false)
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
      secondary_images: product.secondary_images || []
    })
    setEditingProduct(product)
    setShowForm(true)
  }

  const deleteProduct = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Error al eliminar el producto')
    } else {
      toast.success('Producto eliminado')
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

  return (
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-7xl mx-auto px-4'>
        {/* Header */}
        <div className='bg-white rounded-2xl shadow-soft p-6 mb-8'>
          <div className='flex justify-between items-center'>
            <div>
              <h1 className='text-3xl font-bold text-gray-800'>
                Panel de Administración
              </h1>
              <p className='text-gray-600 mt-2'>
                Gestiona tus productos de MDF • {user.email}
              </p>
            </div>
            <div className='flex flex-wrap gap-3'>
              <button
                onClick={() => setShowForm(true)}
                className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                + Nuevo Producto
              </button>
              <button
                onClick={() => navigate('/admin/orders')}
                className='bg-gradient-to-r from-[#ff6b6b] to-[#feca57] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#ee5a52] hover:to-[#f5b942] transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                📦 Pedidos
              </button>
              <button
                onClick={() => navigate('/admin/calculator')}
                className='bg-gradient-to-r from-[#f59e0b] to-[#f97316] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#d97706] hover:to-[#ea580c] transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                🧮 Calculadora
              </button>
              <button
                onClick={() => setShowCategoryManager(true)}
                className='bg-gradient-to-r from-[#9966cc] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#8555b3] hover:to-[#42a8d1] transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                📁 Categorías
              </button>
              <button
                onClick={handleLogout}
                className='bg-gray-200 text-gray-700 px-4 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-all duration-200'
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
          {products.map((product) => (
            <div key={product.id} className='bg-white rounded-2xl shadow-soft overflow-hidden'>
              <div className='relative h-48'>
                <img
                  src={getImageUrl(product.image_url)}
                  alt={product.name}
                  className='w-full h-full object-cover'
                />
                <div className='absolute top-2 right-2 flex space-x-2'>
                  <button
                    onClick={() => editProduct(product)}
                    className='bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition-colors'
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteProduct(product.id)}
                    className='bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 transition-colors'
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className='p-4'>
                <h3 className='font-semibold text-gray-800 mb-2'>{product.name}</h3>
                <p className='text-gray-600 text-sm mb-2 line-clamp-2'>{product.description}</p>
                <div className='flex justify-between items-center mb-3'>
                  <span className='text-lg font-bold text-gray-800'>C$ {product.price}</span>
                  <span className='text-sm text-gray-500'>Stock: {product.stock_quantity}</span>
                </div>
                <button
                  onClick={() => copyListing(product)}
                  className='w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors'
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
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        placeholder='Ej: Piñata decorativa'
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
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
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
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
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
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      />
                    </div>
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Descripción
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      placeholder='Describe tu producto...'
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
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
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
                        Stock
                      </label>
                      <input
                        type='number'
                        required
                        min='0'
                        value={formData.stock_quantity}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                        className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
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
      </div>
    </div>
  )
}
