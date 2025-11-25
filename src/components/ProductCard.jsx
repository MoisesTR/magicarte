import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getImageUrl } from '../utils/getImageUrl'
import LazyImage from './LazyImage'
import { trackAddToCart } from '../utils/analytics'
import { generateWhatsAppLinkForSingleProduct } from '../utils/generateWhatsappLink'
import { FEATURES } from '../config/features'

export default function ProductCard({ product }) {
  const navigate = useNavigate()
  const { addItem, hasItem } = useApp()
  const [selectedImage, setSelectedImage] = useState(product.image_url)
  const [isQuoteRequested, setIsQuoteRequested] = useState(false)

  const onQuoteClick = (e) => {
    e.stopPropagation() // Prevent card click when clicking button
    
    if (FEATURES.CART_ENABLED) {
      // Cart functionality
      addItem(product)
      trackAddToCart(product)
    } else {
      // Direct WhatsApp functionality
      const whatsappUrl = generateWhatsAppLinkForSingleProduct(product)
      window.open(whatsappUrl, '_blank')
      setIsQuoteRequested(true)
      trackAddToCart(product)
      
      // Reset the state after 3 seconds for better UX
      setTimeout(() => {
        setIsQuoteRequested(false)
      }, 3000)
    }
  }

  const handleCardClick = () => {
    navigate(`/product/${product.id}`)
    window.scrollTo(0, 0);
  }

  const handleImageClick = (e, image) => {
    e.stopPropagation() // Prevent card click when clicking thumbnail
    setSelectedImage(image)
  }



  // Only show "Agotado" for out of stock items
  const isOutOfStock = product.stock_quantity === 0

  return (
    <article 
      onClick={handleCardClick}
      className='group relative overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer'
    >
      <div className='aspect-square overflow-hidden'>
        <LazyImage
          src={getImageUrl(selectedImage)}
          alt={product.name}
          className='w-full h-full object-cover group-hover:scale-110 transition-transform duration-300'
        />
        
        {/* View Details Overlay */}
        <div className='absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center'>
          <div className='opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full'>
            <span className='text-sm font-semibold text-gray-800 flex items-center gap-2'>
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' />
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' />
              </svg>
              Ver detalles
            </span>
          </div>
        </div>
      </div>



      <div className='relative flex flex-col justify-between p-6 text-center'>
        <div className='mb-4'>
          <h3 className='text-lg font-semibold text-gray-900 mb-3'>
            {product.name}
          </h3>
          <p className='text-2xl font-bold text-gray-800'>C$ {product.price}</p>
        </div>

        <div className='flex flex-col items-center'>
        </div>

        <div className='mt-6'>
          <button
            onClick={onQuoteClick}
            disabled={isOutOfStock}
            className={`w-full rounded-xl px-4 py-3 font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              isOutOfStock
                ? 'cursor-not-allowed bg-gray-400 text-white'
                : (FEATURES.CART_ENABLED ? hasItem(product.id) : isQuoteRequested)
                  ? 'bg-[#51c879] text-white shadow-lg cursor-default'
                  : 'bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white hover:from-[#45b86b] hover:to-[#42a8d1] shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
            }`}
            aria-label='Solicitar cotización por WhatsApp'
          >
            {isOutOfStock ? (
              'No disponible'
            ) : FEATURES.CART_ENABLED ? (
              hasItem(product.id) ? '✓ En carrito' : 'Agregar al carrito'
            ) : isQuoteRequested ? (
              <>
                <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 20 20'>
                  <path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' />
                </svg>
                Cotización enviada
              </>
            ) : (
              <>
                <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
                  <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.787'/>
                </svg>
                Solicitar Cotización
              </>
            )}
          </button>
          

        </div>
      </div>
    </article>
  )
}
