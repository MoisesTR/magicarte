import { supabase } from '../config/supabaseClient'
import heic2any from 'heic2any'

/**
 * Convert HEIC/HEIF to JPEG using heic2any (works on all browsers)
 */
async function convertHeicToJpeg(file) {
  const blob = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.95,
  })
  const resultBlob = Array.isArray(blob) ? blob[0] : blob
  return new File([resultBlob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
  })
}

/**
 * Prepare file — converts HEIC to JPEG so sharp can process it
 */
async function prepareFile(file) {
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)
  if (isHeic) {
    console.log('Converting HEIC to JPEG...')
    return convertHeicToJpeg(file)
  }
  return file
}

/**
 * Upload an image through the compression API.
 * Falls back to direct Supabase upload if the API is unavailable.
 */
export async function uploadCompressedImage(file, folder = 'products') {
  try {
    const prepared = await prepareFile(file)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('No authenticated session')
    }

    const response = await fetch('/api/compress-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': `Bearer ${session.access_token}`,
        'x-filename': prepared.name,
        'x-folder': folder,
      },
      body: prepared,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Compression API failed')
    }

    const result = await response.json()
    console.log(`Image compressed: ${result.originalSize} → ${result.compressedSize} (${result.reduction} reduction)`)
    return result.path
  } catch (error) {
    console.warn('Compression API unavailable, uploading directly:', error.message)
    return uploadDirect(file, folder)
  }
}

/** Direct upload fallback (no compression) */
async function uploadDirect(file, folder) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `${folder}/${fileName}`

  const { error } = await supabase.storage
    .from('images')
    .upload(filePath, file, { cacheControl: '3600', upsert: false })

  if (error) throw error
  return filePath
}
