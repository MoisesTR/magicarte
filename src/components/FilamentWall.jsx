import { useMemo, useState } from 'react'
import SpoolCard from './SpoolCard'
import FilamentDetail from './FilamentDetail'
import { filterFilaments, groupFilaments, materialCounts, materialLabel, orderFilaments } from '../utils/filamentWall'

export default function FilamentWall({ items, businessId, preferences, onPreferences, onEdit, onRefresh, primaryColor }) {
  const [selectedId, setSelectedId] = useState(null)
  const filtered = useMemo(() => filterFilaments(items, preferences), [items, preferences])
  const counts = useMemo(() => materialCounts(items), [items])
  const groups = useMemo(() => preferences.sort === 'material' ? groupFilaments(filtered) : [{ material: 'rainbow', items: orderFilaments(filtered) }], [filtered, preferences.sort])
  const selected = items.find(item => item.id === selectedId)
  const update = patch => onPreferences({ ...preferences, ...patch })
  const toggleMaterial = material => update({ materials: preferences.materials.includes(material) ? preferences.materials.filter(value => value !== material) : [...preferences.materials, material] })

  return (
    <section className='filament-wall' style={{ '--filament-accent': primaryColor || '#8973be' }} aria-labelledby='filament-wall-title'>
      <div className='filament-wall-header'>
        <p className='mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500'>Cada idea tiene su color</p>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div><h2 id='filament-wall-title' className='filament-wall-title'>Muro de filamentos</h2><p className='mt-2 text-sm text-gray-500'>Elija un rollo. Mire lo que queda. Cree algo increíble.</p></div>
          <span className='filament-wall-count rounded-full border border-white bg-white/70 px-3 py-2 text-xs font-semibold text-gray-600'>{filtered.length} {filtered.length === 1 ? 'color' : 'colores'}</span>
        </div>
      </div>
      <div className='my-5 space-y-3'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
          <label className='block min-w-0 flex-1 text-xs font-semibold text-gray-600'>Busque su color
            <input type='search' value={preferences.query} onChange={event => update({ query: event.target.value })} placeholder='Nombre o código Bambu…' className='field mt-1 min-h-11 w-full min-w-0 bg-white' />
          </label>
          <label className='block text-xs font-semibold text-gray-600'>Ordenar
            <select value={preferences.sort} onChange={event => update({ sort: event.target.value })} className='field mt-1 min-h-11 w-full bg-white sm:w-40'><option value='rainbow'>Arcoíris</option><option value='material'>Por tipo</option></select>
          </label>
          <label className='flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-600'><input type='checkbox' role='switch' checked={preferences.onlyAvailable} onChange={event => update({ onlyAvailable: event.target.checked })} className='h-5 w-5 accent-violet-600' />Solo disponibles</label>
        </div>
        <div className='flex flex-wrap gap-2' role='group' aria-label='Filtrar por material'>
          <button type='button' aria-pressed={!preferences.materials.length} onClick={() => update({ materials: [] })} className='filament-pill'>Todos · {counts.reduce((total, entry) => total + entry.count, 0)}</button>
          {counts.map(({ material, count }) => <button key={material} type='button' aria-pressed={preferences.materials.includes(material)} onClick={() => toggleMaterial(material)} className='filament-pill'>{materialLabel(material)} · {count}</button>)}
        </div>
      </div>
      {filtered.length === 0 ? <div className='rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center'><p className='font-semibold text-gray-700'>No encontramos ese color.</p><p className='mt-1 text-sm text-gray-500'>Prueba otro nombre o cambia los filtros.</p><button type='button' onClick={() => update({ materials: [], query: '', onlyAvailable: false })} className='filament-action mt-4'>Ver todos</button></div> : groups.map(group => <div key={group.material}>
        {group.label && <h3 className='filament-group-heading'>{group.label}<span>{group.items.length} colores</span></h3>}
        <div className='filament-grid'>{group.items.map(item => <SpoolCard key={item.id} item={item} onClick={() => setSelectedId(item.id)} />)}</div>
      </div>)}
      {selected && <FilamentDetail key={selected.id} item={selected} businessId={businessId} onClose={() => setSelectedId(null)} onEdit={item => { setSelectedId(null); onEdit(item) }} onRefresh={onRefresh} />}
    </section>
  )
}
