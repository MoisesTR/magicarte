/** Normalize free-text phones, using local digits only for Nicaragua's +505. */
export function normalizeClientPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('505') ? digits.slice(3) : digits
}

/** Resolve a client id without mutating customer data or blocking an order save. */
export async function resolveOrderClient({ formData, findClientByPhone, findClientByName, createClientReturning, businessId, onError }) {
  if (formData.client_id) return formData.client_id
  const name = formData.customer_name?.trim()
  if (!name) return null

  try {
    const phone = normalizeClientPhone(formData.customer_phone)
    if (phone) {
      const { data, error } = await findClientByPhone(phone, businessId)
      if (error) throw error
      if (data) {
        if (!data.id) throw new Error('Matched client has no id')
        return data.id
      }
    } else if (findClientByName) {
      // Without a phone, reuse an exact same-name client instead of duplicating it.
      const { data, error } = await findClientByName(name, businessId)
      if (error) throw error
      if (data?.id) return data.id
    }

    const { data, error } = await createClientReturning({
      name,
      phone: phone || null,
      social_media: formData.customer_social_media || null,
      delivery_address: formData.delivery_address || null,
      notes: 'Creado desde un pedido',
    }, businessId)
    if (error) throw error
    if (!data?.id) throw new Error('Created client has no id')
    return data.id
  } catch (error) {
    // Error reporting must not turn an optional link into an order-save failure.
    try { onError?.(error) } catch { /* Keep the order save available. */ }
    return null
  }
}
