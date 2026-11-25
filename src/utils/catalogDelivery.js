const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function shareCatalogFiles(files, navigatorObject = navigator) {
  try {
    await navigatorObject.share({ files, title: 'Catálogo de Magic Arte' })
  } catch (error) {
    if (error.name !== 'AbortError') throw error
  }
}

export async function saveCatalogToFolder(files, windowObject = window) {
  try {
    // Keep the picker call before the first await to preserve user activation.
    const directory = await windowObject.showDirectoryPicker({
      mode: 'readwrite',
    })
    for (const file of files) {
      const handle = await directory.getFileHandle(file.name, { create: true })
      const writable = await handle.createWritable()
      try {
        await writable.write(file)
      } catch (error) {
        await writable.abort?.().catch(() => {})
        throw error
      }
      await writable.close()
    }
  } catch (error) {
    if (error.name !== 'AbortError') throw error
  }
}

export async function downloadCatalogFiles(
  files,
  { documentObject = document, urlApi = URL, delay: wait = delay } = {}
) {
  for (let index = 0; index < files.length; index += 1) {
    const url = urlApi.createObjectURL(files[index])
    const anchor = documentObject.createElement('a')
    try {
      anchor.href = url
      anchor.download = files[index].name
      documentObject.body.appendChild(anchor)
      anchor.click()
      // Delay revocation so the browser can consume the download URL.
      await wait(250)
    } finally {
      anchor.remove()
      urlApi.revokeObjectURL(url)
    }
  }
}
