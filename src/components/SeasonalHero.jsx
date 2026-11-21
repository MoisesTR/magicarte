import { activeCampaign, campaignCategory } from '../utils/seasonalCampaigns.js'

export default function SeasonalHero({ categories = [], onCategorySelect, campaign = activeCampaign() }) {
  if (!campaign) return null
  const { hero, orderDeadline, daysLeft } = campaign
  const featuredCategory = campaignCategory(campaign, categories)
  const showDeadline = orderDeadline && daysLeft > (hero.deadlineMinDays ?? -1)

  return (
    <section className={`relative isolate overflow-hidden rounded-2xl text-white mb-4 bg-gradient-to-br ${hero.className}`}>
      {/* Darken the original pink palette without replacing its colors. */}
      {hero.decoration === 'shimmer' && <div className='absolute inset-0 bg-black/35' aria-hidden='true' />}
      <div className='seasonal-decoration pointer-events-none absolute inset-0 overflow-hidden text-amber-300' aria-hidden='true'>
        {hero.decoration === 'sparkles' ? (
          <>
            <span className='seasonal-sparkle absolute right-6 top-5 text-2xl'>✧</span>
            <span className='seasonal-sparkle absolute right-1/3 top-1/3 text-lg'>❄</span>
            <span className='seasonal-sparkle absolute left-1/2 bottom-5 text-xl'>✦</span>
          </>
        ) : (
          <div className='seasonal-shimmer absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0' />
        )}
      </div>

      <div className='relative grid md:grid-cols-2'>
        <div className='min-w-0 px-6 py-8 md:py-14 md:px-12'>
          <div className='inline-flex bg-black/20 text-amber-100 px-3 py-1 rounded-full text-xs font-semibold mb-5 border border-white/30'>
            {hero.chip}
          </div>
          <h2 className='text-3xl md:text-4xl font-bold leading-tight mb-3 break-words'>{hero.title}</h2>
          <p className='text-white text-base md:text-lg mb-7 max-w-sm'>{hero.text}</p>
          {/* Reserve CTA space while categories load; the hero never depends on a query. */}
          <div className='flex flex-col xl:flex-row items-start gap-3'>
            <div className='min-h-12 w-full xl:w-60 shrink-0'>
              {featuredCategory && (
                <button
                  type='button'
                  onClick={() => onCategorySelect?.(featuredCategory)}
                  className={`min-h-12 w-full max-w-full text-sm leading-5 text-emerald-950 font-semibold px-4 py-3 rounded-xl shadow-lg hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${hero.decoration === 'sparkles' ? 'bg-amber-300' : 'bg-gradient-to-r from-[#51c879] to-[#50bfe6]'}`}
                >
                  {hero.cta}
                </button>
              )}
            </div>
            {showDeadline && (
              <p className='bg-black/20 text-white text-sm font-semibold px-4 py-3 rounded-xl border border-white/25'>
                📅 Pedidos hasta el {orderDeadline}
              </p>
            )}
          </div>
        </div>

        <div className='hidden md:flex min-w-0 items-center justify-center p-8'>
          <div className='bg-black/20 rounded-2xl p-6 border border-amber-300/40 shadow-xl w-full max-w-xs'>
            <p className='text-white text-xs font-semibold uppercase tracking-widest mb-1'>{hero.cardEyebrow}</p>
            <p className='text-white text-2xl font-bold mb-5'>{hero.cardTitle}</p>
            <ul className='flex flex-col gap-2.5'>
              {hero.points.map(point => (
                <li key={point} className='bg-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-medium'>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
