import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProductsInActiveSeason } from '../hooks/useProductsInActiveSeason'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'
import { getImageUrl } from '../utils/getImageUrl'
import { generateWhatsAppLinkForSingleProduct } from '../utils/generateWhatsappLink'
import { trackAddToCart } from '../utils/analytics'
import { FEATURES } from '../config/features'
import { useApp } from '../context/AppContext'
import Header from '../components/Header'
import Footer from '../components/Footer'
import CartModal from '../components/CartModal'
import CartNotification from '../components/CartNotification'
import LazyImage from '../components/LazyImage'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem, hasItem, showCartModal, setShowCartModal } = useApp()
  const [selectedImage, setSelectedImage] = useState('')
  const [isQuoteRequested, setIsQuoteRequested] = useState(false)

  // Fetch product data
  const { data: products = [], isLoading, error } = useProductsInActiveSeason()

  // Find the specific product
  const product = products.find(p => p.id === id)

  // Fetch categories for category name
  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    order: { column: 'order' }
  })

  const category = categories.find(c => c.id === product?.category_id)

  useEffect(() => {
    if (product?.image_url) {
      setSelectedImage(product.image_url)
    }
  }, [product])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [id])

  const handleQuoteClick = () => {
    if (FEATURES.CART_ENABLED) {
      addItem(product)
      trackAddToCart(product)
    } else {
      const whatsappUrl = generateWhatsAppLinkForSingleProduct(product)
      window.open(whatsappUrl, '_blank')
      setIsQuoteRequested(true)
      trackAddToCart(product)
      
      setTimeout(() => {
        setIsQuoteRequested(false)
      }, 3000)
    }
  }

  const handleBackClick = () => {
    navigate(-1) // Go back to previous page
  }

  if (isLoading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-blue-50/40 to-green-50/40'>
        <Header onCartClick={() => setShowCartModal(true)} />
        <div className='flex items-center justify-center min-h-screen pt-20'>
          <div className='text-center'>
            <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879] mx-auto mb-4'></div>
            <p className='text-lg text-gray-600'>Cargando producto...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-blue-50/40 to-green-50/40'>
        <Header onCartClick={() => setShowCartModal(true)} />
        <div className='flex items-center justify-center min-h-screen pt-20'>
          <div className='text-center'>
            <svg className='w-16 h-16 text-gray-400 mx-auto mb-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
            </svg>
            <h2 className='text-2xl font-bold text-gray-800 mb-2'>Producto no encontrado</h2>
            <p className='text-gray-600 mb-6'>El producto que buscas no existe o ha sido eliminado.</p>
            <button
              onClick={handleBackClick}
              className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all duration-200'
            >
              Volver atrás
            </button>
          </div>
        </div>
      </div>
    )
  }

  const allImages = [product.image_url, ...(product.secondary_images || [])]

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50/40 to-green-50/40'>
      <Header onCartClick={() => setShowCartModal(true)} />
      
      <main className='max-w-7xl mx-auto px-6 py-8 pt-24 lg:px-8'>
        {/* Back Button */}
        <button
          onClick={handleBackClick}
          className='flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6 transition-colors duration-200'
        >
          <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
          </svg>
          Volver
        </button>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-12'>
          {/* Image Gallery */}
          <div className='space-y-4'>
            {/* Main Image */}
            <div className='rounded-2xl overflow-hidden bg-gray-50 shadow-lg p-6'>
              <div className='aspect-[3/4] w-full'>
                <LazyImage
                  src={getImageUrl(selectedImage)}
                  alt={product.name}
                  className='w-full h-full object-contain'
                />
              </div>
            </div>

            {/* Thumbnail Images */}
            {allImages.length > 1 && (
              <div className='flex gap-3 overflow-x-auto pb-2'>
                {allImages.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(image)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                      selectedImage === image
                        ? 'border-[#51c879] scale-105'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={getImageUrl(image)}
                      alt={`Vista ${index + 1}`}
                      className='w-full h-full object-cover'
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className='space-y-6'>
            {/* Category Badge */}
            {category && (
              <span className='inline-block bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-4 py-2 rounded-full text-sm font-medium'>
                {category.name}
              </span>
            )}

            {/* Product Name */}
            <h1 className='text-4xl font-bold text-gray-900 leading-tight'>
              {product.name}
            </h1>

            {/* Price */}
            <div className='flex items-center gap-4'>
              <span className='text-4xl font-bold text-gray-800'>
                C$ {product.price}
              </span>
            </div>

            {/* Description */}
            <div className='bg-white rounded-2xl p-6 shadow-lg'>
              <h3 className='text-xl font-semibold text-gray-900 mb-3'>Descripción</h3>
              <p className='text-gray-700 leading-relaxed whitespace-pre-line'>
                {product.description}
              </p>
            </div>

            {/* Dimensions */}
            {(product.width > 0 || product.length > 0) && (
              <div className='bg-white rounded-2xl p-6 shadow-lg'>
                <h3 className='text-xl font-semibold text-gray-900 mb-3'>Medidas</h3>
                <div className='flex gap-6'>
                  {product.length > 0 && (
                    <div className='flex items-center gap-2'>
                      <span className='text-gray-500 text-sm'>Largo</span>
                      <span className='text-gray-800 font-semibold'>{product.length} cm</span>
                    </div>
                  )}
                  {product.width > 0 && (
                    <div className='flex items-center gap-2'>
                      <span className='text-gray-500 text-sm'>Ancho</span>
                      <span className='text-gray-800 font-semibold'>{product.width} cm</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className='space-y-4'>
              <button
                onClick={handleQuoteClick}
                className={`w-full rounded-2xl px-8 py-4 font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3 ${
                  (FEATURES.CART_ENABLED ? hasItem(product.id) : isQuoteRequested)
                    ? 'bg-[#51c879] text-white shadow-lg cursor-default'
                    : 'bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white hover:from-[#45b86b] hover:to-[#42a8d1] shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
                }`}
              >
                {FEATURES.CART_ENABLED ? (
                  hasItem(product.id) ? '✓ En carrito' : 'Agregar al carrito'
                ) : isQuoteRequested ? (
                  <>
                    <svg className='w-6 h-6' fill='currentColor' viewBox='0 0 20 20'>
                      <path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' />
                    </svg>
                    Cotización enviada
                  </>
                ) : (
                  <>
                    <svg className='w-6 h-6' fill='currentColor' viewBox='0 0 24 24'>
                      <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.787'/>
                    </svg>
                    Solicitar Cotización
                  </>
                )}
              </button>

              {/* Delivery Info */}
              <div className='bg-blue-50 rounded-xl p-4 border border-blue-200'>
                <div className='flex items-center gap-3'>
                  <svg className='w-6 h-6 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
                  </svg>
                  <div>
                    <p className='font-semibold text-blue-900'>Tiempo de entrega</p>
                    <p className='text-blue-700'>de 3 a 5 días hábiles</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Related Products */}
        <section className='mt-16'>
          <h2 className='text-3xl font-bold text-gray-900 mb-8 text-center'>
            Productos Relacionados
          </h2>
          
          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
            {products
              .filter(p => p.id !== product.id && p.category_id === product.category_id)
              .slice(0, 4)
              .map((relatedProduct) => (
                <div
                  key={relatedProduct.id}
                  onClick={() => navigate(`/product/${relatedProduct.id}`)}
                  className='group cursor-pointer bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 hover:scale-105'
                >
                  <div className='aspect-square overflow-hidden'>
                    <img
                      src={getImageUrl(relatedProduct.image_url)}
                      alt={relatedProduct.name}
                      className='w-full h-full object-cover group-hover:scale-110 transition-transform duration-300'
                    />
                  </div>
                  <div className='p-4'>
                    <h3 className='font-semibold text-gray-900 mb-2 overflow-hidden' style={{display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'}}>
                      {relatedProduct.name}
                    </h3>
                    <p className='text-lg font-bold text-gray-800'>
                      C$ {relatedProduct.price}
                    </p>
                  </div>
                </div>
              ))}
          </div>
          
          {products.filter(p => p.id !== product.id && p.category_id === product.category_id).length === 0 && (
            <div className='text-center py-12'>
              <p className='text-gray-500 text-lg'>No hay productos relacionados disponibles</p>
            </div>
          )}
        </section>
      </main>

      <Footer />

      {/* Cart functionality - controlled by feature flags */}
      <div className={!FEATURES.SHOW_CART_COMPONENTS ? 'hidden' : ''}>
        <CartModal isOpen={showCartModal} />
        <CartNotification />
      </div>
    </div>
  )
}
