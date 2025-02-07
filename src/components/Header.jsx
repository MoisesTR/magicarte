import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { MAGIC_ARTE } from '../utils/constants'
import instagramIcon from '../assets/instagram.svg'
import cartIcon from '../assets/cart.svg'
import facebookIcon from '../assets/facebook.svg'

export default function Header({ onCartClick }) {
  const { cart, setItemAdded, itemAdded } = useApp()
  const [cartEffect, setCartEffect] = useState(false)

  useEffect(() => {
    if (!itemAdded) return

    console.log('Item added to cart')
    setCartEffect(true)

    const timer = setTimeout(() => {
      setCartEffect(false)
      setItemAdded(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [itemAdded, setItemAdded])

  return (
    <header className='bg-primary fixed top-0 left-0 z-50 w-full p-4 text-xl font-bold text-white shadow-lg'>
      <div className='container mx-auto flex items-center justify-between'>
        <h1 className='text-3xl font-bold text-white'>{MAGIC_ARTE}</h1>

        <div className='flex items-center space-x-6'>
          {/* Instagram */}
          <a
            href='https://www.instagram.com/magicarte.ni/'
            target='_blank'
            rel='noopener noreferrer'
            className='transition-opacity hover:opacity-75'
          >
            <img src={instagramIcon} alt='Instagram' className='h-6 w-6' />
          </a>

          {/* Facebook */}
          <a
            href='https://www.facebook.com/profile.php?id=61556667861230'
            target='_blank'
            rel='noopener noreferrer'
            className='transition-opacity hover:opacity-75'
          >
            <img src={facebookIcon} alt='Facebook' className='h-6 w-6' />
          </a>

          {/* Cart Icon with Hand Cursor & Animation */}
          <a
            href='#'
            onClick={(e) => {
              e.preventDefault()
              onCartClick()
            }}
            className='relative flex cursor-pointer items-center transition-opacity hover:opacity-75'
          >
            <motion.img
              src={cartIcon}
              alt='Cart'
              className='h-6 w-6'
              animate={cartEffect ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            />
            {cart.length > 0 && (
              <motion.span
                className='bg-danger absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md'
                animate={cartEffect ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                {cart.length}
              </motion.span>
            )}
          </a>
        </div>
      </div>
    </header>
  )
}
