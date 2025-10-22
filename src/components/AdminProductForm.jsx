import { useState, useEffect } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'
import { getImageUrl } from '../utils/getImageUrl'

export default function AdminProductForm({ product, onSave, onCancel, loading }) {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    category_id: '',
    stock_quantity: 1
  })
  
  const [imageFiles, setImageFiles] = useState({
    main: null,
    secondary: []
  })

  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    order: { column: 'order' }
  })

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        price: product.price || '',
        description: product.description || '',
        category_id: product.category_id || '',
        stock_quantity: product.stock_quantity || 1
      })
    }
  }, [product])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData, imageFiles)
  }

  const handleImageChange = (e, type) => {
    if (type === 'main') {
      setImageFiles(prev => ({ ...prev, main: e.target.files[0] }))
    } else {
      setImageFiles(prev => ({ ...prev, secondary: Array.from(e.target.files) }))
    }
  }

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
        <div className='p-6'>
          <div className='flex justify-between items-center mb-6'>
            <h2 className='text-2xl font-bold text-gray-800'>
              {product ? 'Editar Producto' : 'Nuevo Producto'}
            </h2>
            <button
              onClick={onCancel}
              className='text-gray-500 hover:text-gray-700 text-2xl'
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className='space-y-6'>
            {/* Nombre y Precio */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Nombre del Producto *
                </label>
                <input
                  type='text'
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                  placeholder='Ej: Piñata decorativa'
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Precio (C$) *
                </label>
                <input
                  type='number'
                  required
                  step='0.01'
                  min='0'
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                  placeholder='250.00'
                />
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Descripción *
              </label>
              <textarea
                required
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                placeholder='Describe tu producto en MDF...'
              />
            </div>

            {/* Categoría y Stock */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Categoría *
                </label>
                <select
                  required
                  value={formData.category_id}
                  onChange={(e) => setFormData({...formData, category_id: e.target.value})}
                  className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                >
                  <option value=''>Selecciona una categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Stock Disponible
                </label>
                <input
                  type='number'
                  min='0'
                  value={formData.stock_quantity}
                  onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})}
                  className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                />
              </div>
            </div>

            {/* Imagen Principal */}
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Imagen Principal
              </label>
              <input
                type='file'
                accept='image/*'
                onChange={(e) => handleImageChange(e, 'main')}
                className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
              />
              {product?.image_url && (
                <div className='mt-3'>
                  <p className='text-sm text-gray-600 mb-2'>Imagen actual:</p>
                  <img
                    src={getImageUrl(product.image_url)}
                    alt='Imagen actual'
                    className='w-24 h-24 object-cover rounded-lg border'
                  />
                </div>
              )}
            </div>

            {/* Imágenes Adicionales */}
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Imágenes Adicionales (Opcional)
              </label>
              <input
                type='file'
                accept='image/*'
                multiple
                onChange={(e) => handleImageChange(e, 'secondary')}
                className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
              />
              {product?.secondary_images?.length > 0 && (
                <div className='mt-3'>
                  <p className='text-sm text-gray-600 mb-2'>Imágenes actuales:</p>
                  <div className='flex space-x-2'>
                    {product.secondary_images.map((img, index) => (
                      <img
                        key={index}
                        src={getImageUrl(img)}
                        alt={`Imagen ${index + 1}`}
                        className='w-16 h-16 object-cover rounded-lg border'
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Botones */}
            <div className='flex space-x-4 pt-6 border-t'>
              <button
                type='button'
                onClick={onCancel}
                className='flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium'
              >
                Cancelar
              </button>
              <button
                type='submit'
                disabled={loading}
                className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {loading ? 'Guardando...' : (product ? 'Actualizar Producto' : 'Crear Producto')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}