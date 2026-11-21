export function galleryIndex(index, step, count) {
  if (count < 2) return 0
  return ((index + step) % count + count) % count
}

// A vertical/diagonal page scroll is not a photo-navigation gesture.
export function swipeDirection(deltaX, deltaY = 0, threshold = 40) {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return 0
  return deltaX < 0 ? 1 : -1
}

export function thumbnailOverflow(scrollLeft, clientWidth, scrollWidth) {
  return { left: scrollLeft > 1, right: scrollLeft + clientWidth < scrollWidth - 1 }
}
