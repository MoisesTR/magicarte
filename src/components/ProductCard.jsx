import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getImageUrl } from '../utils/getImageUrl'
import LazyImage from './LazyImage'
import { trackAddToCart } from '../utils/analytics'
import { generateWhatsAppLinkForSingleProduct } from '../utils/generateWhatsappLink'

export default function ProductCard({ product }) {
  const navigate = useNavigate()
  const [selectedImage, setSelectedImage] = useState(product.image_url)
  const [isQuoteRequested, setIsQuoteRequested] = useState(false)

  const onQuoteClick = (e) => {
    e.stopPropagation()
    const whatsappUrl = generateWhatsAppLinkForSingleProduct(product)
    window.open(whatsappUrl, '_blank')
    setIsQuoteRequested(true)
    trackAddToCart(product)
    setTimeout(() => setIsQuoteRequested(false), 3000)
  }

  const handleCardClick = () => {
    navigate(`/product/${product.id}`)
    window.scrollTo(0, 0);
  }

  const handleImageClick = (e, image) => {
    e.stopPropagation() // Prevent card click when clicking thumbnail
    setSelectedImage(image)
  }



  const isOutOfStock = product.stock_quantity === 0
  const isNew = product.created_at && (Date.now() - new Date(product.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000

  return (
    <article
      onClick={handleCardClick}
      className='group relative flex flex-col overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm transition-all duration-300 sm:hover:shadow-lg sm:hover:-translate-y-1 cursor-pointer'
    >
      {/* Image */}
      <div className='relative aspect-square overflow-hidden bg-gray-50'>
        <LazyImage
          src={getImageUrl(selectedImage)}
          alt={product.name}
          className='w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-500'
        />

        {isNew && !isOutOfStock && (
          <div className='absolute top-2 left-2 bg-[#51c879] text-white text-[11px] font-semibold px-2 py-0.5 rounded-full'>
            Nuevo
          </div>
        )}
        {isOutOfStock && (
          <div className='absolute top-2 right-2 bg-gray-800/80 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full'>
            Agotado
          </div>
        )}

        {/* Hover overlay — desktop only */}
        <div className='absolute inset-0 hidden sm:flex items-center justify-center bg-black/0 group-hover:bg-black/15 transition-all duration-300'>
          <span className='opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm text-gray-800 text-sm font-semibold px-4 py-2 rounded-full shadow'>
            Ver detalles
          </span>
        </div>
      </div>

      {/* Text */}
      <div className='flex flex-col gap-2 p-3 sm:p-4 text-center'>
        <h3 className='text-base sm:text-lg font-semibold text-gray-900 line-clamp-2 leading-snug'>
          {product.name}
        </h3>
        <p className='text-xl sm:text-2xl font-bold text-[#51c879]'>C$ {product.price}</p>
      </div>
    </article>
  )
}
