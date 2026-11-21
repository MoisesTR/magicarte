// Data-access layer for products. All product writes go through here so
// business_id is stamped in exactly one place and the rest of the app never
// touches supabase.from('products') directly (keeps Supabase coupling contained).

import { supabase } from '../config/supabaseClient'
import { productOptionalColumnsFallback } from '../utils/productPricePayload.js'

/** List products for a business (admin). Unscoped if businessId is unknown. */
export function fetchProductsForBusiness(businessId) {
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

// Each retry removes one confirmed missing optional column (at most two).
async function writeProduct(write, payload) {
  let candidate = payload
  const availability = {}
  while (true) {
    const result = await write(candidate)
    const legacy = productOptionalColumnsFallback(candidate, result.error)
    if (!legacy) return { ...result, ...availability }
    if (Object.hasOwn(candidate, 'price_mode') && !Object.hasOwn(legacy, 'price_mode')) availability.priceModeAvailable = false
    if (Object.hasOwn(candidate, 'video_url') && !Object.hasOwn(legacy, 'video_url')) availability.videoAvailable = false
    candidate = legacy
  }
}

/** Create a product, stamping the owning business. Returns the inserted row. */
export function createProduct(productData, businessId) {
  const payload = { ...productData, business_id: businessId }
  return writeProduct(data => supabase.from('products').insert([data]).select(), payload)
}

/** Update a product (business_id is intentionally left unchanged). */
export function updateProduct(id, productData) {
  return writeProduct(data => supabase.from('products').update(data).eq('id', id), productData)
}

/** Toggle / set a product's visibility. */
export function setProductVisibility(id, isVisible) {
  return supabase.from('products').update({ is_visible: isVisible }).eq('id', id)
}

/** Delete a product. */
export function deleteProduct(id) {
  return supabase.from('products').delete().eq('id', id)
}
