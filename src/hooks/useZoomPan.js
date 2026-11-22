import { useCallback, useEffect, useRef, useState } from 'react'
import { clampPan, doubleTapTarget, isDoubleTap, resetZoom, zoomAround } from '../utils/zoomPan.js'
import { swipeDirection } from '../utils/storefrontGallery.js'

const position = event => ({ x: event.clientX, y: event.clientY })
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export default function useZoomPan({ enabled, resetKey, onSwipe }) {
  const viewportRef = useRef(null)
  const imageRef = useRef(null)
  const current = useRef(resetZoom())
  const options = useRef(null)
  options.current = { enabled, onSwipe }
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const previousTap = useRef(null)
  const suppressClick = useRef(false)
  const clickOnImage = useRef(false)
  const [state, setState] = useState(resetZoom)
  const [hasZoomed, setHasZoomed] = useState(false)
  const [touchDevice, setTouchDevice] = useState(() => typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches)

  const update = useCallback(next => {
    const image = imageRef.current
    const viewport = viewportRef.current
    const bounded = image && viewport ? clampPan(next, { width: image.offsetWidth, height: image.offsetHeight }, { width: viewport.clientWidth, height: viewport.clientHeight }) : resetZoom()
    current.current = bounded
    setState(bounded)
    if (bounded.scale > 1) setHasZoomed(true)
  }, [])
  const reset = useCallback(() => {
    pointers.current.clear()
    gesture.current = null
    previousTap.current = null
    suppressClick.current = true
    clickOnImage.current = false
    update(resetZoom())
  }, [update])
  const relative = useCallback(point => {
    const rect = viewportRef.current.getBoundingClientRect()
    return { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 }
  }, [])
  const zoomTo = useCallback((scale, point = { x: 0, y: 0 }) => {
    update(zoomAround(point, current.current, scale))
  }, [update])

  useEffect(() => {
    reset()
    setHasZoomed(false)
  }, [enabled, resetKey, reset])

  useEffect(() => {
    if (!enabled) return
    const viewport = viewportRef.current
    const remeasure = () => update(current.current)
    const wheel = event => {
      event.preventDefault() // React's wheel listener is passive; this native listener also owns trackpad pinch.
      previousTap.current = null
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1)
      zoomTo(current.current.scale * Math.exp(-delta * 0.002), relative(position(event)))
    }
    viewport.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('resize', remeasure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure)
    observer?.observe(viewport)
    if (imageRef.current) observer?.observe(imageRef.current)
    return () => {
      viewport.removeEventListener('wheel', wheel)
      window.removeEventListener('resize', remeasure)
      observer?.disconnect()
    }
  }, [enabled, resetKey, relative, update, zoomTo])

  const handleKeyDown = useCallback(event => {
    if (!options.current.enabled) return false
    const scale = current.current.scale
    if (event.key === 'Escape' && scale === 1) return false
    if (!['+', '=', '-', '0', 'Escape'].includes(event.key)) return false
    event.preventDefault()
    previousTap.current = null
    if (event.key === '0' || event.key === 'Escape') reset()
    else zoomTo(scale + (event.key === '-' ? -0.5 : 0.5))
    return true
  }, [reset, zoomTo])

  const bind = {
    onPointerDown: event => {
      if (!options.current.enabled || (event.pointerType === 'mouse' && event.button !== 0) || pointers.current.size >= 2) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const point = position(event)
      pointers.current.set(event.pointerId, point)
      if (event.pointerType === 'touch') setTouchDevice(true)
      if (pointers.current.size === 1) {
        suppressClick.current = false
        gesture.current = { start: point, time: event.timeStamp, type: event.pointerType, image: event.target === imageRef.current, moved: false, blocked: current.current.scale > 1, pan: { point, state: current.current } }
      } else {
        const [a, b] = [...pointers.current.values()]
        gesture.current.blocked = true
        gesture.current.multi = true
        gesture.current.pinch = { point: midpoint(a, b), distance: distance(a, b), state: current.current }
        previousTap.current = null
      }
    },
    onPointerMove: event => {
      if (!pointers.current.has(event.pointerId)) return
      const point = position(event)
      pointers.current.set(event.pointerId, point)
      const session = gesture.current
      if (distance(point, session.start) > 8) session.moved = true
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]
        const pinch = session.pinch
        if (!pinch.distance) return
        const center = midpoint(a, b)
        const next = zoomAround(relative(pinch.point), pinch.state, pinch.state.scale * distance(a, b) / pinch.distance)
        update({ ...next, x: next.x + center.x - pinch.point.x, y: next.y + center.y - pinch.point.y })
      } else if (current.current.scale > 1) {
        update({ ...session.pan.state, x: session.pan.state.x + point.x - session.pan.point.x, y: session.pan.state.y + point.y - session.pan.point.y })
      }
    },
    onPointerUp: event => {
      if (!pointers.current.has(event.pointerId)) return
      const session = gesture.current
      const point = position(event)
      pointers.current.delete(event.pointerId)
      if (pointers.current.size) {
        session.pan = { point: [...pointers.current.values()][0], state: current.current }
        return
      }
      clickOnImage.current = session.image
      gesture.current = null
      if (session.multi) { suppressClick.current = true; return }
      const deltaX = point.x - session.start.x
      const deltaY = point.y - session.start.y
      const moved = session.moved || Math.hypot(deltaX, deltaY) > 8
      suppressClick.current = moved || session.multi || (session.type !== 'mouse' && session.image)
      if (moved) {
        previousTap.current = null
        if (!session.blocked && current.current.scale === 1 && session.type !== 'mouse') {
          const direction = swipeDirection(deltaX, deltaY)
          if (direction) options.current.onSwipe(direction)
        }
      } else if (session.type === 'touch' && session.image && event.timeStamp - session.time <= 300) {
        const tap = { ...point, time: event.timeStamp }
        if (isDoubleTap(previousTap.current, tap)) {
          zoomTo(doubleTapTarget(current.current.scale), relative(point))
          previousTap.current = null
        } else previousTap.current = tap
      } else previousTap.current = null
    },
    onPointerCancel: () => { pointers.current.clear(); gesture.current = null; previousTap.current = null; suppressClick.current = true },
    onLostPointerCapture: event => {
      if (pointers.current.has(event.pointerId)) {
        pointers.current.clear(); gesture.current = null; previousTap.current = null; suppressClick.current = true
      }
    },
    onClick: event => {
      event.stopPropagation()
      if (suppressClick.current) return true
      const imageClick = clickOnImage.current || event.target === imageRef.current
      clickOnImage.current = false
      if (!imageClick) return false
      zoomTo(doubleTapTarget(current.current.scale), relative(position(event)))
      return true
    },
  }
  return { state, viewportRef, imageRef, bind, handleKeyDown, onImageLoad: () => update(current.current), showHint: touchDevice && !hasZoomed && state.scale === 1 }
}
