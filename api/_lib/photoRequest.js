import { MAX_BODY_BYTES, draftError } from './productPhotoDraft.js'

export async function readPhotoBody(req) {
  const tooLarge = () =>
    draftError(
      'Las fotos superan el límite de 4 MB. Usa menos fotos o imágenes más pequeñas.',
      413
    )
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw tooLarge()
  const invalidJSON = () =>
    draftError('El cuerpo de la solicitud debe ser JSON válido.')
  let parsed
  // Vercel's Node helpers can expose a lazy body getter after consuming the stream.
  try {
    parsed = req.body
  } catch {
    throw invalidJSON()
  }
  if (parsed !== undefined) {
    let serialized
    try {
      serialized =
        typeof parsed === 'string' || Buffer.isBuffer(parsed)
          ? parsed
          : JSON.stringify(parsed)
    } catch {
      throw invalidJSON()
    }
    if (serialized === undefined) throw invalidJSON()
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) throw tooLarge()
    if (typeof parsed !== 'string' && !Buffer.isBuffer(parsed)) return parsed
    try {
      return JSON.parse(serialized.toString())
    } catch {
      throw invalidJSON()
    }
  }
  const chunks = []
  let size = 0
  // Early rejection must leave the socket alive long enough to send the 413 JSON.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw tooLarge()
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw invalidJSON()
  }
}
