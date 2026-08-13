import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import { orbitTargetOf, raycastViewport } from '../lib/raycastModel'

export type AnnotateStroke = {
  id: string
  color: string
  points: Array<[number, number, number]>
}

const MIN_POINT_DIST_SQ = 0.0004
const OVERLAY_LINE = {
  depthTest: false,
  depthWrite: false,
  renderOrder: 1000,
  transparent: true,
  toneMapped: false,
} as const

function newStrokeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function SurfaceAnnotate({
  enabled,
  visible,
  modelRoot,
  color,
  strokes,
  onStrokesChange,
}: {
  enabled: boolean
  visible: boolean
  modelRoot: Object3D | null
  color: string
  strokes: AnnotateStroke[]
  onStrokesChange: (next: AnnotateStroke[] | ((prev: AnnotateStroke[]) => AnnotateStroke[])) => void
}) {
  const { camera, gl, controls } = useThree()
  const drawingRef = useRef<AnnotateStroke | null>(null)
  const colorRef = useRef(color)
  colorRef.current = color
  const onChangeRef = useRef(onStrokesChange)
  onChangeRef.current = onStrokesChange

  useEffect(() => {
    if (!enabled) return
    const element = gl.domElement
    const prevCursor = element.style.cursor
    element.style.cursor = 'crosshair'

    const hitPoint = (event: PointerEvent) =>
      raycastViewport(event, element, camera, modelRoot, orbitTargetOf(controls), true)

    const appendPoint = (stroke: AnnotateStroke, x: number, y: number, z: number) => {
      const last = stroke.points[stroke.points.length - 1]
      if (last) {
        const dx = x - last[0]
        const dy = y - last[1]
        const dz = z - last[2]
        if (dx * dx + dy * dy + dz * dz < MIN_POINT_DIST_SQ) return
      }
      stroke.points.push([x, y, z])
      onChangeRef.current(prev =>
        prev.map(item => (item.id === stroke.id ? { ...stroke, points: [...stroke.points] } : item))
      )
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const hit = hitPoint(event)
      if (!hit) return
      event.preventDefault()
      element.setPointerCapture(event.pointerId)
      const stroke: AnnotateStroke = {
        id: newStrokeId(),
        color: colorRef.current,
        points: [[hit.point.x, hit.point.y, hit.point.z]],
      }
      drawingRef.current = stroke
      onChangeRef.current(prev => [...prev, { ...stroke, points: [...stroke.points] }])
    }

    const onPointerMove = (event: PointerEvent) => {
      const stroke = drawingRef.current
      if (!stroke || !element.hasPointerCapture(event.pointerId)) return
      const hit = hitPoint(event)
      if (!hit) return
      appendPoint(stroke, hit.point.x, hit.point.y, hit.point.z)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (drawingRef.current) {
        try {
          element.releasePointerCapture(event.pointerId)
        } catch {
          /* already released */
        }
      }
      drawingRef.current = null
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    return () => {
      element.style.cursor = prevCursor
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
    }
  }, [enabled, modelRoot, camera, gl, controls])

  if (!visible) return null

  return (
    <>
      {strokes.map(stroke =>
        stroke.points.length >= 2 ? (
          <Line key={stroke.id} points={stroke.points} color={stroke.color} lineWidth={2} {...OVERLAY_LINE} />
        ) : null
      )}
    </>
  )
}
