import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { getImageUrl } from '../utils/getImageUrl'
import LazyImage from './LazyImage'
import { motion } from 'framer-motion'
import { trackAddToCart } from '../utils/analytics'

export default function ProductCard({ product }) {
  const { addItem, hasItem } = useApp()
  const [selectedImage, setSelectedImage] = useState(product.image_url)

  const onQuoteClick = () => {
    addItem(product)
    trackAddToCart(product)
  }

  // Only show "Agotado" for out of stock items
  const isOutOfStock = product.stock_quantity === 0

  return (
    <article className='group relative overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl'>
      <div className='relative'>
        <LazyImage
          src={getImageUrl(selectedImage)}
          alt={product.name}
          className='h-60 w-full object-cover transition-transform duration-300 group-hover:scale-110'
        />
      </div>

      {product.secondary_images?.length > 0 && (
        <div className='mt-2 flex justify-center gap-2'>
          <img
            src={getImageUrl(product.image_url)}
            alt='Main'
            className={`h-12 w-12 cursor-pointer rounded-md border-2 object-cover transition-all duration-200 ${
              selectedImage === product.image_url
                ? 'border-primary scale-105'
                : 'border-transparent hover:opacity-75'
            }`}
            onClick={() => setSelectedImage(product.image_url)}
          />
          {product.secondary_images.map((image, index) => (
            <img
              key={index}
              src={getImageUrl(image)}
              alt={`Thumbnail ${index + 1}`}
              className={`h-12 w-12 cursor-pointer rounded-md border-2 object-cover transition-all duration-200 ${
                selectedImage === image
                  ? 'border-primary scale-105'
                  : 'border-transparent hover:opacity-75'
              }`}
              onClick={() => setSelectedImage(image)}
            />
          ))}
        </div>
      )}

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
            className={`w-full rounded-xl px-4 py-3 font-semibold transition-all duration-200 ${
              isOutOfStock
                ? 'cursor-not-allowed bg-gray-400 text-white'
                : hasItem(product.id)
                  ? 'bg-[#51c879] text-white shadow-lg cursor-default'
                  : 'bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white hover:from-[#45b86b] hover:to-[#42a8d1] shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
            }`}
            aria-label='Solicitar cotización'
          >
            {isOutOfStock ? 'No disponible' : hasItem(product.id) ? '✓ Cotización solicitada' : 'Solicitar Cotización'}
          </button>
        </div>
      </div>
    </article>
  )
}
