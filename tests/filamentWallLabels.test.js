import test from 'node:test'
import assert from 'node:assert/strict'
import { filamentDetails, groupFilaments, materialLabel, materialCounts } from '../src/utils/filamentWall.js'

const item = (material, color) => ({ inventory_kind: 'filament', filament_material: material, filament_color: color, color_hex: '#FFFFFF' })

test('colors without a Spanish catalog name borrow one from another material or a fallback', () => {
  assert.equal(filamentDetails(item('PETG Basic', 'White')).spanishName, 'Blanco')
  assert.equal(filamentDetails(item('PETG Basic', 'Black')).spanishName, 'Negro')
  assert.equal(filamentDetails(item('PETG Basic', 'Dark Beige')).spanishName, 'Beige oscuro')
  assert.equal(filamentDetails(item('PLA Pure', 'Milky Pink')).spanishName, 'Rosa lechoso')
  assert.equal(filamentDetails(item('PLA Matte', 'Ivory White')).spanishName, 'Blanco marfil')
  assert.equal(filamentDetails(item('PLA Basic', 'Unknown Shade')).spanishName, 'Unknown Shade')
})

test('TPU for AMS reads as flexible TPU in Spanish', () => {
  assert.equal(materialLabel('TPU for AMS'), 'TPU flexible')
})

test('groups and counts list PLA first, then PETG, then TPU, then anything else', () => {
  const items = ['TPU for AMS', 'PETG Translucent', 'PLA Wood', 'PETG Basic', 'PLA Silk+', 'PLA Basic', 'Nylon', 'PLA Matte', 'PLA Pure', 'PLA Marble'].map(m => item(m, 'White'))
  const order = ['PLA Basic', 'PLA Matte', 'PLA Silk+', 'PLA Marble', 'PLA Wood', 'PLA Pure', 'PETG Basic', 'PETG Translucent', 'TPU for AMS', 'Nylon']
  assert.deepEqual(groupFilaments(items).map(g => g.material), order)
  assert.deepEqual(materialCounts(items).map(g => g.material), order)
})
