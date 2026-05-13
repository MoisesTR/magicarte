// Fixed ambient petal overlay for Mother's Day — auto-hides outside the season window
const PETALS = [
  { emoji: '🌸', left: '4%',  duration: '14s', delay: '0s'  },
  { emoji: '🌷', left: '12%', duration: '19s', delay: '3.5s' },
  { emoji: '🌸', left: '23%', duration: '11s', delay: '7s'  },
  { emoji: '🌺', left: '34%', duration: '16s', delay: '1s'  },
  { emoji: '🌸', left: '47%', duration: '13s', delay: '5s'  },
  { emoji: '🌷', left: '58%', duration: '20s', delay: '2s'  },
  { emoji: '🌸', left: '69%', duration: '12s', delay: '9s'  },
  { emoji: '🌺', left: '80%', duration: '17s', delay: '4s'  },
  { emoji: '🌸', left: '91%', duration: '15s', delay: '6.5s' },
]

export default function FloatingPetals() {
  const year = new Date().getFullYear()
  const mothersDay = new Date(year, 4, 30)
  const diff = Math.ceil((mothersDay - new Date()) / (1000 * 60 * 60 * 24))
  if (diff < -2 || diff > 20) return null

  return (
    <div className='fixed inset-0 pointer-events-none overflow-hidden z-[1]' aria-hidden='true'>
      {PETALS.map((petal, i) => (
        <span
          key={i}
          className='absolute bottom-0 select-none text-lg'
          style={{
            left: petal.left,
            animationName: 'petalFloat',
            animationDuration: petal.duration,
            animationDelay: petal.delay,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            opacity: 0.55,
          }}
        >
          {petal.emoji}
        </span>
      ))}
    </div>
  )
}
