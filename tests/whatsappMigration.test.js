import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
async function sql() {
  const files = (
    await readdir(new URL('../supabase/migrations/', import.meta.url))
  ).filter((n) => n.endsWith('_add_whatsapp_threads.sql'))
  assert.equal(files.length, 1)
  assert.ok(files[0].slice(0, 14) > '20261119175537')
  return readFile(
    new URL(`../supabase/migrations/${files[0]}`, import.meta.url),
    'utf8'
  )
}
test('WhatsApp migration tenant RLS, ownership guards and constrained schema', async () => {
  const text = await sql()
  for (const table of ['whatsapp_threads', 'whatsapp_reviews']) {
    assert.match(text, new RegExp(`create table public.${table}`))
    assert.match(
      text,
      new RegExp(`alter table public.${table} enable row level security`)
    )
    assert.match(
      text,
      new RegExp(`on public.${table} for all to authenticated`)
    )
    assert.match(text, new RegExp(`ub.business_id = ${table}.business_id`))
  }
  assert.match(text, /where status in \('to_quote', 'sent', 'follow_up'\)/)
  assert.match(text, /format_type/)
  assert.match(text, /references public.clients\(id\) on delete set null/)
  assert.match(
    text,
    /order_id uuid references public.orders\(id\) on delete set null/
  )
  assert.match(text, /new.status is distinct from old.status/)
  assert.match(text, /new.business_id is distinct from old.business_id/)
  assert.match(text, /client_business_id is distinct from new.business_id/)
  assert.match(text, /order_business_id is distinct from new.business_id/)
  assert.match(text, /new.updated_at = now\(\)/)
  assert.match(
    text,
    /revoke all on public.whatsapp_threads, public.whatsapp_reviews from anon/
  )
  assert.match(text, /reference_images/)
  assert.match(text, /https:\/\//)
  assert.match(text, /revoke execute/)
  assert.match(text, /on conflict \(business_id, chat_key\)/)
})
