import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { getImageUrl } from '../utils/getImageUrl'
import LazyImage from './LazyImage'
import { motion } from 'framer-motion'
import { trackAddToCart } from '../utils/analytics'

export default function ProductCard({ product }) {
  const { addItem, removeItem, hasItem, setShowCartModal } = useApp()
  const [selectedImage, setSelectedImage] = useState(product.image_url)
  const [showOptions, setShowOptions] = useState(false)

  const onCartClick = () => {
    if (hasItem(product.id)) {
      setShowOptions(true)
    } else {
      addItem(product)
      trackAddToCart(product)
    }
  }

  const onShowCartModal = () => {
    setShowCartModal(true)
    setShowOptions(false)
  }

  const getStockLabel = () => {
    if (product.stock_quantity === 0) {
      return {
        text: 'Agotado',
        color: 'bg-red-700 border border-red-500 text-white shadow-md',
        icon: '',
      }
    } else if (product.stock_quantity <= 2) {
      return {
        text: `¡Solo ${product.stock_quantity} disponibles!`,
        color: 'bg-red-500',
        icon: '⚠️',
      }
    } else if (product.stock_quantity <= 5) {
      return { text: '¡Stock limitado!', color: 'bg-orange-400', icon: '⏳' }
    }
    return null
  }

  const stockLabel = getStockLabel()

  return (
    <article className='group relative overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl'>
      <div className='relative'>
        <LazyImage
          src={getImageUrl(selectedImage)}
          alt={product.name}
          className='h-64 w-full object-cover transition-transform duration-300 group-hover:scale-110'
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

      <div className='relative flex min-h-[220px] flex-col justify-between p-6 text-center'>
        <div>
          <h3 className='text-lg leading-tight font-semibold text-gray-900'>
            {product.name}
          </h3>
          <p className='mt-2 h-16 overflow-hidden text-sm text-gray-600'>
            {product.description}
          </p>
        </div>

        <div className='mt-auto flex flex-col items-center'>
          <p className='text-danger text-xl font-bold'>C$ {product.price}</p>

          {stockLabel && (
            <motion.div
              className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold text-white ${stockLabel.color}`}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                ease: 'easeInOut',
              }}
            >
              {stockLabel.icon} {stockLabel.text}
            </motion.div>
          )}
        </div>

        <div className='mt-4'>
          <button
            onClick={onCartClick}
            disabled={product.stock_quantity === 0}
            className={`w-full rounded-lg px-4 py-2 font-semibold transition-all duration-200 ${
              product.stock_quantity === 0
                ? 'cursor-not-allowed bg-gray-400 text-white'
                : hasItem(product.id)
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-[#E63946] text-white hover:bg-[#D32F2F]'
            }`}
            aria-label='Agregar al carrito'
          >
            {hasItem(product.id) ? 'En el carrito' : 'Agregar al carrito'}
          </button>

          {showOptions && hasItem(product.id) && (
            <div className='mt-2 flex gap-2'>
              <button
                onClick={onShowCartModal}
                className='w-1/2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-600'
              >
                Ir al carrito
              </button>
              <button
                onClick={() => {
                  removeItem(product.id)
                  setShowOptions(false)
                }}
                className='w-1/2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600'
              >
                Remover
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
