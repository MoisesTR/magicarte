export function generateWhatsAppLinkForProducts(
  products,
  phoneNumber = '50557503212'
) {
  if (window.fbq) {
    window.fbq('track', 'Contact', { method: 'WhatsApp' });
  }

  // Simple format like the original - just change the message text
  const header = 'Hola! Me gustaria solicitar cotizacion para:\n\n'
  const productMessages = products.map((product) => {
    return `- ${product.name}: C$${product.price}`
  })

  const footer = '\n\nTiempo estimado: 1 semana. Gracias!'
  const message = `${header}${productMessages.join('\n')}${footer}`
  const encodedMessage = encodeURIComponent(message)
  
  // Use the original simple format
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`
}