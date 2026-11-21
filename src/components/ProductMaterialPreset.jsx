import { useState } from 'react'
import { PRODUCT_MATERIAL_PRESETS, applyMaterialPreset } from '../utils/productMaterialPresets.js'

export default function ProductMaterialPreset({ formData, onChange }) {
  const [selectedId, setSelectedId] = useState('')
  const [pendingId, setPendingId] = useState('')
  const pending = PRODUCT_MATERIAL_PRESETS.find(row => row.id === pendingId)
  const selectPreset = event => {
    const presetId = event.target.value
    const result = applyMaterialPreset(formData, presetId)
    if (result.requiresConfirmation) {
      setPendingId(presetId)
      return
    }
    setPendingId('')
    setSelectedId(presetId)
    // Recheck the current fields in the updater, not just the render snapshot.
    onChange(current => applyMaterialPreset(current, presetId).formData)
  }
  return (
    <div className='space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3'>
      <label htmlFor='product-material-preset' className='block text-sm font-medium text-gray-700'>Tipo de producto</label>
      <select id='product-material-preset' value={pendingId || selectedId} onChange={selectPreset} aria-describedby='product-material-preset-help' className='min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#237a42]'>
        <option value=''>Seleccione un tipo de producto</option>
        {PRODUCT_MATERIAL_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
      <p id='product-material-preset-help' className='text-xs text-gray-600'>Complete material y cuidados con una base. Puede editar ambos textos después.</p>
      {pending && (
        <div role='alert' className='space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-gray-800'>
          <p>Ya hay texto en material o cuidados. ¿Desea reemplazar ambos campos con «{pending.label}»?</p>
          <div className='flex flex-wrap gap-2'>
            <button type='button' onClick={() => {
              onChange(current => applyMaterialPreset(current, pendingId, true).formData)
              setSelectedId(pendingId)
              setPendingId('')
            }} className='min-h-11 rounded-lg bg-[#237a42] px-3 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2'>Reemplazar ambos campos</button>
            <button type='button' onClick={() => setPendingId('')} className='min-h-11 rounded-lg border border-gray-400 px-3 focus-visible:outline-2 focus-visible:outline-offset-2'>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
