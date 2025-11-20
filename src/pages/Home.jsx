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
    <div className='min-h-screen bg-gradient-to-br from-blue-50/40 to-green-50/40'>
      <Header 
        onCartClick={() => setShowCartModal(true)}
        categories={modifiedCategories}
        selectedCategory={selectedCategory}
        onCategorySelect={setSelectedCategory}
      />

      <main className='pt-32'>
        {/* Main Content */}
        <div className='max-w-7xl mx-auto px-6 py-12'>
          {/* Current Category Header */}
          <div className='mb-12 text-center'>
            <h1 className='text-4xl font-bold text-gray-900 mb-2'>
              {selectedCategory?.name || 'Cargando...'}
            </h1>
            <p className='text-gray-600 text-lg'>Descubre nuestras creaciones únicas en MDF</p>
          </div>

          <Products selectedCategory={selectedCategory} />
        </div>
      </main>

      <Footer />

      {/* Cart functionality - controlled by feature flags */}
      <div className={!FEATURES.SHOW_CART_COMPONENTS ? 'hidden' : ''}>
        <CartModal isOpen={showCartModal} />
        <CartNotification />
      </div>
    </div>
  )
}
