import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { findByCode, suggest, isTransparent } from '../src/utils/bambuColors.js'
import { applyBambuCode, colorFields, filamentSwatch, normalizeColorHex } from '../src/utils/filamentColors.js'

test('finds exact five-digit Bambu codes and rejects unknown or incomplete codes', () => {
  assert.equal(findByCode('11100').en, 'Ivory White')
  assert.equal(findByCode(11100).material, 'PLA Matte')
  for (const code of ['', null, undefined, '1110', '111000', 'x11100', '99999']) assert.equal(findByCode(code), undefined)
})

test('suggests exact English names case-insensitively within one material, ignoring a leading Matte', () => {
  assert.equal(suggest('pla matte', 'iVoRy WhItE')?.code, '11100')
  assert.equal(suggest(' PLA Matte ', ' Matte Ivory White ')?.code, '11100')
  assert.equal(suggest('PLA Basic', 'Ivory White'), undefined)
  assert.equal(suggest('PLA Matte', 'Ivory'), undefined)
  assert.equal(suggest('', ''), undefined)
  assert.equal(suggest(null, null), undefined)
})

test('only alpha 00 represents a transparent catalog entry', () => {
  assert.equal(isTransparent(findByCode('60103')), true)
  for (const entry of [undefined, null, {}, { alpha: 'FF' }, { alpha: '80' }]) assert.equal(isTransparent(entry), false)
})

test('the prepared catalog is copied byte-for-byte and every code remains available', async () => {
  const json = await readFile(new URL('../src/data/bambuColors.json', import.meta.url), 'utf8')
  const catalog = JSON.parse(json)
  assert.equal(catalog.length, 322)
  for (const entry of catalog) assert.deepEqual(findByCode(entry.code), entry)
})

test('known codes fill the form without losing other fields; unknown codes only change the code', () => {
  const current = { material: 'PLA', color: 'Custom', color_hex: '#123456', color_transparent: false, notes: 'keep', quantity: '2' }
  assert.deepEqual(applyBambuCode(current, '60103'), { ...current, bambu_code: '60103', material: 'PC', color: 'Transparent', color_hex: '#000000', color_transparent: true })
  assert.deepEqual(applyBambuCode(current, '11100'), { ...current, bambu_code: '11100', material: 'PLA Matte', color: 'Ivory White', color_hex: '#FFFFFF', color_transparent: false })
  assert.deepEqual(applyBambuCode(current, '1110'), { ...current, bambu_code: '1110' })
})

test('color fields normalize uppercase and nullable hex, rejecting malformed values', () => {
  assert.equal(normalizeColorHex(' #aBc123 '), '#ABC123')
  assert.equal(normalizeColorHex(''), null)
  assert.equal(normalizeColorHex(null), null)
  assert.deepEqual(colorFields({ color_hex: '#abcdef', color_transparent: true }), { color_hex: '#ABCDEF', color_transparent: true })
  assert.deepEqual(colorFields({}), { color_hex: null, color_transparent: false })
  for (const hex of ['#ABC', '#12345678', 'abcdef', 'red', '#12GG34']) assert.throws(() => normalizeColorHex(hex), /hex/i)
})

test('saved overrides win, existing named Bambu stock gets a scoped suggestion, and unknown colors stay neutral', () => {
  assert.deepEqual(filamentSwatch({ filament_material: 'PLA Matte', filament_color: 'Ivory White' }), { hex: '#FFFFFF', transparent: false })
  assert.deepEqual(filamentSwatch({ filament_material: 'PLA Matte', filament_color: 'Ivory White', color_hex: '#ABCDEF', color_transparent: true }), { hex: '#ABCDEF', transparent: true })
  assert.deepEqual(filamentSwatch({ filament_material: 'PC', filament_color: 'Transparent' }), { hex: '#000000', transparent: true })
  assert.deepEqual(filamentSwatch({ filament_material: 'PC', filament_color: 'Transparent', color_hex: '#123456', color_transparent: false }), { hex: '#123456', transparent: false })
  assert.deepEqual(filamentSwatch({ filament_color: 'Unknown' }), { hex: null, transparent: false })
  assert.deepEqual(filamentSwatch(), { hex: null, transparent: false })
})
