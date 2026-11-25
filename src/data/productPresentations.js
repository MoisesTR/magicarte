import { supabase } from '../config/supabaseClient'
import {
  validateProductOptions,
  identifyOptions,
} from '../utils/productPresentations'

const optionTables = [
  'product_presentations',
  'product_designs',
  'order_item_designs',
]
export function isMissingPresentationSchema(error, columns = false) {
  if (!error) return false
  const text = `${error.message || ''} ${error.details || ''}`
  if (['42P01', 'PGRST205'].includes(error.code))
    return optionTables.some((table) => text.includes(table))
  return (
    columns &&
    ['42703', 'PGRST204'].includes(error.code) &&
    /presentation_id|presentation_label|units_per_presentation/.test(text)
  )
}
async function readOptions(table, productId, businessId, publicOnly) {
  let query = supabase
    .from(table)
    .select('*')
    .order('sort_order')
    .order('created_at')
  if (productId) query = query.eq('product_id', productId)
  if (businessId != null) query = query.eq('business_id', businessId)
  if (publicOnly) query = query.eq('is_active', true)
  return query
}
export async function fetchProductOptions(
  productId,
  businessId,
  publicOnly = false
) {
  const [presentations, designs] = await Promise.all([
    readOptions('product_presentations', productId, businessId, publicOnly),
    readOptions('product_designs', productId, businessId, publicOnly),
  ])
  const errors = [presentations.error, designs.error].filter(Boolean)
  const error =
    errors.find((value) => !isMissingPresentationSchema(value)) || null
  if (errors.length)
    return { presentations: [], designs: [], available: false, error }
  return {
    presentations: presentations.data || [],
    designs: designs.data || [],
    available: true,
    error: null,
  }
}
export function fetchPublicProductOptions(productId) {
  return fetchProductOptions(productId, null, true)
}
// Shared React Query consumers use this batch rather than issuing a request per card.
export async function fetchPublicPresentations(businessId, productIds) {
  if (productIds && !productIds.length) return { data: [], error: null }
  let query = supabase
    .from('product_presentations')
    .select('*')
    .eq('is_active', true)
  if (businessId != null) query = query.eq('business_id', businessId)
  if (productIds) query = query.in('product_id', productIds)
  const result = await query
  if (isMissingPresentationSchema(result.error))
    return { data: [], error: null, available: false }
  return result
}
export async function saveProductOptions(
  productId,
  businessId,
  current,
  previous = { presentations: [], designs: [] }
) {
  const validation = validateProductOptions(
    current.presentations,
    current.designs
  )
  if (validation) return { error: new Error(validation) }
  for (const [key, table] of [
    ['presentations', 'product_presentations'],
    ['designs', 'product_designs'],
  ]) {
    const rows = identifyOptions(current[key]).map((row, sort_order) => ({
      ...(row.id ? { id: row.id } : {}),
      business_id: businessId,
      product_id: productId,
      ...(key === 'presentations'
        ? {
            label: row.label.trim(),
            units: Number(row.units),
            price: Number(row.price),
          }
        : { name: row.name.trim(), image_url: row.image_url || null }),
      sort_order,
      is_active: row.is_active !== false,
    }))
    const removed = previous[key]
      .filter((row) => !rows.some((next) => next.id === row.id))
      .map((row) => row.id)
    // Delete first so a renamed row can reuse a removed design's unique name.
    if (removed.length) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('product_id', productId)
        .eq('business_id', businessId)
        .in('id', removed)
      if (error) return { error }
    }
    if (rows.length) {
      const { error } = await supabase
        .from(table)
        .upsert(rows)
        .eq('business_id', businessId)
      if (error) return { error }
    }
  }
  return { error: null }
}
export async function fetchOrderItemDesigns(itemIds, businessId) {
  if (!itemIds.length) return { data: [], error: null, available: true }
  const result = await supabase
    .from('order_item_designs')
    .select('*')
    .eq('business_id', businessId)
    .in('order_item_id', itemIds)
    .order('created_at')
    .order('id')
  if (isMissingPresentationSchema(result.error))
    return { data: [], error: null, available: false }
  return result
}
export async function insertOrderItemsWithDesigns(items, businessId) {
  if (!items.length) return { error: null }
  const configured = items.some(
    (row) =>
      row.presentation_label ||
      row.presentation_id ||
      row.designs?.length ||
      row.units_per_presentation
  )
  if (!configured) return supabase.from('order_items').insert(items)
  const rows = items.map((item) =>
    Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== 'designs')
    )
  )
  const result = await supabase.from('order_items').insert(rows).select('id')
  if (isMissingPresentationSchema(result.error, true)) {
    const legacy = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([key]) =>
            ![
              'presentation_id',
              'presentation_label',
              'units_per_presentation',
            ].includes(key)
        )
      )
    )
    return supabase.from('order_items').insert(legacy)
  }
  if (result.error) return result
  const designs = items.flatMap((item, index) =>
    (item.designs || [])
      .filter((row) => row.quantity > 0 && row.design_name?.trim())
      .map((row) => ({
        business_id: businessId,
        order_item_id: result.data[index].id,
        design_id: row.design_id || null,
        design_name: row.design_name.trim(),
        quantity: Number(row.quantity),
        note: row.note?.trim() || null,
      }))
  )
  if (!designs.length) return result
  const saved = await supabase.from('order_item_designs').insert(designs)
  return saved.error ? saved : result
}
