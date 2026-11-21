// Data-access layer for products. All product writes go through here so
// business_id is stamped in exactly one place and the rest of the app never
// touches supabase.from('products') directly (keeps Supabase coupling contained).

import { supabase } from '../config/supabaseClient'
import { productPriceModeFallback } from '../utils/productPricePayload.js'

/** List products for a business (admin). Unscoped if businessId is unknown. */
export function fetchProductsForBusiness(businessId) {
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

/** Create a product, stamping the owning business. Returns the inserted row. */
export async function createProduct(productData, businessId) {
  const payload = { ...productData, business_id: businessId }
  const write = data => supabase.from('products').insert([data]).select()
  const result = await write(payload)
  const legacy = productPriceModeFallback(payload, result.error)
  return legacy ? { ...await write(legacy), priceModeAvailable: false } : result
}

/** Update a product (business_id is intentionally left unchanged). */
export async function updateProduct(id, productData) {
  const write = data => supabase.from('products').update(data).eq('id', id)
  const result = await write(productData)
  const legacy = productPriceModeFallback(productData, result.error)
  return legacy ? { ...await write(legacy), priceModeAvailable: false } : result
}

/** Toggle / set a product's visibility. */
export function setProductVisibility(id, isVisible) {
  return supabase.from('products').update({ is_visible: isVisible }).eq('id', id)
}

/** Delete a product. */
export function deleteProduct(id) {
  return supabase.from('products').delete().eq('id', id)
}
