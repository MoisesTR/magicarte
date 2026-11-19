import { presentationMessageLines } from './productPresentations'
import {CONTACT_PHONE} from "./constants.js";
import { trackWhatsAppContact } from './analytics'

export function generateWhatsAppLinkForProducts(
  products,
  phoneNumber = CONTACT_PHONE
) {
  if (window.fbq) {
    window.fbq('track', 'Contact', { method: 'WhatsApp' });
  }
  trackWhatsAppContact()

  const header = 'Hola! Me gustaría cotizar:\n\n'
  const productMessages = products.map((product) => {
    return `- ${product.name}: C$${product.price}`
  })

  const footer = '\n\nGracias!'
  const message = `${header}${productMessages.join('\n')}${footer}`
  const encodedMessage = encodeURIComponent(message)

  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`
}

export function generateWhatsAppLinkForSingleProduct(
  product,
  phoneNumber = CONTACT_PHONE,
  configuration = null
) {
  if (window.fbq) {
    window.fbq('track', 'Contact', { method: 'WhatsApp' });
  }
  trackWhatsAppContact(product)

  const productUrl = `${window.location.origin}/product/${product.id}`
  const description = configuration
    ? presentationMessageLines(product, configuration.presentation || { label: 'Unidad', units: 1, price: product.price }, configuration.packs, configuration.designs, configuration.hasDesigns).join('\n')
    : `- ${product.name}: C$${product.price}`
  const message = `Hola! Me gustaría cotizar:

${description}
${productUrl}

Gracias!`

  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`
}
