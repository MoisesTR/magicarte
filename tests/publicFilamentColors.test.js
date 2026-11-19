import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { publicColorRows } from '../src/utils/filamentWall.js'

async function wrapper(client) {
  const source = (await readFile(new URL('../src/data/filamentColors.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  return new Function('supabase', 'publicColorRows', `${source}; return fetchPublicFilamentColors`)(client, publicColorRows)
}

test('public RPC uses the requested business slug and returns only safe mapped fields', async () => {
  const calls = []
  const fetch = await wrapper({ rpc: async (...args) => { calls.push(args); return { data: [{ business_name: 'Hikari Studio 3D', filament_material: 'PLA Matte', filament_color: 'Ivory White', availability: 'poco', unit_cost: 9 }], error: null } } })
  const result = await fetch('hikari')
  assert.deepEqual(calls, [['public_filament_colors', { p_slug: 'hikari' }]])
  assert.equal(result.error, null)
  assert.equal(result.data[0].availability, 'poco')
  assert.equal('unit_cost' in result.data[0], false)
})

test('public RPC forwards errors and handles empty or thrown results for page error states', async () => {
  const error = { code: '42883', message: 'function missing' }
  const fetch = await wrapper({ rpc: async () => ({ data: null, error }) })
  assert.deepEqual(await fetch('hikari'), { data: [], error })
  const empty = await wrapper({ rpc: async () => ({ data: [], error: null }) })
  assert.deepEqual(await empty('unknown'), { data: [], error: null })
  const thrown = await wrapper({ rpc: async () => { throw new Error('Offline') } })
  assert.equal((await thrown('hikari')).error.message, 'Offline')
})

test('public migration is later, locked down, active-only and returns exactly the cost-free projection', async () => {
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  const filename = files.find(name => name.endsWith('_public_filament_colors.sql'))
  assert.ok(filename, 'separate public migration exists')
  assert.ok(filename > '20261119061605_add_filament_color_swatches.sql')
  const sql = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
  const signature = sql.match(/returns table\s*\(([\s\S]*?)\)/i)?.[1]
  assert.deepEqual(signature.split(',').map(column => column.trim().split(/\s+/)[0]), ['business_name', 'primary_color', 'filament_material', 'filament_color', 'color_hex', 'color_transparent', 'availability'])
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = public/i)
  assert.match(sql, /stable/i)
  assert.match(sql, /revoke all on function public\.public_filament_colors\(text\) from public/i)
  assert.match(sql, /grant execute on function public\.public_filament_colors\(text\) to anon, authenticated/i)
  assert.match(sql, /b\.slug = p_slug/i)
  assert.match(sql, /s\.is_active/i)
  assert.match(sql, /s\.inventory_kind = 'filament'/i)
  assert.match(sql, /s\.current_stock > 0/i)
  assert.match(sql, /s\.current_stock <= s\.low_stock_threshold or s\.current_stock < 250/i)
  assert.match(sql, /comment on function[\s\S]*public[\s\S]*cost-free/i)
})

test('public route is outside authentication and existing Vercel rewrite includes nested colors URLs', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /path='\/:business\/colores' element=\{<PublicFilamentColors \/>\}/)
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const rewrite = config.rewrites.find(rule => new RegExp(`^${rule.source}$`).test('/hikari/colores'))
  assert.equal(rewrite?.destination, '/index.html')
})
