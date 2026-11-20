alter table public.whatsapp_threads
  add column delivery_address text null,
  add column recipient_name text null,
  add column recipient_phone text null,
  add column order_lines jsonb null
    check (order_lines is null or jsonb_typeof(order_lines) = 'array');

-- Review-assistant upsert contract: set all four fields on INSERT.
-- Each order_lines element is {"name": text, "quantity": integer >= 1,
-- "unit_price": number >= 0, "detail": text|null}; validate its shape in JS.
-- On conflict (business_id, chat_key), preserve owner-entered values when
-- the review has no replacement (NULL), using these assignments:
-- delivery_address = coalesce(excluded.delivery_address, whatsapp_threads.delivery_address),
-- recipient_name = coalesce(excluded.recipient_name, whatsapp_threads.recipient_name),
-- recipient_phone = coalesce(excluded.recipient_phone, whatsapp_threads.recipient_phone),
-- order_lines = coalesce(excluded.order_lines, whatsapp_threads.order_lines)
