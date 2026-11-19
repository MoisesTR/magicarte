import { supabase } from '../config/supabaseClient'
import { publicColorRows } from '../utils/filamentWall.js'

/** Public RPC only: never query the private stock view from the customer page. */
export async function fetchPublicFilamentColors(slug) {
  try {
    const { data, error } = await supabase.rpc('public_filament_colors', { p_slug: slug })
    return { data: error ? [] : publicColorRows(data), error }
  } catch (error) {
    return { data: [], error }
  }
}
