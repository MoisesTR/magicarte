// Data-access layer for the per-business 1:1 product detail tables
// (product_3d_details for Hikari, product_engraving_details for Joyería).
// Each row's primary key IS the product id, so a save is always an upsert.

import { supabase } from '../config/supabaseClient'

/** Hikari 3D-print fields for one product (or null if it has none yet). */
export function fetch3dDetails(productId) {
  return supabase.from('product_3d_details').select('*').eq('product_id', productId).maybeSingle()
}

/** Upsert Hikari 3D-print fields for a product. */
export function upsert3dDetails(productId, fields) {
  return supabase.from('product_3d_details').upsert({ product_id: productId, ...fields })
}

/** Engraving fields for one product (or null if it has none yet). */
export function fetchEngravingDetails(productId) {
  return supabase.from('product_engraving_details').select('*').eq('product_id', productId).maybeSingle()
}

/** Upsert engraving fields for a product. */
export function upsertEngravingDetails(productId, fields) {
  return supabase.from('product_engraving_details').upsert({ product_id: productId, ...fields })
}
