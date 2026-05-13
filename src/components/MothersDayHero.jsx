import { getMothersDay } from '../utils/holidays'

export default function MothersDayHero({ categories, onCategorySelect }) {
  const { isActive, daysLeft } = getMothersDay()
  const featuredCategory = categories.find((cat) => cat.name !== 'Todos')

  if (!featuredCategory || !isActive) return null

  const handleClick = () => onCategorySelect?.(featuredCategory)

  return (
    <section className='relative overflow-hidden rounded-2xl text-white mb-4 bg-gradient-to-br from-rose-500 via-pink-400 to-fuchsia-400'>
      {/* Shimmer sweep */}
      <div className='absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 animate-shimmer pointer-events-none' />

      <div className='relative grid md:grid-cols-2'>
        {/* Left: Main content */}
        <div className='px-8 py-10 md:py-14 md:px-12'>
          <div className='inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold mb-5 border border-white/30'>
            🌷 30 de Mayo · Día de las Madres Nicaragua
          </div>

          <h2 className='text-3xl md:text-4xl font-bold leading-tight mb-3'>
            Regala amor a mamá
          </h2>
          <p className='text-pink-100 text-base md:text-lg mb-7 max-w-sm'>
            Detalles únicos en MDF, personalizados con el cariño que ella merece.
          </p>

          <div className='flex flex-col sm:flex-row items-start gap-3'>
            <button
              onClick={handleClick}
              className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity duration-200 shadow-lg'
            >
              Ver regalos para mamá →
            </button>

            {daysLeft > 2 && (
              <div className='bg-white/15 backdrop-blur-sm px-4 py-3 rounded-xl border border-white/25 flex items-center gap-2'>
                <span>📅</span>
                <p className='text-white text-sm font-semibold'>Pedidos hasta el 27 de mayo</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Value-prop card — desktop only */}
        <div className='hidden md:flex items-center justify-center p-10'>
          <div className='bg-white/15 backdrop-blur-sm rounded-2xl p-6 border border-white/25 shadow-xl w-full max-w-xs'>
            <p className='text-white/75 text-xs font-semibold uppercase tracking-widest mb-1'>Con amor para</p>
            <p className='text-white text-2xl font-bold mb-5'>Mamá 💐</p>
            <div className='flex flex-col gap-2.5'>
              <div className='bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-3'>
                <span className='text-lg'>✨</span>
                <span className='text-white/90 text-sm font-medium'>Diseños únicos en MDF</span>
              </div>
              <div className='bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-3'>
                <span className='text-lg'>🎨</span>
                <span className='text-white/90 text-sm font-medium'>Personalizado con tu mensaje</span>
              </div>
              <div className='bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-3'>
                <span className='text-lg'>🌸</span>
                <span className='text-white/90 text-sm font-medium'>Hecho con amor artesanal</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
