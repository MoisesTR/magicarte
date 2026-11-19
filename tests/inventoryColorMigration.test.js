import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../supabase/migrations/20261119061605_add_filament_color_swatches.sql', import.meta.url)

test('color migration is additive, idempotent-safe and preserves the exact security-invoker stock view', async () => {
  const sql = await readFile(migration, 'utf8')
  const previous = await readFile(new URL('../supabase/migrations/20260728023759_add_inventory_item_colors.sql', import.meta.url), 'utf8')
  assert.match(sql, /add column if not exists color_hex text/)
  assert.match(sql, /add column if not exists color_transparent boolean not null default false/)
  assert.match(sql, /check \(color_hex is null or color_hex ~ '\^#\[0-9A-F\]\{6\}\$'\)/)
  assert.match(sql, /if not exists[\s\S]*pg_constraint/)
  const view = /create or replace view public.inventory_stock[\s\S]*?m on true;/
  assert.equal(sql.match(view)?.[0].replace('i.variant_color,\n  i.color_hex,\n  i.color_transparent', 'i.variant_color'), previous.match(view)?.[0])
  assert.match(sql, /begin;/)
  assert.match(sql, /commit;/)
})
