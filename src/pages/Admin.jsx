import { useState, useEffect } from 'react'
import { supabase } from '../config/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'
import { getImageUrl } from '../utils/getImageUrl'
import AdminLogin from '../components/AdminLogin'

export default function Admin() {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [loading, setLoading] = useState(false)

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

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        alert(`Error al cargar productos: ${error.message}`)
      } else {
        // Products loaded successfully
        setProducts(data || [])
      }
    } catch (error) {
      alert('Error inesperado al cargar productos')
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
          alert('Error de Storage: Verifica las políticas del bucket "images" en Supabase')
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
        mainImagePath = await uploadImage(imageFiles.main)
      }

      // Upload secondary images
      let secondaryImagePaths = formData.secondary_images
      if (imageFiles.secondary.length > 0) {
        const uploadPromises = imageFiles.secondary.map(file => uploadImage(file))
        const uploadedPaths = await Promise.all(uploadPromises)
        secondaryImagePaths = uploadedPaths.filter(path => path !== null)
      }

      const productData = {
        ...formData,
        price: parseFloat(formData.price),
        stock_quantity: parseInt(formData.stock_quantity),
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
          alert('Error de permisos: Necesitas configurar las políticas de Supabase. Ve a tu dashboard > Authentication > Policies y permite operaciones en la tabla "products".')
        } else {
          alert(`Error al guardar el producto: ${result.error.message}`)
        }
      } else {
        alert(editingProduct ? 'Producto actualizado exitosamente!' : 'Producto creado exitosamente!')
        resetForm()
        fetchProducts()
      }
    } catch (error) {
      alert('Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      description: '',
      category_id: '',
      stock_quantity: 1,
      image_url: '',
      secondary_images: []
    })
    setImageFiles({ main: null, secondary: [] })
    setEditingProduct(null)
    setShowForm(false)
  }

  const editProduct = (product) => {
    setFormData({
      name: product.name || '',
      price: product.price || '',
      description: product.description || '',
      category_id: product.category_id || '',
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
      alert('Error al eliminar el producto')
    } else {
      alert('Producto eliminado')
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
            <div className='flex space-x-3'>
              <button
                onClick={() => setShowForm(true)}
                className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                + Nuevo Producto
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
                <div className='flex justify-between items-center'>
                  <span className='text-lg font-bold text-gray-800'>C$ {product.price}</span>
                  <span className='text-sm text-gray-500'>Stock: {product.stock_quantity}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

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

                  {/* Image Upload */}
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Imagen Principal
                    </label>
                    <input
                      type='file'
                      accept='image/*'
                      onChange={(e) => setImageFiles({ ...imageFiles, main: e.target.files[0] })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    />
                    {formData.image_url && (
                      <div className='mt-2'>
                        <img
                          src={getImageUrl(formData.image_url)}
                          alt='Preview'
                          className='w-20 h-20 object-cover rounded-lg'
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Imágenes Adicionales
                    </label>
                    <input
                      type='file'
                      accept='image/*'
                      multiple
                      onChange={(e) => setImageFiles({ ...imageFiles, secondary: Array.from(e.target.files) })}
                      className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    />
                    {formData.secondary_images?.length > 0 && (
                      <div className='mt-2 flex space-x-2'>
                        {formData.secondary_images.map((img, index) => (
                          <img
                            key={index}
                            src={getImageUrl(img)}
                            alt={`Preview ${index + 1}`}
                            className='w-16 h-16 object-cover rounded-lg'
                          />
                        ))}
                      </div>
                    )}
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
                      {loading ? 'Guardando...' : (editingProduct ? 'Actualizar' : 'Crear Producto')}
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