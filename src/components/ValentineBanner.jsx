import { useState, useEffect } from 'react'

export default function ValentineBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [daysLeft, setDaysLeft] = useState(0)

  useEffect(() => {
    const valentine = new Date(new Date().getFullYear(), 1, 14) // Feb 14
    const now = new Date()
    const diff = Math.ceil((valentine - now) / (1000 * 60 * 60 * 24))
    setDaysLeft(diff)
  }, [])

  // Don't show after Valentine's Day
  if (daysLeft < 0 || dismissed) return null

  return (
    <div className='relative bg-gradient-to-r from-pink-500 via-red-500 to-pink-500 text-white overflow-hidden'>
      <div className='container mx-auto px-6 py-3 flex items-center justify-between relative'>
        <div className='flex items-center gap-3 flex-1 justify-center text-center'>
          <span className='text-lg hidden sm:inline'>💝</span>
          <p className='text-sm md:text-base font-medium'>
            {daysLeft === 0 ? (
              '¡Hoy es San Valentín! Sorprende a esa persona especial 💕'
            ) : daysLeft === 1 ? (
              '¡Mañana es San Valentín! Último día para hacer tu pedido 🔥'
            ) : daysLeft <= 3 ? (
              <span>
                ¡Solo quedan <strong>{daysLeft} días</strong> para San Valentín!
                Haz tu pedido ahora 🔥
              </span>
            ) : (
              <span>
                🌹 San Valentín en <strong>{daysLeft} días</strong> — Encuentra
                el regalo perfecto hecho con amor
              </span>
            )}
          </p>
          <span className='text-lg hidden sm:inline'>💝</span>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className='ml-4 text-white/70 hover:text-white transition-colors flex-shrink-0'
          aria-label='Cerrar banner'
        >
          <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
          </svg>
        </button>
      </div>
    </div>
  )
}
