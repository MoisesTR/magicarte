export function fromProduct(product) {
  return [product.image_url, ...(product.secondary_images || [])]
    .filter(Boolean)
    .map((url, index) => ({ id: `saved-${index}`, url }))
}

export function fromFiles(files, prefix) {
  return Array.from(files).map((file, index) => ({ id: `${prefix}-${index}`, file }))
}

export function move(gallery, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= gallery.length || to >= gallery.length || from === to) return gallery
  const result = [...gallery]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

export function makeMain(gallery, index) {
  return move(gallery, index, 0)
}

export function remove(gallery, index) {
  return gallery.filter((_, position) => position !== index)
}

export function toPayload(paths) {
  return { image_url: paths[0] || '', secondary_images: paths.slice(1) }
}

export async function uploadGallery(gallery, upload) {
  const paths = await Promise.all(gallery.map(item => item.file ? upload(item.file) : item.url))
  return toPayload(paths)
}

// Own each preview URL outside render; disposal is safe during HEIC conversion.
export function createGalleryPreview(file, {
  prepareFile,
  createObjectURL = value => URL.createObjectURL(value),
  revokeObjectURL = value => URL.revokeObjectURL(value),
}) {
  let disposed = false
  let url = null
  const ready = Promise.resolve().then(() => prepareFile(file)).then(prepared => {
    if (disposed) return null
    url = createObjectURL(prepared)
    return url
  })
  return {
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      if (url) revokeObjectURL(url)
    },
  }
}
