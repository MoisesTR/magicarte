import React from 'react'
import { useApp } from '../context/AppContext'
import { getImageUrl } from '../utils/getImageUrl'
import LazyImage from './LazyImage'
import { motion } from 'framer-motion'

export default function ProductCard({ product }) {
  const { addItem, removeItem, hasItem } = useApp()
  const imageUrl = getImageUrl(product.image_url)

  const onCartClick = (productId) => {
    if (hasItem(productId)) {
      removeItem(productId)
    } else {
      addItem(product)
    }
  }

  const getStockLabel = () => {
    if (product.stock_quantity === 0) {
      return { text: 'Agotado', color: 'bg-red-700 border border-red-500 text-white shadow-md', icon: '❌' }
    } else if (product.stock_quantity <= 2) {
      return { text: `¡Solo ${product.stock_quantity} disponibles!`, color: 'bg-red-500', icon: '⚠️' }
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
          src={imageUrl}
          alt={product.name}
          className='h-64 w-full object-cover transition-transform duration-300 group-hover:scale-110'
        />
      </div>

      <div className='relative flex h-64 flex-col p-6 text-center justify-between'>
        <div>
          <h3 className='text-lg leading-tight font-semibold text-gray-900'>
            {product.name}
          </h3>
          <p className='mt-2 h-16 overflow-hidden text-sm text-gray-600'>
            {product.description}
          </p>
        </div>

        <div className="mt-auto flex flex-col items-center">
          <p className='text-danger text-xl font-bold'>C$ {product.price}</p>

          <div className="min-h-12 flex items-center">
            {stockLabel && (
              <motion.div
                className={`mt-2 inline-block px-3 py-1 text-sm font-bold text-white rounded-full ${stockLabel.color}`}
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              >
                {stockLabel.icon} {stockLabel.text}
              </motion.div>
            )}
          </div>
        </div>

        <button
          onClick={() => onCartClick(product.id)}
          disabled={product.stock_quantity === 0}
          className={`absolute top-0 right-4 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-lg transition-all duration-75 ${
            product.stock_quantity === 0
              ? 'border-gray-400 bg-gray-400 text-white cursor-not-allowed'
              : hasItem(product.id)
              ? 'border-[#E63946] bg-[#E63946] text-white'
              : 'border-[#E63946] bg-white text-[#E63946] hover:scale-110'
          } active:scale-95`}
          aria-label='Agregar al carrito'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            className='h-6 w-6 transition-all duration-0'
            fill='currentColor'
          >
            <path fill='none' d='M0 0h24v24H0V0z'></path>
            <path d='M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 3c0 .55.45 1 1 1h1l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h11c.55 0 1-.45 1-1s-.45-1-1-1H7l1.1-2h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.37-.66-.11-1.48-.87-1.48H5.21l-.67-1.43c-.16-.35-.52-.57-.9-.57H2c-.55 0-1 .45-1 1zm16 15c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z'></path>
          </svg>
        </button>
      </div>
    </article>
  )
}
