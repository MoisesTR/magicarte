// Data-access layer for categories. Writes go through here so business_id is
// stamped centrally.

import { supabase } from '../config/supabaseClient'

/** Create a category, stamping the owning business. */
export function createCategory({ name, order }, businessId) {
  return supabase.from('categories').insert([{ name, order, business_id: businessId }])
}

/** Update a category's editable fields. */
export function updateCategory(id, fields) {
  return supabase.from('categories').update(fields).eq('id', id)
}

/** Delete a category. */
export function deleteCategory(id) {
  return supabase.from('categories').delete().eq('id', id)
}

/**
 * Persist a reordered list. Each entry carries its own business_id so the upsert
 * never nulls it. Items without an id are new and get stamped with businessId.
 */
export function reorderCategories(updates, businessId) {
  const rows = updates.map((u) => ({
    ...u,
    business_id: u.business_id ?? businessId,
  }))
  return supabase.from('categories').upsert(rows)
}
