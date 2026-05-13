import Products from './Products'
import { useEffect, useState, useRef } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import Footer from '../components/Footer'
import Header from '../components/Header'
import CartModal from '../components/CartModal'
import CartNotification from '../components/CartNotification'
import MothersDayHero from '../components/MothersDayHero'
import { TABLE } from '../utils/constants'
import { useApp } from '../context/AppContext'
import { FEATURES } from '../config/features'
import { getMothersDay } from '../utils/holidays'


export default function Home() {
  const { showCartModal, setShowCartModal } = useApp()
  const order = { column: 'order' }
  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    order,
  })
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const modifiedCategories =
    categories.length > 0 && categories[0].name !== 'Todos'
      ? [{ id: 0, name: 'Todos' }, ...categories]
      : categories

  const [selectedCategory, setSelectedCategory] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const dropdownRef = useRef(null)
  const productsRef = useRef(null)

  const mothersDayBannerActive = getMothersDay().isActive
  
  useEffect(() => {
    if (!selectedCategory && modifiedCategories.length > 0) {
      setSelectedCategory(modifiedCategories[0])
    }
  }, [modifiedCategories, selectedCategory])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <>
      <div className='min-h-screen bg-gradient-to-br from-rose-50/60 to-pink-50/40'>
        <Header
          onCartClick={() => setShowCartModal(true)}
          categories={modifiedCategories}
          selectedCategory={selectedCategory}
          onCategorySelect={(cat) => { setSelectedCategory(cat); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onBannerDismiss={() => setBannerDismissed(true)}
        />

      <main className={mothersDayBannerActive && !bannerDismissed ? 'pt-44' : 'pt-32'}>
        {/* Main Content */}
        <div className='max-w-7xl mx-auto px-6 pt-16 pb-6'>
          <MothersDayHero
            categories={modifiedCategories}
            onCategorySelect={(cat) => {
              setSelectedCategory(cat)
              productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          />
          <div ref={productsRef}>
            <Products selectedCategory={selectedCategory} categories={modifiedCategories} />
          </div>
        </div>
      </main>

      <Footer />

      {/* Cart functionality - controlled by feature flags */}
      <div className={!FEATURES.SHOW_CART_COMPONENTS ? 'hidden' : ''}>
        <CartModal isOpen={showCartModal} />
        <CartNotification />
      </div>

      {/* Back to top */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className='fixed bottom-6 right-6 z-50 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white p-3 rounded-full shadow-lg hover:opacity-90 transition-opacity duration-200'
          aria-label='Volver arriba'
        >
          <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2.5} d='M5 15l7-7 7 7' />
          </svg>
        </button>
      )}
    </div>
    </>
  )
}
