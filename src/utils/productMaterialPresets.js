const WOOD_CARE = '• Para quitar el polvo, use una brocha seca (como las de maquillaje) o un plumero, también en los relieves.\n• No lo moje ni lo limpie con paños húmedos: el MDF se hincha con el agua.\n• Evite el sol directo y la humedad.\n• No use alcohol, cloro ni productos de limpieza.'
const ACRYLIC_CARE = '• Limpie con un paño suave, seco o apenas húmedo.\n• No use alcohol, acetona, cloro ni limpiavidrios: opacan y rayan el acrílico y pueden dañar la impresión.\n• No use esponjas ni paños ásperos.\n• No lo deje mucho tiempo al sol directo, para que los colores no pierdan intensidad.'

export const PRODUCT_MATERIAL_PRESETS = Object.freeze([
  { id: 'painted-mdf', label: 'Madera MDF pintada a mano', material_technique: 'Trabajo realizado en MDF (Fibrán) con corte láser. Cada pieza se lija, se pinta a mano y se protege con barniz.', care_instructions: WOOD_CARE },
  { id: 'mdf-plywood', label: 'Madera MDF y plywood', material_technique: 'Trabajo realizado en MDF (Fibrán) y plywood con corte láser. Cada pieza se lija, se pinta a mano y se protege con barniz.', care_instructions: WOOD_CARE },
  { id: 'uv-acrylic', label: 'Acrílico con impresión UV', material_technique: 'Acrílico de 3 mm con impresión UV.', care_instructions: ACRYLIC_CARE },
  { id: 'engraved-acrylic', label: 'Acrílico grabado', material_technique: 'Acrílico de 3 mm con grabado láser.', care_instructions: ACRYLIC_CARE.replace(' y pueden dañar la impresión', '') },
].map(Object.freeze))

export function applyMaterialPreset(formData, presetId, confirmed = false) {
  const preset = PRODUCT_MATERIAL_PRESETS.find(row => row.id === presetId)
  if (!preset) return { formData, requiresConfirmation: false }
  if (!confirmed && (formData.material_technique?.trim() || formData.care_instructions?.trim())) {
    return { formData, requiresConfirmation: true }
  }
  return {
    formData: { ...formData, material_technique: preset.material_technique, care_instructions: preset.care_instructions },
    requiresConfirmation: false,
  }
}
