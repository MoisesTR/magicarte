// Data-access layer for clients. Business scoping and stamping live here.

import { supabase } from '../config/supabaseClient'
import { TABLE } from '../utils/constants'

/** All clients for a business (most-recently-updated first). */
export function fetchClientsForBusiness(businessId) {
  let query = supabase.from(TABLE.CLIENTS).select('*').order('updated_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}

/** Type-ahead search by name within a business. */
export function searchClientsByName(query, businessId, limit = 6) {
  let q = supabase
    .from(TABLE.CLIENTS)
    .select('id, name, phone, social_media, delivery_address, notes')
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(limit)
  if (businessId != null) q = q.eq('business_id', businessId)
  return q
}

/** Fetch a single client by id. */
export function fetchClientById(id) {
  return supabase
    .from(TABLE.CLIENTS)
    .select('id, name, phone, social_media, delivery_address')
    .eq('id', id)
    .single()
}

/** Find a client by phone within a business (for dedup on create). */
export function findClientByPhone(phone, businessId) {
  let q = supabase
    .from(TABLE.CLIENTS)
    .select('id, name, phone, social_media, delivery_address')
    .eq('phone', phone)
  if (businessId != null) q = q.eq('business_id', businessId)
  return q.maybeSingle()
}

/** Create a client, stamping the owning business. */
export function createClient(clientData, businessId) {
  return supabase.from(TABLE.CLIENTS).insert([{ ...clientData, business_id: businessId }])
}

/** Create a client and return the inserted row (used from the order form). */
export function createClientReturning(clientData, businessId) {
  return supabase
    .from(TABLE.CLIENTS)
    .insert([{ ...clientData, business_id: businessId }])
    .select('id, name, phone, social_media, delivery_address')
    .single()
}

/** Update a client's fields. */
export function updateClient(id, fields) {
  return supabase.from(TABLE.CLIENTS).update(fields).eq('id', id)
}

/** Delete a client. */
export function deleteClient(id) {
  return supabase.from(TABLE.CLIENTS).delete().eq('id', id)
}

/** Orders linked to clients, for the clients ranking view. */
export function fetchLinkedOrdersForBusiness(businessId) {
  let query = supabase
    .from(TABLE.ORDERS)
    .select('id, client_id, order_number, status, total_amount, delivery_fee, order_date, created_at, is_gift')
    .not('client_id', 'is', null)
    .order('created_at', { ascending: false })
  if (businessId != null) query = query.eq('business_id', businessId)
  return query
}
