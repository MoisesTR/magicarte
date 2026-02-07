import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const QUALITY = 85
const MAX_WIDTH = 1920

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    const originalFilename = req.headers['x-filename'] || 'image.jpg'
    const folder = req.headers['x-folder'] || 'products'

    // Sharp handles HEIC, HEIF, AVIF, TIFF, PNG, JPG, WebP, GIF, SVG
    // We convert everything to WebP for best compression + quality
    const outputBuffer = await sharp(buffer)
      .resize(MAX_WIDTH, null, {
        withoutEnlargement: true,
        fit: 'inside',
      })
      .webp({ quality: QUALITY })
      .toBuffer()

    // Always output as .webp regardless of input format
    const baseName = originalFilename.replace(/\.[^.]+$/, '')
    const filePath = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2)}-${baseName}.webp`

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, outputBuffer, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    const originalSize = (buffer.length / 1024).toFixed(1)
    const compressedSize = (outputBuffer.length / 1024).toFixed(1)
    const reduction = ((1 - outputBuffer.length / buffer.length) * 100).toFixed(1)

    return res.status(200).json({
      path: filePath,
      originalSize: `${originalSize}KB`,
      compressedSize: `${compressedSize}KB`,
      reduction: `${reduction}%`,
    })
  } catch (error) {
    return res.status(500).json({ error: 'Compression failed: ' + error.message })
  }
}
