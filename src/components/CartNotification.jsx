import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'

export default function CartNotification() {
  const { showCartNotification, setShowCartModal, setShowCartNotification, cart } = useApp()

  const handleViewCart = () => {
    setShowCartNotification(false)
    setShowCartModal(true)
  }

  return (
    <AnimatePresence>
      {showCartNotification && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          className='fixed top-20 left-4 right-4 z-50 bg-white rounded-2xl shadow-xl border border-gray-200 p-4'
        >
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-3'>
              <div className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] p-2 rounded-lg'>
                <svg className='w-5 h-5 text-white' fill='currentColor' viewBox='0 0 20 20'>
                  <path d='M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z'/>
                </svg>
              </div>
              <div>
                <p className='font-semibold text-gray-800'>¡Producto agregado para cotizar!</p>
                <p className='text-sm text-gray-600'>{cart.length} {cart.length === 1 ? 'producto' : 'productos'} en tu lista</p>
              </div>
            </div>
            
            <button
              onClick={handleViewCart}
              className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] hover:from-[#45b86b] hover:to-[#42a8d1] text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 shadow-md hover:shadow-lg'
            >
              Ver cotizaciones
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}