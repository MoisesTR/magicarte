// Data-access layer for products. All product writes go through here so
// business_id is stamped in exactly one place and the rest of the app never
// touches supabase.from('products') directly (keeps Supabase coupling contained).

import { supabase } from '../config/supabaseClient'

/** List products for a business (admin). Unscoped if businessId is unknown. */
export function fetchProductsForBusiness(businessId) {
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

/** Create a product, stamping the owning business. Returns the inserted row. */
export function createProduct(productData, businessId) {
  return supabase.from('products').insert([{ ...productData, business_id: businessId }]).select()
}

/** Update a product (business_id is intentionally left unchanged). */
export function updateProduct(id, productData) {
  return supabase.from('products').update(productData).eq('id', id)
}

/** Toggle / set a product's visibility. */
export function setProductVisibility(id, isVisible) {
  return supabase.from('products').update({ is_visible: isVisible }).eq('id', id)
}

/** Delete a product. */
export function deleteProduct(id) {
  return supabase.from('products').delete().eq('id', id)
}
