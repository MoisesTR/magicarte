const DEFAULT_MATERIAL = 'Trabajo realizado en MDF (Fibrán) mediante técnica de corte láser. Cada pieza es lijada, pintada a mano y barnizada con capa protectora 🎨'
const DEFAULT_CARE = `Para limpiar tu producto te recomendamos usar una brocha seca (como las de maquillaje) o un plumero para sacar el polvo de los relieves y rendijas de forma delicada.

No recomendamos usar ningún producto líquido, ya sea agua o químicos de limpieza, ya que pueden afectar el acabado de la madera (MDF) o la pintura.

No exponer a los rayos directos del sol durante períodos prolongados de tiempo, ya que podría opacar la pintura y perder su brillo.

Cada pieza es una obra artesanal única, por lo que te pedimos manejarla con cuidado y cariño. El MDF no resiste impactos fuertes ni caídas.`

const TEMPLATE_MATERIALS = new Map([
  ['mdfFrame', 'Trabajo realizado en MDF (Fibrán) mediante corte láser.'],
  ['acrylicPiece', 'Acrílico cortado con láser.'],
  ['acrylicUv', 'Acrílico cortado con láser e impresión UV a todo color.'],
  ['uvOnWood', 'Impresión UV a todo color sobre madera.'],
  ['print3d', 'Pieza impresa en 3D.'],
  ['print3dUv', 'Pieza impresa en 3D con detalles en impresión UV.'],
  ['layeredOrnament', 'Madera cortada y grabada con láser, con capa de acrílico.'],
])

export function newOrderForm(orderDate = '') {
  return {
    client_id: null,
    customer_name: '',
    customer_phone: '',
    customer_social_media: '',
    delivery_address: '',
    delivery_method: 'delivery',
    order_date: orderDate,
    status: 'pending',
    priority: 'normal',
    follow_up_reason: '',
    follow_up_date: '',
    notes: '',
    estimated_delivery_date: '',
    delivery_fee: 0,
    recipient_name: '',
    recipient_phone: '',
    is_gift: false,
    items: [],
  }
}

export function newProductForm() {
  return {
    name: '', price: '', width: '', length: '', description: '', category_id: '',
    stock_quantity: 1, image_url: '', secondary_images: [],
    material_technique: DEFAULT_MATERIAL, care_instructions: DEFAULT_CARE, is_visible: true,
  }
}

function positiveDimension(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : ''
}

function roundedPrice(value) {
  const number = Number(value)
  // Decimal shifting avoids binary ties such as 10.075 becoming 10.07.
  const [coefficient, exponent = '0'] = String(number).split('e')
  return Math.round(Number(`${coefficient}e${Number(exponent) + 2}`)) / 100
}

function normalizedName(value) {
  return (value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function validDeliveryDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  if (value.startsWith('0000')) return ''
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : ''
}

// Whole-order calculator measurements describe the nest of all pieces, not one piece.
function pieceDimension(state, key) {
  return state?.materialScope === 'order' ? '' : positiveDimension(state?.[key])
}

export function orderFormFromQuote(quote, { deliveryDate, clients = [], linkedProduct, orderDate = '' } = {}) {
  const name = normalizedName(quote.client_name)
  const client = name ? clients.find(client => normalizedName(client.name) === name) : null
  const width = pieceDimension(quote.state, 'widthCm')
  const height = pieceDimension(quote.state, 'heightCm')
  return {
    ...newOrderForm(orderDate),
    client_id: client?.id || null,
    customer_name: quote.client_name || '',
    customer_phone: client?.phone || '',
    customer_social_media: client?.social_media || '',
    delivery_address: client?.delivery_address || '',
    estimated_delivery_date: validDeliveryDate(deliveryDate),
    notes: `Desde la cotización «${quote.name}» de la calculadora.`,
    items: [{
      product_id: linkedProduct?.id || null,
      product_query: linkedProduct?.id ? quote.name : '',
      product_open: false,
      product_active_index: -1,
      product_name: quote.name,
      product_description: width && height ? `Medida: ${width} × ${height} cm` : '',
      quantity: Number(quote.quantity),
      unit_price: roundedPrice(quote.unit_price),
      hours_needed: 0,
      rush_fee: 0,
      is_custom: !linkedProduct?.id,
      material: '',
      engraving_minutes: '',
    }],
  }
}

export function calculatorDataFromQuote(quote) {
  return {
    source: 'magic-calculator',
    quoteId: quote.id,
    quoteName: quote.name,
    quantity: Number(quote.quantity),
    unitPrice: Number(quote.unit_price),
    totalPrice: Number(quote.total_price),
    unitCost: Number(quote.unit_cost),
    totalCost: Number(quote.total_cost),
  }
}

export function productFormFromQuote(quote) {
  const defaults = newProductForm()
  return {
    ...defaults,
    name: quote.name,
    price: roundedPrice(quote.unit_price),
    width: pieceDimension(quote.state, 'widthCm'),
    length: pieceDimension(quote.state, 'heightCm'),
    material_technique: TEMPLATE_MATERIALS.get(quote.template_id) || defaults.material_technique,
    is_visible: false,
  }
}
