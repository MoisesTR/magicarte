import { supabase } from '../config/supabaseClient'

// A machine can be linked to more than one business (e.g. a laser engraver
// shared by Joyería Trigueros and Ema Accesorios) so its monthly goal is one
// combined target across every linked business.
const MACHINE_SELECT = '*, business_machine_links(business_id, businesses(id, name, slug))'

/** Machines visible to a business — its own, plus any shared with it. */
export async function fetchBusinessMachines(businessId) {
  const { data: links, error: linksError } = await supabase
    .from('business_machine_links')
    .select('machine_id')
    .eq('business_id', businessId)
  if (linksError) return { data: null, error: linksError }

  const machineIds = links.map((link) => link.machine_id)
  if (machineIds.length === 0) return { data: [], error: null }

  return supabase
    .from('business_machines')
    .select(MACHINE_SELECT)
    .in('id', machineIds)
    .order('is_active', { ascending: false })
    .order('name')
}

/** Create a machine linked to every business id in `linkedBusinessIds` (first one becomes its primary business). */
export async function createMachine(machine, linkedBusinessIds) {
  const { data, error } = await supabase
    .from('business_machines')
    .insert([{ ...machine, business_id: linkedBusinessIds[0] }])
    .select('id')
    .single()
  if (error) return { data: null, error }

  const { error: linkError } = await supabase
    .from('business_machine_links')
    .insert(linkedBusinessIds.map((businessId) => ({ machine_id: data.id, business_id: businessId })))
  return { data, error: linkError || null }
}

/** Update a machine's fields and replace its full set of linked businesses. */
export async function updateMachine(id, machine, linkedBusinessIds) {
  const { error } = await supabase.from('business_machines').update(machine).eq('id', id)
  if (error) return { error }

  const { error: unlinkError } = await supabase.from('business_machine_links').delete().eq('machine_id', id)
  if (unlinkError) return { error: unlinkError }

  const { error: linkError } = await supabase
    .from('business_machine_links')
    .insert(linkedBusinessIds.map((businessId) => ({ machine_id: id, business_id: businessId })))
  return { error: linkError || null }
}

/**
 * Remove a machine from one business. If that was its last linked business
 * the machine record itself is deleted; otherwise it stays intact (with its
 * same monthly goal) for whichever businesses still share it.
 */
export async function deleteMachine(machineId, businessId) {
  const { error: unlinkError } = await supabase
    .from('business_machine_links')
    .delete()
    .eq('machine_id', machineId)
    .eq('business_id', businessId)
  if (unlinkError) return { error: unlinkError }

  const { count, error: countError } = await supabase
    .from('business_machine_links')
    .select('business_id', { count: 'exact', head: true })
    .eq('machine_id', machineId)
  if (countError) return { error: countError }

  if (count === 0) return supabase.from('business_machines').delete().eq('id', machineId)
  return { error: null }
}
