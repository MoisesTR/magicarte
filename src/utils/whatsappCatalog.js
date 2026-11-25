import {
  activeOptions,
  formatPresentationMoney,
} from './productPresentations.js'
import { productPriceDisplay } from './productPriceDisplay.js'

export function catalogSlug(name) {
  return (
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120)
      .replace(/-$/, '') || 'producto'
  )
}

export function catalogFilenames(products) {
  const digits = Math.max(2, String(products.length).length)
  return products.map(
    (product, index) =>
      `${String(index + 1).padStart(digits, '0')}-${catalogSlug(product.name)}.jpg`
  )
}

export function catalogPriceLine(
  product,
  presentations = [],
  includePrice = true
) {
  if (!includePrice) return ''
  const active = activeOptions(presentations)
  const display = productPriceDisplay(product, active)
  if (display.mode !== 'fixed') return display.label
  return active.length
    ? active
        .map((row) => `${row.label}: ${formatPresentationMoney(row.price)}`)
        .join(' · ')
    : formatPresentationMoney(product.price)
}

export function catalogSizeLine(product) {
  const dimensions = [product.width, product.length]
  if (
    !dimensions.every(
      (value) =>
        value !== '' &&
        value != null &&
        Number.isFinite(Number(value)) &&
        Number(value) > 0
    )
  )
    return ''
  return `Medidas: ${dimensions.map(Number).join(' × ')} cm`
}

// Character-level splitting also bounds long names with no word separators.
export function wrapCatalogText(text, maxWidth, measureText, maxLines = 2) {
  const input = String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!input || maxWidth <= 0 || maxLines <= 0) return []
  const width = (value) => {
    const measured = measureText(value)
    return typeof measured === 'number' ? measured : measured.width
  }
  const lines = []
  let remaining = input
  while (remaining && lines.length < maxLines) {
    if (width(remaining) <= maxWidth) {
      lines.push(remaining)
      break
    }
    const last = lines.length === maxLines - 1
    const suffix = last ? '…' : ''
    let length = 0
    while (
      length < remaining.length &&
      width(remaining.slice(0, length + 1) + suffix) <= maxWidth
    )
      length += 1
    if (!length) {
      if (last && width('…') <= maxWidth) lines.push('…')
      break
    }
    const space = remaining.lastIndexOf(' ', length)
    const cut = space > 0 ? space : length
    lines.push(remaining.slice(0, cut).trimEnd() + suffix)
    remaining = remaining.slice(cut).trimStart()
  }
  return lines
}

export function chunkCatalogFiles(files, chunkSize = 10) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1)
    throw new Error('Invalid chunk size')
  const chunks = []
  for (let index = 0; index < files.length; index += chunkSize) {
    chunks.push({
      files: files.slice(index, index + chunkSize),
      label: `${index + 1}–${Math.min(index + chunkSize, files.length)}`,
    })
  }
  return chunks
}

// Capabilities are injected; no browser globals or user activation are consumed here.
export function chooseCatalogDelivery(
  files,
  { canShare, share, showDirectoryPicker } = {},
  maxShareFiles = Infinity
) {
  const supports = (batch) => {
    try {
      return (
        typeof share === 'function' &&
        typeof canShare === 'function' &&
        !!canShare({ files: batch })
      )
    } catch {
      return false
    }
  }
  if (files.length) {
    if (files.length <= maxShareFiles && supports(files))
      return { kind: 'share', chunks: [{ files, label: `1–${files.length}` }] }
    for (
      let size = Math.min(10, maxShareFiles);
      size >= 1;
      size = Math.floor(size / 2)
    ) {
      const chunks = chunkCatalogFiles(files, size)
      if (chunks.every((chunk) => supports(chunk.files)))
        return { kind: 'share', chunks }
    }
  }
  return {
    kind:
      files.length && typeof showDirectoryPicker === 'function'
        ? 'folder'
        : 'downloads',
    chunks: [],
  }
}

export function toggleCatalogSelection(selectedIds, id) {
  return selectedIds.includes(id)
    ? selectedIds.filter((value) => value !== id)
    : [...selectedIds, id]
}

export function selectVisibleProducts(selectedIds, products) {
  return [
    ...new Set([...selectedIds, ...products.map((product) => product.id)]),
  ]
}
