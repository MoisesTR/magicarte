import { daysBetween, nicaraguaToday } from './finance.js'

// Annual, inclusive Managua calendar dates; months are 1-based.
// List order is the tie-breaker if future campaigns overlap.
export const campaigns = [
  {
    id: 'mothers-day',
    start: { month: 5, day: 10 },
    end: { month: 5, day: 30 },
    orderDeadline: '27 de mayo',
    banner: {
      className: 'from-rose-400 via-pink-400 to-purple-300 text-rose-950',
      text: '🌸 Día de las Madres el 30 de mayo — Regale algo único hecho con amor',
      countdown: [
        { maxDays: 0, text: '¡Hoy es el Día de las Madres! Sorprenda a su mamá con algo especial 🌷' },
        { maxDays: 1, text: '¡Mañana es el Día de las Madres! Último día para hacer su pedido 🔥' },
        { maxDays: 5, text: '¡Solo quedan {daysLeft} días para el Día de las Madres! Haga su pedido ahora 💐' },
      ],
    },
    hero: {
      className: 'from-rose-500 via-pink-400 to-fuchsia-400',
      chip: '🌷 30 de Mayo · Día de las Madres Nicaragua',
      title: 'Regale amor a mamá',
      text: 'Detalles únicos en madera, personalizados con el cariño que ella merece.',
      cta: 'Ver regalos para mamá →',
      categoryName: null,
      deadlineMinDays: 2,
      cardEyebrow: 'Con amor para',
      cardTitle: 'Mamá 💐',
      points: ['✨ Diseños únicos en madera', '🎨 Personalizado con su mensaje', '🌸 Hecho con amor artesanal'],
      decoration: 'shimmer',
    },
  },
  {
    id: 'christmas',
    start: { month: 11, day: 15 },
    end: { month: 12, day: 24 },
    orderDeadline: null,
    banner: {
      className: 'from-red-900 via-red-700 to-red-900 text-white',
      // No top banner unless an order deadline is set.
      text: null,
      deadlineText: '🎄 Pedidos para Navidad hasta el {orderDeadline}',
    },
    hero: {
      className: 'from-red-900 via-red-700 to-red-900',
      chip: '🎄 Temporada navideña',
      title: 'Regalos y detalles para esta Navidad',
      text: 'Esferas, nacimientos y adornos personalizados.',
      cta: 'Ver regalos de Navidad →',
      categoryName: 'Navidad',
      cardEyebrow: 'Esta Navidad',
      cardTitle: 'Hecho para usted 🎁',
      points: ['✨ Productos personalizados', '🚚 Envíos a todo el país', '💬 Pedidos por WhatsApp'],
      decoration: 'sparkles',
    },
  },
]

function statusOnDay(campaign, today) {
  const year = today.slice(0, 4)
  const date = ({ month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const end = date(campaign.end)
  return { isActive: today >= date(campaign.start) && today <= end, daysLeft: daysBetween(today, end) }
}

export function campaignStatus(id, now = new Date()) {
  return statusOnDay(campaigns.find(campaign => campaign.id === id), nicaraguaToday(now))
}

export function activeCampaign(now = new Date()) {
  const today = nicaraguaToday(now)
  for (const campaign of campaigns) {
    const status = statusOnDay(campaign, today)
    if (status.isActive) return { ...campaign, daysLeft: status.daysLeft }
  }
  return null
}

export function isSeasonalBannerActive(now = new Date()) {
  const campaign = activeCampaign(now)
  return campaign !== null && campaignBannerText(campaign) !== null
}

export function campaignBannerText(campaign) {
  const { banner, daysLeft, orderDeadline } = campaign
  if (orderDeadline && banner.deadlineText) return banner.deadlineText.replace('{orderDeadline}', orderDeadline)
  const countdown = banner.countdown?.find(message => daysLeft <= message.maxDays)
  const text = countdown?.text ?? banner.text
  return text ? text.replace('{daysLeft}', daysLeft) : null
}

// Missing Christmas categories omit the CTA rather than selecting an unrelated one.
export function campaignCategory(campaign, categories = []) {
  return categories.find(category => campaign.hero.categoryName
    ? category.name === campaign.hero.categoryName
    : category.name !== 'Todos') ?? null
}
