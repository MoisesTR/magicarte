import { useNavigate } from 'react-router-dom'
import MothersDayBanner from './MothersDayBanner'

export default function Header({ categories = [], selectedCategory, onCategorySelect, onBannerDismiss }) {
  const navigate = useNavigate()

  const handleLogoClick = () => {
    navigate('/')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const todosCategory = categories.find(cat => cat.name === 'Todos')
    if (todosCategory && onCategorySelect) onCategorySelect(todosCategory)
  }

  return (
    <header className='bg-white fixed top-0 left-0 z-50 w-full shadow-lg border-b border-gray-100'>
      <MothersDayBanner onDismiss={onBannerDismiss} />
      <div className='border-b border-gray-100'>
        <div className='container mx-auto flex items-center justify-between py-4 px-6'>
          <div
            onClick={handleLogoClick}
            className='cursor-pointer hover:opacity-80 transition-opacity duration-200'
          >
            <h1 className='text-3xl font-bold tracking-tight'>
              <span className='text-[#51c879]'>Magic</span>
              <span className='text-[#50bfe6]'>Arte</span>
            </h1>
            <p className='text-sm text-gray-500 font-medium'>Artesanía en MDF</p>
          </div>
        </div>
      </div>

      {/* Category Navigation */}
      {categories.length > 0 && (
        <div className='bg-gray-50 relative'>
          {/* Fade hint for horizontal scroll on mobile */}
          <div className='pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-gray-50 to-transparent z-10 md:hidden' />
          <div className='overflow-x-auto scrollbar-hide'>
            <div className='flex items-center justify-start md:justify-center gap-3 px-6 py-3 min-w-min'>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => onCategorySelect?.(category)}
                  className={`flex-shrink-0 px-6 py-3 rounded-full text-base font-semibold transition-all duration-200 whitespace-nowrap ${
                    selectedCategory?.id === category.id
                      ? 'bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-100 hover:shadow-sm border border-gray-200'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}