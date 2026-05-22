import ReactGA from 'react-ga4'

const isGoogleAnalyticsEnabled = () =>
  import.meta.env.VITE_GA_ENABLED === 'true' &&
  Boolean(import.meta.env.VITE_GA_MEASUREMENT_ID)

const getProductItem = (product) => ({
  item_id: product.id,
  item_name: product.name,
  price: Number(product.price) || 0,
})

export const initializeGoogleAnalytics = () => {
  if (!isGoogleAnalyticsEnabled()) return
  ReactGA.initialize(import.meta.env.VITE_GA_MEASUREMENT_ID)
}

export const trackPageView = (path) => {
  if (!isGoogleAnalyticsEnabled()) return
  ReactGA.send({ hitType: 'pageview', page: path })
}

export const trackEvent = (name, params = {}) => {
  if (!isGoogleAnalyticsEnabled()) return
  ReactGA.event(name, params)
}

export const trackSelectItem = (product) => {
  if (!product) return
  trackEvent('select_item', {
    currency: 'NIO',
    value: Number(product.price) || 0,
    items: [getProductItem(product)],
  })
}

export const trackViewItem = (product) => {
  if (!product) return
  trackEvent('view_item', {
    currency: 'NIO',
    value: Number(product.price) || 0,
    items: [getProductItem(product)],
  })
}

export const trackWhatsAppContact = (product) => {
  trackEvent('contact_whatsapp', {
    method: 'WhatsApp',
    ...(product ? { item_id: product.id, item_name: product.name } : {}),
  })
}

export const trackGenerateLead = (product) => {
  if (!product) return
  trackEvent('generate_lead', {
    currency: 'NIO',
    value: Number(product.price) || 0,
    method: 'WhatsApp',
    items: [getProductItem(product)],
  })
}

export const trackAddToCart = (product) => {
  if (!product) return
  trackEvent('add_to_cart', {
    currency: 'NIO',
    value: Number(product.price) || 0,
    items: [getProductItem(product)],
  })
}
