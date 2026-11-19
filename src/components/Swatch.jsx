/** A non-interactive color preview shared by stock, history and pickers. */
export default function Swatch({ hex, transparent = false, label, className = '' }) {
  const hasColor = /^#[0-9A-F]{6}$/i.test(hex || '')
  const title = transparent ? 'Transparente' : hasColor ? label || hex : 'Color sin definir'
  const style = transparent
    ? { backgroundImage: 'conic-gradient(#cbd5e1 25%, #fff 0 50%, #cbd5e1 0 75%, #fff 0)', backgroundSize: '12px 12px' }
    : { backgroundColor: hasColor ? hex : '#f3f4f6' }
  return <span role='img' aria-label={title} title={title} className={`inline-block h-6 w-6 shrink-0 rounded-full border ${hasColor || transparent ? 'border-black/20 shadow-inner' : 'border-dashed border-gray-400'} ${className}`} style={style} />
}
