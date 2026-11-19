/** Clipboard permissions vary on mobile; keep a legacy selection fallback. */
export async function copyColorLink(url, environment = globalThis) {
  try {
    if (environment.navigator?.clipboard?.writeText) {
      await environment.navigator.clipboard.writeText(url)
      return true
    }
  } catch { /* Try selection-based copying instead. */ }
  const document = environment.document
  if (!document?.body || !document.execCommand) return false
  const previousFocus = document.activeElement
  let field
  try {
    field = document.createElement('textarea')
    field.value = url
    field.setAttribute('readonly', '')
    field.setAttribute('aria-label', 'Enlace de colores')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    return Boolean(document.execCommand('copy'))
  } catch { return false }
  finally {
    field?.remove()
    previousFocus?.focus?.()
  }
}

export async function shareColorLink(url, title, environment = globalThis) {
  if (environment.navigator?.share) {
    try {
      await environment.navigator.share({ title, url })
      return 'shared'
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled'
    }
  }
  return await copyColorLink(url, environment) ? 'copied' : 'manual'
}
