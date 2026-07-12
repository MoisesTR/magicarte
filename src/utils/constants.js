export const MAGIC_ARTE = 'MagicArte'
export const CONTACT_PHONE = '50587795222'

// Things Joyería Trigueros engraves (materials + objects). Edit freely.
export const ENGRAVING_MATERIALS = [
  'Acero inoxidable',
  'Plata',
  'Oro',
  'Cartera',
  'Agenda',
  'Bolígrafo',
  'Otro',
]

export const TABLE = {
  PRODUCT: 'products',
  CATEGORIES: 'categories',
  ORDERS: 'orders',
  ORDER_ITEMS: 'order_items',
  ORDER_PAYMENTS: 'order_payments',
  CLIENTS: 'clients',
}
export const COLUMNS = {
  [TABLE.PRODUCT]:
    'id, name, price, description, image_url, category_id, stock_quantity, secondary_images, width, length, material_technique, care_instructions, is_visible, created_at, business_id',
  [TABLE.CATEGORIES]: 'id, name, order, business_id',
  [TABLE.ORDERS]: 'id, client_id, order_number, customer_name, customer_phone, customer_social_media, delivery_address, delivery_method, order_date, total_amount, status, priority, notes, created_at, estimated_delivery_date, completed_at, updated_at, payment_status, payment_method, follow_up_reason, follow_up_date, calculator_data, delivery_fee, recipient_name, recipient_phone, is_gift',
  [TABLE.ORDER_ITEMS]: 'id, order_id, product_id, product_name, product_description, quantity, unit_price, hours_needed, rush_fee, subtotal',
  [TABLE.ORDER_PAYMENTS]: 'id, order_id, amount, method, paid_at, note, created_at',
  [TABLE.CLIENTS]: 'id, name, phone, social_media, delivery_address, notes, created_at, updated_at',
}
