import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import cartIcon from '../assets/cart.svg'

export default function Header({ onCartClick }) {
  const { cart, setItemAdded, itemAdded } = useApp()
  const [cartEffect, setCartEffect] = useState(false)

  useEffect(() => {
    if (!itemAdded) return

    setCartEffect(true)

    const timer = setTimeout(() => {
      setCartEffect(false)
      setItemAdded(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [itemAdded, setItemAdded])

  return (
    <header className='bg-white fixed top-0 left-0 z-50 w-full py-4 px-6 shadow-lg border-b border-gray-100'>
      <div className='container mx-auto flex items-center justify-between'>
        {/* Logo */}
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>
            <span className='text-[#51c879]'>Magic</span>
            <span className='text-[#50bfe6]'>Arte</span>
          </h1>
          <p className='text-sm text-gray-500 font-medium'>Artesanía en MDF</p>
        </div>

        {/* Cart Button */}
        <button
          onClick={onCartClick}
          className='relative p-3 bg-gradient-to-r from-[#51c879] to-[#50bfe6] rounded-2xl hover:from-[#45b86b] hover:to-[#42a8d1] transition-all duration-200 shadow-md hover:shadow-lg'
        >
          <motion.svg
            className='h-6 w-6 text-white'
            fill='currentColor'
            viewBox='0 0 20 20'
            animate={cartEffect ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <path fillRule='evenodd' d='M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z' clipRule='evenodd' />
          </motion.svg>

          {cart.length > 0 && (
            <motion.span
              className='absolute -top-2 -right-2 bg-gray-900 text-white text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg border-2 border-white'
              animate={cartEffect ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {cart.length}
            </motion.span>
          )}
        </button>
      </div>
    </header>
  )
}