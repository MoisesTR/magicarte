begin;

alter table public.whatsapp_threads
  add column delivery_date date null,
  add column delivery_method text null,
  add column paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0);

commit;

/* Assistant upsert contract extension (SQL parameters, never interpolate chat text):
   The existing conversation/review contract still applies. The assistant may set
   the agreed delivery_date and free-text delivery_method. paid_amount is the
   cumulative amount paid, NOT an increment. Include all three fields in INSERT;
   append these assignments to its existing ON CONFLICT DO UPDATE clause:

   delivery_date = excluded.delivery_date,
   delivery_method = excluded.delivery_method,
   paid_amount = greatest(whatsapp_threads.paid_amount, excluded.paid_amount)

   Never replace paid_amount with excluded.paid_amount directly: an assistant
   review must never lower an owner-entered payment. Missing payment evidence
   uses 0 for INSERT and therefore preserves any existing amount on UPDATE.
   Keep the existing open-status conflict predicate and owner-field protections;
   never reopen won/lost/done conversations or change quoted_amount/notes/links.
*/
