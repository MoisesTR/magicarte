import { supabase } from '../config/supabaseClient'

/** Pinned notes first, then most recently updated. */
export function fetchBusinessNotes(businessId) {
  return supabase
    .from('business_notes')
    .select('*')
    .eq('business_id', businessId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })
}
export function createNote(note, businessId) {
  return supabase
    .from('business_notes')
    .insert([{ ...note, business_id: businessId }])
    .select()
    .single()
}

export function updateNote(id, note, businessId) {
  return supabase
    .from('business_notes')
    .update(note)
    .eq('id', id)
    .eq('business_id', businessId)
    .select()
    .single()
}

export function deleteNote(id, businessId) {
  return supabase
    .from('business_notes')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)
}
