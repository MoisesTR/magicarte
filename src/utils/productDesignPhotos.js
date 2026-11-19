import { activeOptions } from './productPresentations.js'

export function designPickerModel(designs = [], selections = []) {
  const active = activeOptions(designs)
  const tiles = active.map((row, index) => ({
    ...row,
    number: index + 1,
    showPhoto: !!row.image_url,
  }))
  for (const row of selections) {
    if (
      !tiles.some((tile) =>
        row.design_id
          ? tile.id === row.design_id
          : !tile.id && tile.name === row.design_name
      )
    ) {
      tiles.push({
        id: row.design_id,
        name: row.design_name,
        number: null,
        showPhoto: false,
      })
    }
  }
  return {
    tiles,
    showGroupHint: active.length > 0 && !active.some((row) => row.image_url),
  }
}

const stem = (name) => String(name || '').replace(/\.[^.]+$/, '')
const withoutNumber = (name) => name.replace(/^\s*\d+(?:[\s._-]+|$)/, '').trim()
const normalized = (name) =>
  withoutNumber(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
const title = (name) =>
  name
    .toLocaleLowerCase('es')
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase('es'))
export function designNameFromFilename(filename) {
  const base = stem(filename)
  return (
    title(
      withoutNumber(base).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    ) || `Diseño ${base.trim() || 'nuevo'}`
  )
    .slice(0, 60)
    .trim()
}

// A plan contains files, not uploads. Recompute against current rows when applying.
export function matchDesignPhotos(files, designs) {
  const items = []
  const known = new Map()
  designs.forEach((row, index) => {
    if (!known.has(normalized(row.name))) known.set(normalized(row.name), index)
  })
  let assigned = 0
  let created = 0
  for (const file of Array.from(files)) {
    if (
      !(
        file.type?.startsWith('image/') ||
        /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i.test(file.name)
      )
    ) {
      throw new Error('Selecciona solo fotos de los diseños.')
    }
    const name = designNameFromFilename(file.name)
    const key = normalized(stem(file.name)) || normalized(name)
    const shortKey = normalized(name)
    const designIndex = known.has(key)
      ? known.get(key)
      : known.has(shortKey)
        ? known.get(shortKey)
        : null
    if (designIndex === null) {
      known.set(key, designs.length + created)
      known.set(shortKey, designs.length + created)
      created += 1
    } else assigned += 1
    items.push({ file, name, designIndex })
  }
  return { items, assigned, created }
}

export function applyDesignPhotos(designs, plan) {
  const next = designs.map((row) => ({ ...row }))
  for (const { file, name, designIndex } of plan.items) {
    if (designIndex === null)
      next.push({ name, image_url: null, imageFile: file, is_active: true })
    else next[designIndex] = { ...next[designIndex], imageFile: file }
  }
  return next
}

export function appendDetectedDesigns(designs, suggestions) {
  const existing = new Set(
    designs.map((row) => row.name.trim().slice(0, 60).trim().toLowerCase())
  )
  const additions = []
  for (const row of suggestions) {
    const name = row.name.trim().slice(0, 60).trim()
    const key = name.toLowerCase()
    if (!row.checked || !name || existing.has(key)) continue
    existing.add(key)
    additions.push({ name, image_url: null, is_active: true })
  }
  return [...designs, ...additions]
}

export async function uploadDesignPhotos(designs, { upload, resolveUrl }) {
  const result = []
  for (const row of designs) {
    if (!row.imageFile) {
      result.push(row)
      continue
    }
    const path = await upload(row.imageFile, 'products/designs')
    const saved = { ...row }
    delete saved.imageFile
    result.push({ ...saved, image_url: resolveUrl(path) })
  }
  return result
}
