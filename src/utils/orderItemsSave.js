/**
 * Insert replacements before removing only the editor's loaded item ids.
 * An insert error is blocking; cleanup errors leave recoverable duplicates.
 * Data functions are injected so orchestration has no database/UI dependency.
 */
export async function replaceOrderItems({
  orderId,
  previousIds = [],
  items,
  insertOrderItems,
  deleteOrderItemsByIds,
  businessId,
}) {
  const oldIds = [...new Set(previousIds.filter(id => id != null && id !== ''))]
  let inserted
  try {
    inserted = await insertOrderItems(items, businessId)
    if (inserted.error) return { error: inserted.error, cleanupError: null }
  } catch (error) {
    return { error, cleanupError: null }
  }

  const insertedIds = new Set((inserted.data || []).map(row => String(row.id)))
  const cleanupIds = oldIds.filter(id => !insertedIds.has(String(id)))
  if (cleanupIds.length) {
    try {
      const { error } = await deleteOrderItemsByIds(orderId, cleanupIds, businessId)
      if (error) return { error: null, cleanupError: error }
    } catch (error) {
      return { error: null, cleanupError: error }
    }
  }
  return { error: null, cleanupError: null }
}
