import { useEffect, useRef, useState } from 'react'
import { supabase } from '../config/supabaseClient'
import { getImageUrl } from '../utils/getImageUrl'
import { readVideoDuration, uploadProductVideo, validateProductVideo } from '../utils/productVideo.js'

export default function ProductVideoField({ value, onChange, onBusyChange, disabled }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  const busyCallback = useRef(onBusyChange)
  busyCallback.current = onBusyChange

  useEffect(() => () => {
    request.current?.abort()
    request.current = null
    busyCallback.current(false)
  }, [])

  const selectVideo = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || request.current || disabled) return
    const validation = validateProductVideo(file)
    setError(validation || '')
    if (validation) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    busyCallback.current(true)
    try {
      const duration = await readVideoDuration(file, { signal: controller.signal })
      if (controller.signal.aborted) return
      const path = await uploadProductVideo(file, { client: supabase, duration })
      if (request.current === controller) onChange(path)
    } catch (failure) {
      if (request.current === controller) setError(failure.message || 'No se pudo subir el video. Intente de nuevo.')
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(false)
        busyCallback.current(false)
      }
    }
  }

  return (
    <div className='space-y-2 rounded-xl border border-gray-200 p-3 sm:p-4' aria-busy={busy}>
      <label htmlFor='product-video' className='block text-sm font-medium text-gray-700'>Video (opcional)</label>
      <p id='product-video-help' className='text-sm text-gray-500'>Suba un MP4 H.264 ya convertido, de 540p–720p. Recomendado: 10–30 segundos y 5–12 MB. Máximo: 60 segundos y 25 MB.</p>
      <input id='product-video' type='file' accept='video/mp4,.mp4' onChange={selectVideo} disabled={disabled || busy}
        aria-describedby={`product-video-help${error ? ' product-video-error' : ''}`} aria-invalid={!!error}
        className='block w-full min-w-0 rounded-lg border border-gray-300 p-2 text-sm disabled:opacity-50' />
      {busy && <p role='status' className='text-sm text-gray-600'>Subiendo video y verificando su duración… Espere antes de guardar.</p>}
      {error && <p id='product-video-error' role='alert' className='text-sm text-red-600'>{error}</p>}
      {value && <>
        <video src={getImageUrl(value)} muted controls playsInline preload='metadata' aria-label='Video del producto' className='max-h-72 w-full rounded-lg bg-black' />
        <button type='button' disabled={disabled || busy} onClick={() => { onChange(null); setError('') }}
          className='min-h-11 rounded-lg border border-gray-300 px-4 text-sm disabled:opacity-50'>Quitar video</button>
      </>}
    </div>
  )
}
