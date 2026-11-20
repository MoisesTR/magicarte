/** Canonical digits, storing Nicaragua's exact +505 plus eight-digit form locally. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('505') ? digits.slice(3) : digits
}

/** WhatsApp requires Nicaragua's country code; foreign numbers keep their digits. */
export function toWhatsAppPhone(value) {
  const phone = normalizePhone(value)
  return phone.length === 8 ? `505${phone}` : phone
}
