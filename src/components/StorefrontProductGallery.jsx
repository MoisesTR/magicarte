import { useEffect, useRef, useState } from 'react'
import { galleryIndex, swipeDirection, thumbnailOverflow, storefrontGalleryItems, videoSwipeAllowed } from '../utils/storefrontGallery.js'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#237a42]'

function GalleryVideo({ src, poster, active, className }) {
  const player = useRef(null)
  useEffect(() => {
    const video = player.current
    if (active) {
      const playback = video.play()
      playback?.catch(() => {}) // Controls remain available if autoplay is blocked.
    } else video.pause()
    return () => video.pause()
  }, [src, active])
  return <video ref={player} src={src} aria-label='Video del producto' muted loop playsInline controls preload='none' poster={poster} className={className} />
}

export default function StorefrontProductGallery({ images = [], name, videoUrl = null }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const strip = useRef(null)
  const thumbnails = useRef([])
  const mainButton = useRef(null)
  const dialog = useRef(null)
  const closeButton = useRef(null)
  const touchStart = useRef(null)
  const suppressClick = useRef(false)
  const items = storefrontGalleryItems(images, videoUrl)
  const count = items.length
  const index = galleryIndex(selectedIndex, 0, count)
  const multiple = count > 1
  const item = items[index]
  const poster = images[0] || undefined
  const navigate = step => setSelectedIndex(current => galleryIndex(current, step, count))

  useEffect(() => {
    thumbnails.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [index])

  useEffect(() => {
    const element = strip.current
    if (!element) return
    const updateOverflow = () => setOverflow(thumbnailOverflow(element.scrollLeft, element.clientWidth, element.scrollWidth))
    updateOverflow()
    element.addEventListener('scroll', updateOverflow, { passive: true })
    window.addEventListener('resize', updateOverflow)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverflow)
    observer?.observe(element)
    return () => {
      element.removeEventListener('scroll', updateOverflow)
      window.removeEventListener('resize', updateOverflow)
      observer?.disconnect()
    }
  }, [count])

  useEffect(() => {
    if (!lightboxOpen) return
    const returnFocus = mainButton.current
    const restoreFocus = () => (mainButton.current || returnFocus)?.focus({ preventScroll: true })
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); setLightboxOpen(false) }
      if (event.target.closest('video') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      if (multiple && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        setSelectedIndex(current => galleryIndex(current, event.key === 'ArrowRight' ? 1 : -1, count))
      }
      if (event.key === 'Tab') {
        const buttons = [...dialog.current.querySelectorAll('button, video[controls]')]
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
      restoreFocus()
    }
  }, [lightboxOpen, count, multiple])

  const gestures = {
    onTouchStart: event => {
      suppressClick.current = false
      const touch = event.touches.length === 1 ? event.touches[0] : null
      const video = event.target.closest('video')
      if (video && touch && !videoSwipeAllowed(touch.clientY, video.getBoundingClientRect().bottom)) { touchStart.current = null; return }
      touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
    },
    onTouchEnd: event => {
      const start = touchStart.current
      touchStart.current = null
      if (!start) return
      const touch = event.changedTouches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      suppressClick.current = Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8
      const direction = swipeDirection(deltaX, deltaY)
      if (multiple && direction) navigate(direction)
    },
    onTouchCancel: () => { touchStart.current = null; suppressClick.current = true },
  }
  const arrows = lightbox => multiple && [-1, 1].map(step => (
    <button key={step} type='button' aria-label={step === -1 ? 'Foto anterior' : 'Foto siguiente'} onClick={() => navigate(step)}
      className={`absolute top-1/2 z-10 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full text-3xl shadow-sm transition-opacity ${focusRing} ${step === -1 ? 'left-2' : 'right-2'} ${lightbox ? 'bg-black/60 text-white focus-visible:outline-white' : 'bg-white/90 text-gray-800 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'}`}>
      <span aria-hidden='true'>{step === -1 ? '‹' : '›'}</span>
    </button>
  ))
  const counter = lightbox => multiple && (
    <span aria-live='polite' aria-atomic='true' className={`pointer-events-none absolute rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white ${lightbox ? 'bottom-5 left-1/2 -translate-x-1/2' : 'right-3 top-3'}`}>{index + 1} / {count}</span>
  )
  const scrollStrip = step => strip.current?.scrollBy({ left: step * strip.current.clientWidth * 0.75, behavior: 'smooth' })

  return (
    <div className='min-w-0 space-y-4'>
      <div className='group relative rounded-2xl bg-gray-50 p-3 shadow-sm sm:p-6'>
        {item?.type === 'video' ? (
          <div {...gestures} className='touch-pan-y'>
            <GalleryVideo src={item.src} poster={poster} active={!lightboxOpen} className='aspect-square w-full rounded-xl bg-black object-contain lg:aspect-[3/4]' />
            <button ref={mainButton} type='button' aria-label={`Ampliar video de ${name}`} onClick={() => setLightboxOpen(true)}
              className={`mt-2 min-h-11 w-full rounded-lg text-center text-xs text-gray-500 ${focusRing}`}>Ampliar video</button>
          </div>
        ) : (
          <button ref={mainButton} type='button' aria-label={`Ampliar foto ${index + 1} de ${name}`} {...gestures}
            onClick={event => {
              if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return }
              setLightboxOpen(true)
            }} className={`block w-full cursor-zoom-in rounded-xl touch-pan-y ${focusRing}`}>
            <img src={item?.src} alt={`${name}, foto ${index + 1}`} draggable='false' className='aspect-square w-full object-contain lg:aspect-[3/4]' />
            <span className='mt-2 block text-center text-xs text-gray-500'>Toca para ampliar</span>
          </button>
        )}
        {arrows(false)}
        {counter(false)}
      </div>
      {multiple && (
        <div className='relative'>
          <div ref={strip} className='flex gap-3 overflow-x-auto px-1 py-2' aria-label='Fotos y video del producto'>
            {items.map((entry, position) => (
              <button ref={element => { thumbnails.current[position] = element }} key={position} type='button'
                aria-label={entry.type === 'video' ? 'Video del producto' : `Ver foto ${position + 1}`} aria-current={index === position ? 'true' : undefined}
                onClick={() => setSelectedIndex(position)} className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${focusRing} ${index === position ? 'border-[#237a42]' : 'border-gray-200 hover:border-gray-400'}`}>
                {entry.type === 'video' ? <>
                  {poster ? <img src={poster} alt='' loading='lazy' className='h-full w-full object-cover' /> : <video src={`${entry.src}#t=0.1`} preload='metadata' muted playsInline aria-hidden='true' className='pointer-events-none h-full w-full object-cover' />}
                  <span aria-hidden='true' className='pointer-events-none absolute inset-0 grid place-items-center bg-black/25 text-2xl text-white'>▶</span>
                </> : <img src={entry.src} alt='' draggable='false' loading='lazy' className='h-full w-full object-cover' />}
              </button>
            ))}
          </div>
          {overflow.left && <div aria-hidden='true' className='pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent' />}
          {overflow.right && <div aria-hidden='true' className='pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent' />}
          {[-1, 1].map(step => (step === -1 ? overflow.left : overflow.right) && (
            <button key={step} type='button' aria-label={step === -1 ? 'Desplazar miniaturas a la izquierda' : 'Desplazar miniaturas a la derecha'} onClick={() => scrollStrip(step)}
              className={`absolute top-1/2 hidden min-h-9 min-w-9 -translate-y-1/2 rounded-full border border-gray-200 bg-white text-xl shadow-sm md:block ${focusRing} ${step === -1 ? 'left-0' : 'right-0'}`}><span aria-hidden='true'>{step === -1 ? '‹' : '›'}</span></button>
          ))}
        </div>
      )}
      {lightboxOpen && (
        <div ref={dialog} role='dialog' aria-modal='true' aria-label={`Fotos y video de ${name}`} className='fixed inset-0 z-50 flex items-center justify-center bg-black/95'
          onClick={event => { if (event.target === event.currentTarget) setLightboxOpen(false) }}>
          <button ref={closeButton} type='button' aria-label='Cerrar fotos' onClick={() => setLightboxOpen(false)} className={`absolute right-3 top-3 z-10 grid min-h-11 min-w-11 place-items-center rounded-full bg-black/60 text-3xl text-white ${focusRing} focus-visible:outline-white`}><span aria-hidden='true'>×</span></button>
          {item?.type === 'video' ? (
            <div {...gestures} className='w-full max-w-5xl touch-pan-y p-4'>
              <GalleryVideo src={item.src} poster={poster} active={lightboxOpen} className='max-h-[85dvh] w-full object-contain' />
            </div>
          ) : <img src={item?.src} alt={`${name}, foto ${index + 1}`} draggable='false' {...gestures} className='max-h-[90dvh] max-w-full touch-pan-y object-contain p-4' />}
          {arrows(true)}
          {counter(true)}
        </div>
      )}
    </div>
  )
}
