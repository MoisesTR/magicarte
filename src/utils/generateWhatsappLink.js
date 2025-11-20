export function generateWhatsAppLinkForProducts(
  products,
  phoneNumber = '50557503212'
) {
  if (window.fbq) {
    window.fbq('track', 'Contact', { method: 'WhatsApp' });
  }

  const header = 'Hola! Me gustaria solicitar cotizacion para:\n\n'
  const productMessages = products.map((product) => {
    return `- ${product.name}: C$${product.price}`
  })

  const footer = '\n\nTiempo estimado: de 3 a 5 días hábiles. Gracias!'
  const message = `${header}${productMessages.join('\n')}${footer}`
  const encodedMessage = encodeURIComponent(message)
  
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`
}

export function generateWhatsAppLinkForSingleProduct(
  product,
  phoneNumber = '50557503212'
) {
  if (window.fbq) {
    window.fbq('track', 'Contact', { method: 'WhatsApp' });
  }

  const message = `Hola! Me gustaria solicitar cotizacion para:

- ${product.name}: C$${product.price}

Tiempo estimado: de 3 a 5 días hábiles. Gracias!`
  
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`
}