import { useState } from 'react'
import { getMothersDay } from '../utils/holidays'

export default function MothersDayBanner({ onDismiss }) {
  const [dismissed, setDismissed] = useState(false)
  const { isActive, daysLeft } = getMothersDay()

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  if (!isActive || dismissed) return null

  return (
    <div className='relative bg-gradient-to-r from-rose-400 via-pink-400 to-purple-300 text-white overflow-hidden'>
      <div className='container mx-auto px-6 py-3 flex items-center justify-between'>
        <div className='flex items-center gap-3 flex-1 justify-center text-center'>
          <span className='text-lg hidden sm:inline'>🌸</span>
          <p className='text-sm md:text-base font-medium'>
            {daysLeft < 0 ? (
              '¡Feliz Día de las Madres! 💐 Gracias por confiar en MagicArte'
            ) : daysLeft === 0 ? (
              '¡Hoy es el Día de las Madres! Sorprende a tu mamá con algo especial 🌷'
            ) : daysLeft === 1 ? (
              '¡Mañana es el Día de las Madres! Último día para hacer tu pedido 🔥'
            ) : daysLeft <= 5 ? (
              <span>
                ¡Solo quedan <strong>{daysLeft} días</strong> para el Día de las Madres! Haz tu pedido ahora 💐
              </span>
            ) : (
              <span>
                🌸 Día de las Madres el <strong>30 de mayo</strong> — Regala algo único hecho con amor
              </span>
            )}
          </p>
          <span className='text-lg hidden sm:inline'>🌸</span>
        </div>

        <button
          onClick={handleDismiss}
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
