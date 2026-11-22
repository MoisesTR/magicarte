import { useState } from 'react'
import { activeCampaign, campaignBannerText } from '../utils/seasonalCampaigns.js'

export default function SeasonalBanner({ onDismiss, campaign = activeCampaign() }) {
  const [dismissed, setDismissed] = useState(false)
  const text = campaign ? campaignBannerText(campaign) : null
  if (!text || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div className={`relative overflow-hidden bg-gradient-to-r ${campaign.banner.className}`} style={{ height: 'var(--seasonal-banner-height)' }}>
      <div className='container mx-auto h-full px-4 flex items-center gap-2'>
        <p className='min-w-0 flex-1 text-center text-sm md:text-base leading-5 font-medium'>
          {text}
        </p>
        <button
          type='button'
          onClick={handleDismiss}
          className='min-h-11 min-w-11 flex shrink-0 items-center justify-center rounded-lg hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
          aria-label='Cerrar banner'
        >
          <svg aria-hidden='true' className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
          </svg>
        </button>
      </div>
    </div>
  )
}
