import Products from './Products'
import { useEffect, useState } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import Footer from '../components/Footer'
import Header from '../components/Header'
import AppProvider from '../context/AppContext'
import CartModal from '../components/CartModal'
import { TABLE } from '../utils/constants'

export default function Home() {
  const order = { column: 'order' }
  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    order,
  })

  const modifiedCategories =
    categories.length > 0 && categories[0].name !== 'Todos'
      ? [{ id: 0, name: 'Todos' }, ...categories]
      : categories

  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showCartModal, setShowCartModal] = useState(false)

  useEffect(() => {
    if (!selectedCategory && modifiedCategories.length > 0) {
      setSelectedCategory(modifiedCategories[0])
    }
  }, [modifiedCategories, selectedCategory])

  return (
    <AppProvider>
      <div className='flex min-h-screen flex-col bg-gray-50'>
        <Header onCartClick={() => setShowCartModal(true)} />

        <main className='mx-auto max-w-7xl flex-grow px-6 py-16 pt-20 lg:px-8'>
          <section className='mb-8 text-center'>
            <div className='flex flex-wrap justify-center gap-3'>
              {modifiedCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category)}
                  className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-in-out ${
                    selectedCategory?.id === category.id
                      ? 'bg-primary scale-110 text-white shadow-xl'
                      : 'bg-gray-200 text-gray-700 hover:bg-[#FFC8D0] hover:text-white hover:shadow'
                  } `}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </section>

          <Products selectedCategory={selectedCategory} />
        </main>

        <Footer />

        <CartModal
          isOpen={showCartModal}
          onClose={() => setShowCartModal(false)}
        />
      </div>
    </AppProvider>
  )
}
