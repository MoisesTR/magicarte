alter table public.whatsapp_threads
  add column ai_tag text null check (ai_tag in (
    'promised', 'follow_up', 'customer_deciding', 'new_lead', 'needs_quote',
    'awaiting_payment', 'paid', 'customer_waiting', 'not_customer'
  )),
  add column ai_tag_reason text null,
  add column ai_tagged_at timestamptz null;

-- ai_tag_reason is one short Spanish sentence explaining the classification.
-- The review assistant sets all three fields on EVERY upsert:
-- ai_tag = excluded.ai_tag,
-- ai_tag_reason = excluded.ai_tag_reason,
-- ai_tagged_at = excluded.ai_tagged_at.
