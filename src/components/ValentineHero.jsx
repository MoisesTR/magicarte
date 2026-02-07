export default function ValentineHero({ categories, onCategorySelect }) {
  // First real category (by order) is the featured/seasonal one
  const featuredCategory = categories.find((cat) => cat.name !== 'Todos')

  if (!featuredCategory) return null

  const handleClick = () => {
    if (onCategorySelect) {
      onCategorySelect(featuredCategory)
    }
  }

  return (
    <section className='relative overflow-hidden rounded-2xl bg-gradient-to-r from-pink-500 to-red-400 text-white'>
      <div className='relative px-8 py-10 md:py-14 md:px-12 max-w-2xl'>
        <p className='text-pink-100 text-sm font-medium tracking-wide uppercase mb-2'>
          San Valentín 2026
        </p>
        <h2 className='text-3xl md:text-4xl font-bold leading-tight mb-3'>
          Regala algo hecho con amor
        </h2>
        <p className='text-pink-100 text-base md:text-lg mb-6 max-w-md'>
          Sorprende a esa persona especial con un detalle único y personalizado en MDF.
        </p>

        <div className='flex flex-col sm:flex-row items-start gap-4'>
          <button
            onClick={handleClick}
            className='bg-white text-pink-600 font-semibold px-6 py-3 rounded-xl hover:bg-pink-50 transition-colors duration-200 shadow-lg'
          >
            Ver regalos de {featuredCategory.name} →
          </button>

          <div className='bg-white/15 backdrop-blur-sm px-4 py-3 rounded-xl border border-white/20'>
            <p className='text-white text-sm font-semibold'>
              📅 Pedidos hasta el 12 de febrero
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
