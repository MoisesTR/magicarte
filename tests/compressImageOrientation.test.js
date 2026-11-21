import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { compressImage } from '../api/compress-image.js'

test('compressImage applies EXIF orientation so portrait phone photos stay upright', async () => {
  // 40x20 landscape pixels tagged "rotate 90° clockwise" (EXIF 6) = a 20x40 portrait photo.
  const tagged = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#f00' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const out = await sharp(await compressImage(tagged)).metadata()
  assert.equal(out.format, 'webp')
  assert.equal(out.width, 20)
  assert.equal(out.height, 40)
})

test('compressImage keeps untagged images as they are', async () => {
  const plain = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#00f' } }).jpeg().toBuffer()
  const out = await sharp(await compressImage(plain)).metadata()
  assert.equal(out.width, 40)
  assert.equal(out.height, 20)
})
