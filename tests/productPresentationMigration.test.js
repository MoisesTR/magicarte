import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
const directory = new URL('../supabase/migrations/', import.meta.url)
async function migration() {
  const names = (await readdir(directory)).filter((name) =>
    name.endsWith('_add_product_presentations.sql')
  )
  assert.equal(names.length, 1)
  assert.ok(names[0].slice(0, 14) > '20261119065928')
  return readFile(new URL(names[0], directory), 'utf8')
}
test('presentation migration defines checked pack/design/snapshot tables and indexed parent keys', async () => {
  const sql = await migration()
  for (const table of [
    'product_presentations',
    'product_designs',
    'order_item_designs',
  ]) {
    assert.match(sql, new RegExp(`create table public.${table}`))
    assert.match(
      sql,
      new RegExp(`alter table public.${table} enable row level security`)
    )
    assert.match(
      sql,
      new RegExp(
        `grant select, insert, update, delete on public.${table} to authenticated`
      )
    )
  }
  assert.match(sql, /on public.product_designs \(product_id, lower\(name\)\)/)
  assert.match(
    sql,
    /units_per_presentation is null or units_per_presentation > 0/
  )
  assert.match(sql, /image_url ~\* '\^https:\/\//)
  assert.match(sql, /on public.order_item_designs \(order_item_id\)/)
})
test('membership and public policies are separate; design snapshots are private', async () => {
  const sql = await migration()
  for (const table of [
    'product_presentations',
    'product_designs',
    'order_item_designs',
  ]) {
    assert.match(sql, new RegExp(`ub.business_id = ${table}.business_id`))
  }
  assert.equal((sql.match(/to anon, authenticated/g) || []).length, 2)
  assert.equal((sql.match(/p.is_visible/g) || []).length, 2)
  assert.equal((sql.match(/and is_active/g) || []).length, 2)
  assert.match(sql, /with check/)
})
test('triggers pin search path, reject tenant changes and cross-product links and revoke RPC execution', async () => {
  const sql = await migration()
  assert.match(sql, /new.business_id is distinct from old.business_id/)
  assert.match(sql, /join public.orders o on o.id = oi.order_id/)
  assert.match(sql, /d.product_id is distinct from item_product_id/)
  assert.match(sql, /p.product_id is distinct from new.product_id/)
  assert.match(sql, /before update of business_id on public.products/)
  assert.match(sql, /before update of business_id on public.orders/)
  assert.match(sql, /set search_path = public/g)
  assert.match(
    sql,
    /revoke execute on function public.enforce_product_option_business\(\) from public, anon, authenticated/
  )
})

test('product deletion clears live presentation link before checking product while preserving snapshots', async () => {
  const sql = await migration()
  assert.match(
    sql,
    /not exists \(select 1 from public.products where id = old.product_id\)/
  )
  assert.match(sql, /new.presentation_id = null/)
  assert.ok(
    sql.indexOf('new.presentation_id = null') <
      sql.indexOf('if new.presentation_id is not null')
  )
})
