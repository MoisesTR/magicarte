import Products from './Products'
import { useEffect, useState, useRef } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import Footer from '../components/Footer'
import Header from '../components/Header'
import CartModal from '../components/CartModal'
import CartNotification from '../components/CartNotification'
import { TABLE } from '../utils/constants'
import { useApp } from '../context/AppContext'
import { FEATURES } from '../config/features'


export default function Home() {
  const { showCartModal, setShowCartModal } = useApp()
  const order = { column: 'order' }
  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    order,
  })
  const modifiedCategories =
    categories.length > 0 && categories[0].name !== 'Todos'
      ? [{ id: 0, name: 'Todos' }, ...categories]
      : categories

  const [selectedCategory, setSelectedCategory] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const dropdownRef = useRef(null)
  
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
      <div className='min-h-screen bg-gradient-to-br from-pink-50/40 to-red-50/30'>
        <Header 
          onCartClick={() => setShowCartModal(true)}
          categories={modifiedCategories}
          selectedCategory={selectedCategory}
          onCategorySelect={(cat) => { setSelectedCategory(cat); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        />

      <main className='pt-32'>
        {/* Main Content */}
        <div className='max-w-7xl mx-auto px-6 py-12'>

          {/* Current Category Header */}

          <Products selectedCategory={selectedCategory} categories={modifiedCategories} />
        </div>
      </main>

      <Footer />

      {/* Cart functionality - controlled by feature flags */}
      <div className={!FEATURES.SHOW_CART_COMPONENTS ? 'hidden' : ''}>
        <CartModal isOpen={showCartModal} />
        <CartNotification />
      </div>
    </div>
    </>
  )
}
