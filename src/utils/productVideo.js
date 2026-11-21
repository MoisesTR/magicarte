export function validateProductVideo(file, duration = undefined) {
  if (!file || !/\.mp4$/i.test(file.name || '') || (file.type && file.type !== 'video/mp4')) {
    return 'Suba el video en formato MP4.'
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
    return 'El video debe pesar como máximo 25 MB.'
  }
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0 || duration > 60)) {
    return 'El video debe durar como máximo 60 segundos y poder reproducirse.'
  }
  return null
}

// Read only metadata locally; never transcode or send the file to the image API.
export function readVideoDuration(file, { signal, document: dom = document, url = URL } = {}) {
  return new Promise((resolve, reject) => {
    const video = dom.createElement('video')
    const objectUrl = url.createObjectURL(file)
    let timer
    const finish = (error, duration) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      url.revokeObjectURL(objectUrl)
      if (error) reject(error)
      else resolve(duration)
    }
    const abort = () => finish(new Error('Lectura de video cancelada.'))
    video.hidden = true
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => finish(null, video.duration)
    video.onerror = () => finish(new Error('No se pudo leer el video. Suba un MP4 con codificación H.264.'))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    timer = setTimeout(() => finish(new Error('No se pudo leer la duración del video. Intente con otro MP4.')), 15000)
    video.src = objectUrl
  })
}

export async function uploadProductVideo(file, { client, duration, now = Date.now, random = () => crypto.randomUUID() }) {
  const error = validateProductVideo(file, duration ?? null)
  if (error) throw new Error(error)
  const path = `products/videos/${now()}-${random()}.mp4`
  const result = await client.storage.from('images').upload(path, file, { contentType: 'video/mp4', upsert: false })
  if (result.error) throw result.error
  return path
}
