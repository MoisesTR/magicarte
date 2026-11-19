import { filamentSwatch } from '../utils/filamentColors'
import { availabilityLabel, filamentDetails, stockSummary } from '../utils/filamentWall'
import './filamentWall.css'

export function SpoolIllustration({ item, large = false }) {
  const { hex, transparent } = filamentSwatch(item)
  const material = item.filament_material || ''
  const finish = /silk/i.test(material) ? 'silk' : /marble/i.test(material) ? 'marble' : /wood/i.test(material) ? 'wood' : 'plain'
  return (
    <span aria-hidden='true' className={`filament-spool ${large ? 'filament-spool-large' : ''} ${transparent ? 'filament-spool-glass' : ''} filament-spool-${finish}`} style={{ '--spool-color': hex || '#d9dce0' }}>
      <span className='filament-spool-disc'><span className='filament-spool-finish' /><span className='filament-spool-hub'><span /></span></span>
    </span>
  )
}

export default function SpoolCard({ item, publicView = false, onClick }) {
  const details = filamentDetails(item)
  const stock = publicView ? null : stockSummary(item)
  const badge = publicView ? availabilityLabel(item) : stock.exhausted ? 'Agotado' : !item.is_active ? 'Inactivo' : stock.low ? 'Poco' : ''
  const Tag = publicView ? 'article' : 'button'
  const label = `${item.filament_material} ${details.englishName}, ${stock?.kg.toLocaleString('en', { maximumFractionDigits: 3 })} kg`
  return (
    <Tag {...(publicView ? {} : { type: 'button', onClick, 'aria-label': label })} className={`filament-card ${stock?.exhausted ? 'filament-card-empty' : ''}`}>
      <span className='filament-card-art'>
        <SpoolIllustration item={item} />
        {badge && <span className={`filament-badge ${stock?.exhausted || !publicView && !item.is_active ? 'filament-badge-muted' : ''}`}>{badge}</span>}
      </span>
      <span className='filament-card-caption'>
        <span className='filament-card-material'>{details.materialLabel}</span>
        <span className='filament-card-name'>{details.spanishName}</span>
        <span className='filament-card-english' lang='en'>{details.englishName}</span>
        {!publicView && <>
          <span className='filament-stock-text'>{stock.kg.toLocaleString('es-NI', { maximumFractionDigits: 3 })} kg · {stock.rolls} {stock.rolls === 1 ? 'rollo' : 'rollos'}</span>
          <span className='filament-stock-bar' role='meter' aria-label='Existencia de los rollos' aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stock.ratio * 100)} aria-valuetext={`${stock.grams} g de ${stock.capacity} g`}><span style={{ width: `${stock.ratio * 100}%` }} /></span>
        </>}
      </span>
    </Tag>
  )
}
