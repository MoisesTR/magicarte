import { supabase } from '../config/supabaseClient'

/** Machines a business is paying off — active ones first, then by name. */
export function fetchBusinessMachines(businessId) {
  return supabase
    .from('business_machines')
    .select('*')
    .eq('business_id', businessId)
    .order('is_active', { ascending: false })
    .order('name')
}

export function createMachine(machine, businessId) {
  return supabase
    .from('business_machines')
    .insert([{ ...machine, business_id: businessId }])
    .select()
    .single()
}

export function updateMachine(id, machine, businessId) {
  return supabase
    .from('business_machines')
    .update(machine)
    .eq('id', id)
    .eq('business_id', businessId)
    .select()
    .single()
}

export function deleteMachine(id, businessId) {
  return supabase.from('business_machines').delete().eq('id', id).eq('business_id', businessId)
}
