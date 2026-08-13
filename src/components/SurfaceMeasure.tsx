import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3, type Group, type Object3D } from 'three'
import { isViewCamera, worldSizeFromScreenSize } from '../lib/cameraFocus'
import { formatLengthMeters } from '../lib/formatLength'
import { orbitTargetOf, raycastViewport } from '../lib/raycastModel'

export type Measurement = {
  id: string
  a: [number, number, number]
  b: [number, number, number]
}

const MEASURE_COLOR = '#ec7700'
const CROSS_SCREEN_PX = 8
const OVERLAY_LINE = {
  depthTest: false,
  depthWrite: false,
  renderOrder: 1000,
  transparent: true,
  toneMapped: false,
} as const

function newMeasureId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function midpoint(a: [number, number, number], b: [number, number, number]) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as [number, number, number]
}

function dist(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

export function SurfaceMeasure({
  enabled,
  visible,
  modelRoot,
  measurements,
  onMeasurementsChange,
}: {
  enabled: boolean
  visible: boolean
  modelRoot: Object3D | null
  measurements: Measurement[]
  onMeasurementsChange: (next: Measurement[] | ((prev: Measurement[]) => Measurement[])) => void
}) {
  const { camera, gl, controls } = useThree()
  const [pending, setPending] = useState<[number, number, number] | null>(null)
  const [hover, setHover] = useState<[number, number, number] | null>(null)
  const pendingRef = useRef<[number, number, number] | null>(null)
  const onChangeRef = useRef(onMeasurementsChange)
  onChangeRef.current = onMeasurementsChange

  useEffect(() => {
    if (!enabled) {
      pendingRef.current = null
      setPending(null)
      setHover(null)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const element = gl.domElement
    const prevCursor = element.style.cursor
    element.style.cursor = 'crosshair'

    const hitPoint = (event: PointerEvent): [number, number, number] | null => {
      const hit = raycastViewport(event, element, camera, modelRoot, orbitTargetOf(controls), false)
      return hit ? [hit.point.x, hit.point.y, hit.point.z] : null
    }

    const onPointerMove = (event: PointerEvent) => {
      setHover(hitPoint(event))
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      const point = hitPoint(event)
      if (!point) return
      if (!pendingRef.current) {
        pendingRef.current = point
        setPending(point)
        return
      }
      const a = pendingRef.current
      pendingRef.current = null
      setPending(null)
      onChangeRef.current(list => [...list, { id: newMeasureId(), a, b: point }])
    }

    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    return () => {
      element.style.cursor = prevCursor
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
    }
  }, [enabled, modelRoot, camera, gl, controls])

  if (!visible) return null

  const rubber = pending && hover ? { a: pending, b: hover } : null

  return (
    <>
      {measurements.map(item => (
        <MeasureSegment key={item.id} a={item.a} b={item.b} />
      ))}
      {rubber ? <MeasureSegment a={rubber.a} b={rubber.b} preview /> : null}
      {pending && !rubber ? <MeasureCross position={pending} /> : null}
    </>
  )
}

function MeasureSegment({
  a,
  b,
  preview = false,
}: {
  a: [number, number, number]
  b: [number, number, number]
  preview?: boolean
}) {
  const length = dist(a, b)
  const mid = midpoint(a, b)
  return (
    <>
      <Line
        points={[a, b]}
        color={MEASURE_COLOR}
        lineWidth={preview ? 1.5 : 2}
        dashed={preview}
        dashSize={0.04}
        gapSize={0.03}
        {...OVERLAY_LINE}
      />
      <MeasureCross position={a} />
      <MeasureCross position={b} />
      <Html
        position={new Vector3(...mid)}
        center
        occlude={false}
        style={{ pointerEvents: 'none' }}
        zIndexRange={[20, 0]}
      >
        <div className={`measure-label${preview ? ' is-preview' : ''}`}>{formatLengthMeters(length)}</div>
      </Html>
    </>
  )
}

function MeasureCross({ position }: { position: [number, number, number] }) {
  const { camera, size } = useThree()
  const groupRef = useRef<Group>(null)
  const worldPos = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const group = groupRef.current
    if (!group || !isViewCamera(camera)) return
    worldPos.set(position[0], position[1], position[2])
    const world = worldSizeFromScreenSize(CROSS_SCREEN_PX, worldPos, camera, size.height)
    group.scale.setScalar(Math.max(world, 1e-6))
    group.quaternion.copy(camera.quaternion)
  })

  return (
    <group ref={groupRef} position={position}>
      <Line points={[[-0.5, 0, 0], [0.5, 0, 0]]} color={MEASURE_COLOR} lineWidth={1.5} {...OVERLAY_LINE} />
      <Line points={[[0, -0.5, 0], [0, 0.5, 0]]} color={MEASURE_COLOR} lineWidth={1.5} {...OVERLAY_LINE} />
    </group>
  )
}
