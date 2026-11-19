import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import SpoolCard from '../components/SpoolCard'
import { fetchPublicFilamentColors } from '../data/filamentColors'
import { groupFilaments } from '../utils/filamentWall'
import { shareColorLink } from '../utils/shareColors'

export default function PublicFilamentColors() {
  const { business } = useParams()
  const [result, setResult] = useState(() => ({ slug: business, rows: [], status: 'loading' }))
  const [retry, setRetry] = useState(0)
  const [shareStatus, setShareStatus] = useState('')
  const rows = useMemo(() => result.slug === business ? result.rows : [], [result, business])
  const status = result.slug === business ? result.status : 'loading'
  const brand = rows[0]?.business_name || (business === 'hikari' ? 'Hikari Studio 3D' : 'Estudio 3D')
  const primary = /^#[0-9a-f]{6}$/i.test(rows[0]?.primary_color || '') ? rows[0].primary_color : '#8973be'
  const groups = useMemo(() => groupFilaments(rows), [rows])

  useEffect(() => {
    let active = true
    setResult({ slug: business, rows: [], status: 'loading' })
    setShareStatus('')
    const load = async () => {
      const { data, error } = await fetchPublicFilamentColors(business)
      if (active) setResult({ slug: business, rows: data || [], status: error ? 'error' : 'ready' })
    }
    load()
    return () => { active = false }
  }, [business, retry])

  useEffect(() => {
    const previousTitle = document.title
    document.title = `Colores disponibles · ${brand}`
    return () => { document.title = previousTitle }
  }, [brand])

  const share = async () => {
    const outcome = await shareColorLink(window.location.href, `Colores disponibles · ${brand}`)
    if (outcome !== 'cancelled') setShareStatus(outcome)
  }

  return (
    <main className='public-colors' style={{ '--filament-accent': primary }}>
      <div className='public-colors-inner'>
        <header className='public-colors-header'>
          <div className='public-colors-brand'>
            <span className='public-colors-monogram' aria-hidden='true'>{brand.charAt(0)}</span>
            <div className='min-w-0'><p className='break-words text-sm font-bold'>{brand}</p><p className='mt-0.5 text-[10px] uppercase tracking-[0.15em] text-gray-500'>Impresión 3D · A su medida</p></div>
          </div>
          <button type='button' onClick={share} className='filament-action'>Compartir</button>
        </header>
        {shareStatus === 'copied' && <p role='status' className='mt-4 text-sm font-medium text-emerald-800'>Enlace copiado. ¡Compártalo!</p>}
        {shareStatus === 'shared' && <p role='status' className='mt-4 text-sm text-gray-600'>Listo para compartir.</p>}
        {shareStatus === 'manual' && <label className='mt-4 block text-sm text-gray-600'>Copie este enlace para compartir los colores<input readOnly aria-label='Enlace de colores' value={window.location.href} onFocus={event => event.target.select()} className='field mt-2 min-h-11 w-full min-w-0' /></label>}
        <section className='public-colors-hero' aria-labelledby='public-colors-title'>
          <p className='public-colors-eyebrow'>Pequeños detalles. Infinitas posibilidades.</p>
          <h1 id='public-colors-title' className='public-colors-title'>Elija el color para su pieza</h1>
          <p className='mt-5 max-w-md text-sm leading-relaxed text-gray-600'>De una idea a algo único. Explore los tonos y acabados disponibles, y cuéntenos cuál le encanta.</p>
          <div className='mt-5 flex items-center gap-1.5' aria-hidden='true'>{['#f1d08b', '#e8a285', '#cc8caa', '#aaa0cc', '#8faac9', '#a8bd9c'].map(color => <span key={color} className='h-2.5 w-7 rounded-full' style={{ backgroundColor: color }} />)}</div>
        </section>
        {status === 'loading' ? <div role='status' className='rounded-3xl border border-gray-200 bg-white/70 p-8 text-center text-sm text-gray-500'>Cargando colores…</div> : status === 'error' ? <div className='rounded-3xl border border-gray-200 bg-white p-8 text-center'>
          <p role='alert' className='font-semibold text-gray-700'>No pudimos cargar los colores.</p><p className='mt-2 text-sm text-gray-500'>Intente de nuevo en un momento.</p><button type='button' onClick={() => setRetry(value => value + 1)} className='filament-action mt-4'>Reintentar</button>
        </div> : rows.length === 0 ? <div className='rounded-3xl border border-dashed border-gray-300 bg-white/70 p-8 text-center'><h2 className='font-semibold text-gray-700'>Estamos preparando nuevos colores.</h2><p className='mt-2 text-sm text-gray-500'>Vuelva pronto para elegir su favorito.</p></div> : <>
          <div className='flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 text-xs text-gray-500'><p>{rows.length} {rows.length === 1 ? 'color para imaginar' : 'colores para imaginar'}</p><p>Ordenados como un arcoíris</p></div>
          {groups.map(group => <section key={group.material} aria-label={group.label} className='pb-2'>
            <h2 className='filament-group-heading'>{group.label}<span>{group.items.length} {group.items.length === 1 ? 'color' : 'colores'}</span></h2>
            <div className='filament-grid'>{group.items.map((item, index) => <SpoolCard key={`${item.filament_color}-${index}`} item={item} publicView />)}</div>
          </section>)}
        </>}
        <footer className='public-colors-footer'><p className='font-semibold'>{brand} · Hecho con imaginación</p><p className='mt-2 max-w-xl leading-relaxed'>Los tonos pueden variar según la pantalla y la luz. Los colores con pocas unidades están sujetos a disponibilidad para su pieza.</p></footer>
      </div>
    </main>
  )
}
