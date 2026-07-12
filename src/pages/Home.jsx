import Products from './Products'
import { useEffect, useMemo, useState, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import Footer from '../components/Footer'
import Header from '../components/Header'
import MothersDayHero from '../components/MothersDayHero'
import { TABLE } from '../utils/constants'
import { getMothersDay } from '../utils/holidays'
import { useBusiness } from '../context/BusinessContext'
import { businessFilter } from '../data/scope'

export default function Home() {
  const { publicBusinessId, rootRedirectPending, rootRedirectTo } = useBusiness()
  const order = { column: 'order' }
  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    filters: businessFilter(publicBusinessId),
    order,
  })
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const modifiedCategories = useMemo(
    () => (categories.length > 0 && categories[0].name !== 'Todos' ? [{ id: 0, name: 'Todos' }, ...categories] : categories),
    [categories],
  )

  const [selectedCategory, setSelectedCategory] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const productsRef = useRef(null)

  const mothersDayBannerActive = getMothersDay().isActive
  
  useEffect(() => {
    if (!selectedCategory && modifiedCategories.length > 0) {
      setSelectedCategory(modifiedCategories[0])
    }
  }, [modifiedCategories, selectedCategory])

  // A signed-in user with no Magic Arte access (e.g. a Hikari-only login) has
  // no reason to land on this storefront — send them to their own dashboard.
  // `rootRedirectPending` covers the brief auth-check window so we don't flash
  // the storefront at them right before bouncing them elsewhere.
  if (rootRedirectPending) return null
  if (rootRedirectTo) return <Navigate to={rootRedirectTo} replace />

  return (
    <>
      <div className='min-h-screen bg-gradient-to-br from-rose-50/60 to-pink-50/40'>
        <Header
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
