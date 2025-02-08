export function generateWhatsAppLinkForProducts(
  products,
  phoneNumber = '50557503212'
) {
  const header = 'Me interesan estos productos:\n'
  const productMessages = products.map((product) => {
    return `\nProducto: ${product.name}\nPrecio: C$${product.price}\nDescripcion: ${product.description}`
  })

  const message = `${header}${productMessages.join('\n\n')}`
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`
}
