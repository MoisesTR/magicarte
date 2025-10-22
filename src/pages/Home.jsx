import Products from './Products'
import { useEffect, useState } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import Footer from '../components/Footer'
import Header from '../components/Header'
import CartModal from '../components/CartModal'
import { TABLE } from '../utils/constants'
import { useApp } from '../context/AppContext'

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
  useEffect(() => {
    if (!selectedCategory && modifiedCategories.length > 0) {
      setSelectedCategory(modifiedCategories[0])
    }
  }, [modifiedCategories, selectedCategory])

  return (
    <div className='flex min-h-screen flex-col bg-gradient-to-br from-blue-50/40 to-green-50/40'>
      <Header onCartClick={() => setShowCartModal(true)} />

      <main className='mx-auto max-w-7xl flex-grow px-6 py-16 pt-32 lg:px-8'>
        <section className='mb-12 text-center'>
          <div className='flex flex-wrap justify-center gap-3'>
            {modifiedCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category)}
                className={`cursor-pointer rounded-full px-6 py-3 text-sm font-semibold transition-all duration-300 ease-in-out ${
                  selectedCategory?.id === category.id
                    ? 'bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-gradient-to-r hover:from-[#51c879] hover:to-[#50bfe6] hover:text-white hover:shadow-md border border-gray-200'
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

      <CartModal isOpen={showCartModal} />
    </div>
  )
}
