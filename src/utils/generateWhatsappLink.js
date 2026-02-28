import {CONTACT_PHONE} from "./constants.js";

export function generateWhatsAppLinkForProducts(
  products,
  phoneNumber = CONTACT_PHONE
) {
  if (window.fbq) {
    window.fbq('track', 'Contact', { method: 'WhatsApp' });
  }

  const header = 'Hola! 👋 Me gustaría cotizar:\n\n'
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
  phoneNumber = CONTACT_PHONE
) {
  if (window.fbq) {
    window.fbq('track', 'Contact', { method: 'WhatsApp' });
  }

  const message = `Hola! 👋 Me gustaría cotizar:

- ${product.name}: C$${product.price}

Gracias!`

  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`
}
