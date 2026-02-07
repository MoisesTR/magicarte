import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const QUALITY = 85
const MAX_WIDTH = 1920

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log('ENV check - URL exists:', !!supabaseUrl, 'KEY exists:', !!supabaseKey)

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing environment variables' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify auth
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      console.log('Auth error:', authError?.message)
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Read body
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)
    console.log('Received image:', buffer.length, 'bytes')

    const originalFilename = req.headers['x-filename'] || 'image.jpg'
    const folder = req.headers['x-folder'] || 'products'

    // Compress
    const outputBuffer = await sharp(buffer)
      .resize(MAX_WIDTH, null, {
        withoutEnlargement: true,
        fit: 'inside',
      })
      .webp({ quality: QUALITY })
      .toBuffer()

    console.log('Compressed:', buffer.length, '->', outputBuffer.length)

    // Upload
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
      console.log('Upload error:', uploadError.message)
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    const originalSize = (buffer.length / 1024).toFixed(1)
    const compressedSize = (outputBuffer.length / 1024).toFixed(1)
    const reduction = ((1 - outputBuffer.length / buffer.length) * 100).toFixed(1)

    console.log('Success:', originalSize + 'KB ->', compressedSize + 'KB')

    return res.status(200).json({
      path: filePath,
      originalSize: `${originalSize}KB`,
      compressedSize: `${compressedSize}KB`,
      reduction: `${reduction}%`,
    })
  } catch (error) {
    console.error('Function error:', error.message, error.stack)
    return res.status(500).json({ error: 'Compression failed: ' + error.message })
  }
}
