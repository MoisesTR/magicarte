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

test('one additive delivery migration includes non-negative amount and monotone assistant contract', async () => {
  const files = (await readdir('supabase/migrations')).filter((name) =>
    name.endsWith('_add_whatsapp_deliveries.sql')
  )
  assert.equal(files.length, 1)
  assert.ok(files[0].slice(0, 14) > '20261120041204')
  const text = await readFile(`supabase/migrations/${files[0]}`, 'utf8')
  assert.match(text, /alter table public.whatsapp_threads/i)
  assert.match(text, /add column delivery_date date/i)
  assert.match(text, /add column delivery_method text/i)
  assert.match(
    text,
    /paid_amount numeric\(12,2\) not null default 0 check \(paid_amount >= 0\)/i
  )
  assert.match(
    text,
    /paid_amount = greatest\(whatsapp_threads.paid_amount, excluded.paid_amount\)/
  )
  assert.match(text, /delivery_date = excluded.delivery_date/)
  assert.match(text, /delivery_method = excluded.delivery_method/)
  assert.doesNotMatch(text, /create table|security definer/i)
})

test('one newer additive AI tag migration constrains nullable tags and documents every upsert field', async () => {
  const files = (await readdir('supabase/migrations')).filter((name) =>
    name.endsWith('_add_whatsapp_ai_tags.sql')
  )
  assert.equal(files.length, 1)
  assert.ok(files[0].slice(0, 14) > '20261120153722')
  const text = await readFile(`supabase/migrations/${files[0]}`, 'utf8')
  assert.match(text, /alter table public.whatsapp_threads/i)
  assert.match(text, /add column ai_tag text null check \(ai_tag in \(/i)
  for (const tag of [
    'promised',
    'follow_up',
    'customer_deciding',
    'new_lead',
    'needs_quote',
    'awaiting_payment',
    'paid',
    'customer_waiting',
    'not_customer',
  ])
    assert.ok(text.includes(`'${tag}'`))
  assert.match(text, /add column ai_tag_reason text null/i)
  assert.match(text, /add column ai_tagged_at timestamptz null/i)
  for (const field of ['ai_tag', 'ai_tag_reason', 'ai_tagged_at'])
    assert.match(text, new RegExp(`${field} = excluded\\.${field}`))
  assert.doesNotMatch(text, /create table|security definer|update public\./i)
})

test('one newer structured order migration adds four nullable fields, array check and non-erasing assistant contract', async () => {
  const files = (await readdir('supabase/migrations')).filter(name => name.endsWith('_add_whatsapp_order_details.sql'))
  assert.equal(files.length, 1)
  assert.ok(files[0].slice(0, 14) > '20261120174613')
  const text = await readFile(`supabase/migrations/${files[0]}`, 'utf8')
  for (const field of ['delivery_address', 'recipient_name', 'recipient_phone']) assert.match(text, new RegExp(`add column ${field} text null`, 'i'))
  assert.match(text, /add column order_lines jsonb null/i)
  assert.match(text, /check \(order_lines is null or jsonb_typeof\(order_lines\) = 'array'\)/i)
  for (const field of ['delivery_address', 'recipient_name', 'recipient_phone', 'order_lines']) assert.match(text, new RegExp(`${field} = coalesce\\(excluded\\.${field}, whatsapp_threads\\.${field}\\)`))
  assert.doesNotMatch(text, /create table|security definer|update public\./i)
})
