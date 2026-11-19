import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

test('store migration appends only private product fields without changing the stock view or grants', async () => {
  const root = new URL('../supabase/migrations/', import.meta.url)
  const filename = (await readdir(root)).find(name => name.endsWith('_add_filament_store_links.sql'))
  assert.ok(filename, 'separate store-link migration exists')
  assert.ok(filename > '20261119062843_public_filament_colors.sql')
  const sql = await readFile(new URL(filename, root), 'utf8')
  const previous = await readFile(new URL('20261119061605_add_filament_color_swatches.sql', root), 'utf8')
  for (const column of ['product_url', 'product_image_url']) {
    assert.match(sql, new RegExp(`add column if not exists ${column} text(?:,|;)`))
    assert.match(sql, new RegExp(`check \\(${column} is null or ${column} like 'https://%'\\)`))
    assert.doesNotMatch(sql, new RegExp(`${column} text not null`))
  }
  const view = /create or replace view public.inventory_stock[\s\S]*?m on true;/
  assert.equal(sql.match(view)?.[0].replace('i.color_transparent,\n  i.product_url,\n  i.product_image_url', 'i.color_transparent'), previous.match(view)?.[0])
  const grants = /revoke all privileges on table public.inventory_stock[\s\S]*?grant select on table public.inventory_stock to authenticated;/
  assert.equal(sql.match(grants)?.[0], previous.match(grants)?.[0])
  assert.doesNotMatch(sql, /public_filament_colors/)
  assert.match(sql, /begin;/)
  assert.match(sql, /commit;/)
})
