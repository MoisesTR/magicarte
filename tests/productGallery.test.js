import test from 'node:test'
import assert from 'node:assert/strict'
import { fromProduct, fromFiles, move, makeMain, remove, toPayload, uploadGallery, createGalleryPreview } from '../src/utils/productGallery.js'

const saved = { image_url: 'main.jpg', secondary_images: ['second.jpg', 'third.jpg'] }

test('existing product photos form one stable ordered gallery including secondary-only products', () => {
  const gallery = fromProduct(saved)
  assert.deepEqual(gallery.map(item => item.url), ['main.jpg', 'second.jpg', 'third.jpg'])
  assert.equal(new Set(gallery.map(item => item.id)).size, 3)
  assert.deepEqual(fromProduct({ secondary_images: ['only.jpg'] }).map(item => item.url), ['only.jpg'])
  assert.deepEqual(fromProduct({}), [])
})

test('move and makeMain preserve every mixed photo and never mutate the input', () => {
  const files = [{ name: 'one.heic' }, { name: 'two.png' }]
  const gallery = [...fromProduct(saved), ...fromFiles(files, 'draft')]
  const original = [...gallery]
  assert.deepEqual(move(gallery, 0, 1), [gallery[1], gallery[0], ...gallery.slice(2)])
  assert.deepEqual(makeMain(gallery, 4), [gallery[4], ...gallery.slice(0, 4)])
  assert.deepEqual(gallery, original)
  assert.equal(gallery[3].file, files[0])
  assert.equal(gallery[4].file, files[1])
  for (const [from, to] of [[-1, 0], [0, 5], [2, 2], [NaN, 1], [0.5, 1]]) assert.deepEqual(move(gallery, from, to), gallery)
})

test('remove clears saved main, promotes next photo and supports empty galleries', () => {
  const gallery = fromProduct(saved)
  const remaining = remove(gallery, 0)
  assert.deepEqual(remaining.map(item => item.url), ['second.jpg', 'third.jpg'])
  assert.equal(gallery.length, 3)
  assert.deepEqual(remove(remove(remaining, 0), 0), [])
  assert.deepEqual(remove(gallery, -1), gallery)
  assert.deepEqual(toPayload(remaining.map(item => item.url)), { image_url: 'second.jpg', secondary_images: ['third.jpg'] })
  assert.deepEqual(toPayload([]), { image_url: '', secondary_images: [] })
})

test('save uploads only new files, preserving mixed order and all existing paths', async () => {
  const file = { name: 'new.heic' }
  const gallery = makeMain([...fromProduct(saved), ...fromFiles([file], 'added')], 3)
  const calls = []
  const payload = await uploadGallery(gallery, async value => { calls.push(value); return 'compressed.jpg' })
  assert.deepEqual(calls, [file])
  assert.deepEqual(payload, { image_url: 'compressed.jpg', secondary_images: ['main.jpg', 'second.jpg', 'third.jpg'] })
  assert.deepEqual(await uploadGallery(fromProduct(saved), () => assert.fail('saved URLs must not upload')), saved)
  await assert.rejects(uploadGallery(gallery, async () => { throw new Error('upload failed') }), /upload failed/)
})

test('draft files keep their original order and can be promoted or removed before upload', async () => {
  const files = [{ name: 'first.heic' }, { name: 'second.jpg' }, { name: 'third.png' }]
  const gallery = fromFiles(files, 'draft')
  assert.deepEqual(gallery.map(item => item.file), files)
  const edited = remove(makeMain(gallery, 2), 1)
  assert.deepEqual(await uploadGallery(edited, async file => file.name), { image_url: 'third.png', secondary_images: ['second.jpg'] })
})

test('preview prepares HEIC once, creates one URL and revokes exactly once on disposal', async () => {
  const calls = []
  const file = { name: 'photo.heic' }
  const prepared = { name: 'photo.jpg' }
  const preview = createGalleryPreview(file, {
    prepareFile: async value => { calls.push(['prepare', value]); return prepared },
    createObjectURL: value => { calls.push(['create', value]); return 'blob:photo' },
    revokeObjectURL: url => calls.push(['revoke', url]),
  })
  assert.equal(await preview.ready, 'blob:photo')
  preview.dispose()
  preview.dispose()
  assert.deepEqual(calls, [['prepare', file], ['create', prepared], ['revoke', 'blob:photo']])
})

test('removing or unmounting during async preparation creates no orphaned URL', async () => {
  let finish
  const calls = []
  const preview = createGalleryPreview({}, {
    prepareFile: () => new Promise(resolve => { finish = resolve }),
    createObjectURL: () => { calls.push('create'); return 'blob:late' },
    revokeObjectURL: () => calls.push('revoke'),
  })
  preview.dispose()
  await Promise.resolve()
  finish({})
  assert.equal(await preview.ready, null)
  assert.deepEqual(calls, [])
})

test('preview conversion errors do not create or leak object URLs', async () => {
  const preview = createGalleryPreview({}, {
    prepareFile: async () => { throw new Error('bad HEIC') },
    createObjectURL: () => assert.fail('no URL for failed conversion'),
    revokeObjectURL: () => assert.fail('nothing to revoke'),
  })
  await assert.rejects(preview.ready, /bad HEIC/)
  preview.dispose()
})
