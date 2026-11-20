/** Shared, pure catalog used by the feed and the server's classification schema. */
export const AI_TAGS = Object.freeze(
  Object.fromEntries(
    [
      ['promised', 'Prometiste algo', 'neutral'],
      ['follow_up', 'Dar seguimiento', 'neutral'],
      ['customer_deciding', 'Cliente lo está pensando', 'neutral'],
      ['new_lead', 'Lead nuevo', 'neutral'],
      ['needs_quote', 'Por cotizar', 'warning'],
      ['awaiting_payment', 'Esperando pago', 'warning'],
      ['paid', 'Pagó', 'success'],
      ['customer_waiting', 'Cliente espera respuesta', 'danger'],
      ['not_customer', 'No es cliente', 'neutral'],
    ].map(([key, label, tone]) => [key, Object.freeze({ label, tone })])
  )
)

export const isAITag = (tag) =>
  typeof tag === 'string' && Object.hasOwn(AI_TAGS, tag)

export function aiTagChip(thread, now = new Date()) {
  if (!isAITag(thread.ai_tag)) return null
  const { label: text, tone } = AI_TAGS[thread.ai_tag]
  if (thread.ai_tag !== 'promised' || !thread.promised_date)
    return { text, tone }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
  return {
    text,
    tone:
      thread.promised_date < today
        ? 'danger'
        : thread.promised_date === today
          ? 'warning'
          : tone,
  }
}
