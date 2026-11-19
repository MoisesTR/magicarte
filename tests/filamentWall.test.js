import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hexToHsl, orderFilaments, groupFilaments, materialLabel, filamentDetails,
  stockSummary, openSpoolAdjustment, filterFilaments, materialCounts,
  readWallPreferences, saveWallPreferences, publicColorRows, availabilityLabel,
} from '../src/utils/filamentWall.js'

const item = (name, hex, extra = {}) => ({ inventory_kind: 'filament', filament_material: 'PLA Basic', filament_color: name, color_hex: hex, current_stock: 1000, grams_per_spool: 1000, ...extra })

test('HSL conversion is numeric, case insensitive and rejects malformed colors', () => {
  assert.deepEqual(hexToHsl('#ff0000'), { h: 0, s: 1, l: 0.5 })
  assert.deepEqual(hexToHsl('#FFFFFF'), { h: 0, s: 0, l: 1 })
  assert.equal(hexToHsl('bad'), null)
})

test('rainbow order puts transparent first, whites first, browns after greens, neutrals last', () => {
  const expected = [item('Clear', '#000000', { color_transparent: true }), item('White', '#FFFFFF'), item('Yellow', '#FFFF00'), item('Orange', '#FF8000'), item('Red', '#FF0000'), item('Pink', '#FF80BF'), item('Purple', '#8000FF'), item('Blue', '#0000FF'), item('Green', '#00AA00'), item('Brown', '#804020'), item('Gray', '#888888'), item('Charcoal', '#333333'), item('Black', '#000000'), item('Unknown', null)]
  const reversed = [...expected].reverse()
  assert.deepEqual(orderFilaments(reversed).map(x => x.filament_color), expected.map(x => x.filament_color))
  assert.equal(reversed[0].filament_color, 'Unknown', 'input is immutable')
})

test('legacy catalog colors participate in rainbow ordering without saved hex', () => {
  const input = [item('Jet Black', null, { filament_material: 'PLA Matte' }), item('Ivory White', null, { filament_material: 'PLA Matte' })]
  assert.equal(orderFilaments(input)[0].filament_color, 'Ivory White')
})

test('all requested material labels are Spanish and Pure stays Pure', () => {
  for (const [en, es] of [['PLA Matte', 'PLA Mate'], ['PLA Silk+', 'PLA Seda'], ['PLA Marble', 'PLA Mármol'], ['PLA Wood', 'PLA Madera'], ['PETG Translucent', 'PETG Translúcido'], ['PLA Basic', 'PLA Básico'], ['PLA Pure', 'PLA Pure']]) assert.equal(materialLabel(en), es)
  assert.equal(materialLabel('ABS'), 'ABS')
})

test('catalog details match material plus English name; notes code stays admin-only', () => {
  const details = filamentDetails(item('Ivory White', null, { filament_material: 'PLA Matte', notes: 'Compra. Código Bambu 11100' }))
  assert.equal(details.spanishName, 'Blanco marfil')
  assert.equal(details.englishName, 'Ivory White')
  assert.equal(details.bambuCode, '11100')
  assert.equal(filamentDetails(item('Custom mint', '#00FFAA')).spanishName, 'Custom mint')
})

test('stock summary uses ceil rolls, retained capacity, kg, low and exhausted states', () => {
  assert.deepEqual(stockSummary(item('Blue', '#0000FF', { current_stock: 3200, unit_cost: 0.5 })), { grams: 3200, kg: 3.2, rolls: 4, capacity: 4000, ratio: 0.8, gramsPerSpool: 1000, closedSpools: 3, openGrams: 200, costPerKg: 500, stockValue: 1600, low: false, exhausted: false })
  assert.equal(stockSummary(item('Blue', '#0000FF', { current_stock: 0 })).rolls, 0)
  assert.equal(stockSummary(item('Blue', '#0000FF', { current_stock: -20 })).exhausted, true)
  assert.equal(stockSummary(item('Blue', '#0000FF', { current_stock: 200, low_stock_threshold: 300 })).low, true)
  assert.equal(stockSummary(item('Blue', '#0000FF', { grams_per_spool: 750, current_stock: 1500 })).openGrams, 750)
})

