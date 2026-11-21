import {
  formatPresentationMoney,
  presentationPrice,
  presentationPriceLabel,
} from './productPresentations.js'

export function productPriceDisplay(product, presentations = []) {
  const mode = ['from', 'quote'].includes(product?.price_mode)
    ? product.price_mode
    : 'fixed'
  if (mode === 'quote') {
    return {
      mode,
      label: 'Precio según diseño',
      note: 'Cotice sin compromiso por WhatsApp.',
    }
  }
  if (mode === 'from') {
    return {
      mode,
      label: `Desde ${formatPresentationMoney(presentationPrice(presentations, product?.price)).replace('C$', 'C$ ')}`,
      note: 'El precio final depende del tamaño y los detalles.',
    }
  }
  // Preserve both legacy labels byte-for-byte, including their currency spacing.
  return {
    mode,
    label: presentations.length
      ? presentationPriceLabel(presentations, product?.price)
      : `C$ ${product?.price}`,
    note: null,
  }
}
