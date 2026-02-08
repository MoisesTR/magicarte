export const MAGIC_ARTE = 'MagicArte'

export const TABLE = {
  PRODUCT: 'products',
  CATEGORIES: 'categories',
  ORDERS: 'orders',
  ORDER_ITEMS: 'order_items',
}
export const COLUMNS = {
  [TABLE.PRODUCT]:
    'id, name, price, description, image_url, category_id, stock_quantity, secondary_images, width, length',
  [TABLE.CATEGORIES]: 'id, name, order',
  [TABLE.ORDERS]: 'id, order_number, customer_name, customer_phone, customer_social_media, delivery_address, delivery_method, order_date, total_amount, status, priority, notes, created_at, estimated_delivery_date, completed_at, updated_at',
  [TABLE.ORDER_ITEMS]: 'id, order_id, product_id, product_name, product_description, quantity, unit_price, hours_needed, rush_fee, subtotal',
}