test('open-spool adjustment preserves closed spools and computes signed gram deltas', () => {
  const input = item('Blue', '#0000FF', { id: 'blue', current_stock: 3200 })
  assert.deepEqual(openSpoolAdjustment(input, 50, 'percent'), { inventory_item_id: 'blue', movement_type: 'adjustment', quantity_delta: 300, note: 'Ajuste de existencia (muro)' })
  assert.equal(openSpoolAdjustment(input, 0, 'g').quantity_delta, -200)
  assert.equal(openSpoolAdjustment(input, 200, 'g').quantity_delta, 0)
  assert.equal(openSpoolAdjustment(item('Blue', null, { current_stock: 3000 }), 50, 'percent').quantity_delta, -500)
  assert.equal(openSpoolAdjustment(item('Blue', null, { current_stock: 0 }), 100, 'g').quantity_delta, 100)
  for (const value of [-1, 1001, '', 'bad', Infinity]) assert.throws(() => openSpoolAdjustment(input, value, 'g'))
  assert.throws(() => openSpoolAdjustment(input, 101, 'percent'))
  assert.throws(() => openSpoolAdjustment(input, 1, 'kg'))
})

test('filters search Spanish/English/catalog codes with case and accent folding and availability', () => {
  const input = [item('Ivory White', null, { filament_material: 'PLA Matte', notes: 'Código Bambu 11100' }), item('Red', '#FF0000', { current_stock: 0 }), { inventory_kind: 'general' }]
  for (const query of ['MARFIL', 'ivory', '11100']) assert.equal(filterFilaments(input, { query }).length, 1)
  assert.equal(filterFilaments(input, { materials: ['PLA Matte'], onlyAvailable: true }).length, 1)
  assert.equal(filterFilaments(input, { materials: ['PLA Wood'] }).length, 0)
  assert.deepEqual(materialCounts(input), [{ material: 'PLA Basic', count: 1 }, { material: 'PLA Matte', count: 1 }])
})

test('grouping uses original material keys, Spanish headers and rainbow within each group', () => {
  const groups = groupFilaments([item('Black', '#000000', { filament_material: 'PLA Matte' }), item('Blue', '#0000FF'), item('Ivory White', '#FFFFFF', { filament_material: 'PLA Matte' })])
  assert.deepEqual(groups.map(g => g.label), ['PLA Básico', 'PLA Mate'])
  assert.deepEqual(groups[1].items.map(x => x.filament_color), ['Ivory White', 'Black'])
})

test('wall preferences are business-scoped, validated and safe when storage fails', () => {
  const store = new Map()
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }
  assert.equal(readWallPreferences('hikari', storage).view, 'wall')
  assert.equal(readWallPreferences('other', storage).view, 'list')
  const preferences = { view: 'list', sort: 'material', materials: ['PLA Matte'], query: 'marfil', onlyAvailable: true }
  saveWallPreferences('hikari', preferences, storage)
  assert.deepEqual(readWallPreferences('hikari', storage), preferences)
  assert.equal(readWallPreferences('other', storage).query, '')
  const denied = { getItem() { throw Error('denied') }, setItem() { throw Error('quota') } }
  assert.doesNotThrow(() => saveWallPreferences('hikari', preferences, denied))
  assert.equal(readWallPreferences('hikari', denied).view, 'wall')
  storage.setItem('filament-wall:hikari', '{bad')
  assert.equal(readWallPreferences('hikari', storage).sort, 'rainbow')
  storage.setItem('filament-wall:hikari', JSON.stringify({ view: 'oops', sort: 'oops', materials: [2], query: {}, onlyAvailable: 'no' }))
  assert.deepEqual(readWallPreferences('hikari', storage), { view: 'wall', sort: 'rainbow', materials: [], query: '', onlyAvailable: false })
})

test('public mapping allowlists the seven fields and normalizes availability without leaking private fields', () => {
  const rows = publicColorRows([{ business_name: 'Hikari Studio 3D', primary_color: '#123456', filament_material: 'PLA Matte', filament_color: 'Ivory White', color_hex: '#ffffff', color_transparent: false, availability: 'poco', id: 3, unit_cost: 4, notes: 'private', current_stock: 200 }])
  assert.deepEqual(Object.keys(rows[0]).sort(), ['availability', 'business_name', 'color_hex', 'color_transparent', 'filament_color', 'filament_material', 'primary_color'])
  assert.equal(rows[0].availability, 'poco')
  assert.equal(availabilityLabel(rows[0]), 'Pocas unidades')
  assert.equal(availabilityLabel({ availability: 'disponible' }), '')
  assert.equal(publicColorRows([{ availability: 'unknown' }])[0].availability, 'disponible')
  assert.deepEqual(publicColorRows(null), [])
})
