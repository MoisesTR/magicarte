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
      className='group relative overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-md sm:shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer'
    >
      <div className='relative h-52 sm:h-96 overflow-hidden bg-gray-50 p-0 sm:p-4 flex items-center justify-center'>
        <LazyImage
          src={getImageUrl(selectedImage)}
          alt={product.name}
          className='max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300'
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



      <div className='relative flex flex-col justify-between p-3 sm:p-6 text-center'>
        <div className='mb-2 sm:mb-4'>
          <h3 className='text-[15px] sm:text-[18px] font-semibold text-gray-900 mb-1 sm:mb-3 line-clamp-2'>
            {product.name}
          </h3>
          <p className='text-xl sm:text-2xl font-bold text-gray-800'>C$ {product.price}</p>
        </div>

        <div className='flex flex-col items-center'>
        </div>

      </div>
    </article>
  )
}
