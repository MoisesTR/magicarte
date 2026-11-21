import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PRODUCT_MATERIAL_PRESETS, applyMaterialPreset } from '../src/utils/productMaterialPresets.js'

const woodCare = '• Para quitar el polvo, use una brocha seca (como las de maquillaje) o un plumero, también en los relieves.\n• No lo moje ni lo limpie con paños húmedos: el MDF se hincha con el agua.\n• Evite el sol directo y la humedad.\n• No use alcohol, cloro ni productos de limpieza.'
const acrylicCare = '• Limpie con un paño suave, seco o apenas húmedo.\n• No use alcohol, acetona, cloro ni limpiavidrios: opacan y rayan el acrílico y pueden dañar la impresión.\n• No use esponjas ni paños ásperos.\n• No lo deje mucho tiempo al sol directo, para que los colores no pierdan intensidad.'

test('four presets contain exact Spanish material and care copy', () => {
  assert.deepEqual(PRODUCT_MATERIAL_PRESETS.map(row => [row.label, row.material_technique, row.care_instructions]), [
    ['Madera MDF pintada a mano', 'Trabajo realizado en MDF (Fibrán) con corte láser. Cada pieza se lija, se pinta a mano y se protege con barniz.', woodCare],
    ['Madera MDF y plywood', 'Trabajo realizado en MDF (Fibrán) y plywood con corte láser. Cada pieza se lija, se pinta a mano y se protege con barniz.', woodCare],
    ['Acrílico con impresión UV', 'Acrílico de 3 mm con impresión UV.', acrylicCare],
    ['Acrílico grabado', 'Acrílico de 3 mm con grabado láser.', acrylicCare.replace(' y pueden dañar la impresión', '')],
  ])
})
test('choosing a preset fills both blank fields without modifying unrelated fields or input', () => {
  const form = { name: 'Regalo', material_technique: '', care_instructions: '  ' }
  const result = applyMaterialPreset(form, PRODUCT_MATERIAL_PRESETS[0].id)
  assert.equal(result.requiresConfirmation, false)
  assert.equal(result.formData.name, 'Regalo')
  assert.equal(result.formData.material_technique, PRODUCT_MATERIAL_PRESETS[0].material_technique)
  assert.equal(result.formData.care_instructions, woodCare)
  assert.equal(form.material_technique, '')
})
test('either existing field blocks both writes until explicitly confirmed', () => {
  for (const fields of [{ material_technique: 'Manual' }, { care_instructions: 'Manual' }, { material_technique: 'Manual', care_instructions: 'Cuidados' }]) {
    const form = { material_technique: '', care_instructions: '', ...fields }
    const pending = applyMaterialPreset(form, PRODUCT_MATERIAL_PRESETS[2].id)
    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.formData, form)
    const confirmed = applyMaterialPreset(form, PRODUCT_MATERIAL_PRESETS[2].id, true)
    assert.equal(confirmed.requiresConfirmation, false)
    assert.equal(confirmed.formData.material_technique, 'Acrílico de 3 mm con impresión UV.')
    assert.equal(confirmed.formData.care_instructions, acrylicCare)
  }
})
test('unknown/empty selection is a no-op, even when confirmed', () => {
  const form = { material_technique: 'Manual', care_instructions: 'Original' }
  for (const id of ['', 'missing']) assert.deepEqual(applyMaterialPreset(form, id, true), { formData: form, requiresConfirmation: false })
})
test('Admin uses inline preset confirmation and keeps both text fields editable', async () => {
  const admin = await readFile(new URL('../src/pages/Admin.jsx', import.meta.url), 'utf8')
  assert.match(admin, /<ProductMaterialPreset[\s\S]*?formData=\{formData\}[\s\S]*?onChange=\{setFormData\}/)
  for (const field of ['material_technique', 'care_instructions']) assert.match(admin, new RegExp(`onChange=\\{text => setFormData\\(current => \\(\\{ \\.\\.\\.current, ${field}: text \\}\\)\\)\\}`))
  const component = await readFile(new URL('../src/components/ProductMaterialPreset.jsx', import.meta.url), 'utf8')
  assert.match(component, /Tipo de producto/)
  assert.match(component, /requiresConfirmation/)
  assert.match(component, /applyMaterialPreset\(current, pendingId, true\)/)
  assert.match(component, /Reemplazar ambos campos/)
  assert.match(component, /Cancelar/)
  assert.doesNotMatch(component, /window.confirm/)
})
