export const clampScale = scale => Math.min(4, Math.max(1, scale))

export const resetZoom = () => ({ scale: 1, x: 0, y: 0 })

// Points and translation are relative to the viewport/image center.
export function zoomAround(point, state, nextScale) {
  const scale = clampScale(nextScale)
  const ratio = scale / state.scale
  return { scale, x: point.x - (point.x - state.x) * ratio, y: point.y - (point.y - state.y) * ratio }
}

export function clampPan(state, imageSize, viewportSize) {
  const scale = clampScale(state.scale)
  if (scale === 1) return resetZoom()
  const limitX = Math.max(0, (imageSize.width * scale - viewportSize.width) / 2)
  const limitY = Math.max(0, (imageSize.height * scale - viewportSize.height) / 2)
  return { scale, x: Math.max(-limitX, Math.min(limitX, state.x)) || 0, y: Math.max(-limitY, Math.min(limitY, state.y)) || 0 }
}

export const doubleTapTarget = scale => scale > 1 ? 1 : 2.5

export function isDoubleTap(previous, tap) {
  return Boolean(previous && tap.time >= previous.time && tap.time - previous.time <= 300 && Math.hypot(tap.x - previous.x, tap.y - previous.y) <= 30)
}
