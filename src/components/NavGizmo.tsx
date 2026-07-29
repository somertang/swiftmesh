import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Spherical,
  Vector3,
} from 'three'
import { useT } from '../i18n'

export type NavAxisId = 'x' | 'y' | 'z' | '-x' | '-y' | '-z'

export type NavGizmoApi = {
  focusAxis: (axis: NavAxisId) => void
  orbitByDelta: (deltaX: number, deltaY: number) => void
}

type OrbitControlsLike = {
  target: Vector3
  enabled: boolean
  update: (delta?: number) => void
}

type AxisTip = {
  id: NavAxisId
  sx: number
  sy: number
  depth: number
}

type OrientationSnapshot = {
  tips: AxisTip[]
}

const AXIS_DIRS: Record<NavAxisId, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
  '-x': new Vector3(-1, 0, 0),
  '-y': new Vector3(0, -1, 0),
  '-z': new Vector3(0, 0, -1),
}

const AXIS_META: {
  id: NavAxisId
  color: string
  label?: string
}[] = [
  { id: 'x', color: '#EA334C', label: 'X' },
  { id: 'y', color: '#80CA1E', label: 'Y' },
  { id: 'z', color: '#2D83E8', label: 'Z' },
  { id: '-x', color: '#8a8a8a' },
  { id: '-y', color: '#8a8a8a' },
  { id: '-z', color: '#8a8a8a' },
]

const TURN_RATE = 2.2 * Math.PI
const ORBIT_SENSITIVITY = 0.005
const CLICK_MOVE_PX = 5
const _dir = new Vector3()
const _qCam = new Quaternion()
const _offset = new Vector3()
const _spherical = new Spherical()
const _matDummy = new Object3D()

type AnimState = {
  focus: Vector3
  radius: number
  qFrom: Quaternion
  qTo: Quaternion
}

/** R3F bridge: axis tween, orbit drag, live orientation for the DOM card. */
export function NavGizmoBridge({
  apiRef,
  orientationRef,
}: {
  apiRef: MutableRefObject<NavGizmoApi | null>
  orientationRef: MutableRefObject<OrientationSnapshot>
}) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as OrbitControlsLike | null
  const invalidate = useThree(s => s.invalidate)
  const animRef = useRef<AnimState | null>(null)
  const defaultUpRef = useRef(new Vector3(0, 1, 0))
  const controlsRef = useRef(controls)
  controlsRef.current = controls

  const focusAxis = useCallback(
    (axis: NavAxisId) => {
      const orbit = controlsRef.current
      if (!(camera instanceof PerspectiveCamera) || !orbit) return

      animRef.current = null
      const focus = orbit.target.clone()
      const radius = Math.max(camera.position.distanceTo(focus), 0.001)
      const endPos = AXIS_DIRS[axis].clone().normalize().multiplyScalar(radius).add(focus)

      const qFrom = camera.quaternion.clone()
      _matDummy.position.copy(endPos)
      _matDummy.up.copy(defaultUpRef.current)
      _matDummy.lookAt(focus)
      const qTo = _matDummy.quaternion.clone()

      animRef.current = { focus, radius, qFrom, qTo }
      invalidate()
    },
    [camera, invalidate]
  )

  const orbitByDelta = useCallback(
    (deltaX: number, deltaY: number) => {
      const orbit = controlsRef.current
      if (!(camera instanceof PerspectiveCamera) || !orbit) return

      animRef.current = null
      _offset.copy(camera.position).sub(orbit.target)
      _spherical.setFromVector3(_offset)
      _spherical.theta -= deltaX * ORBIT_SENSITIVITY
      _spherical.phi -= deltaY * ORBIT_SENSITIVITY
      _spherical.phi = MathUtils.clamp(_spherical.phi, 0.05, Math.PI - 0.05)
      _spherical.makeSafe()
      _offset.setFromSpherical(_spherical)
      camera.position.copy(orbit.target).add(_offset)
      camera.up.copy(defaultUpRef.current)
      camera.lookAt(orbit.target)
      orbit.update()
      invalidate()
    },
    [camera, invalidate]
  )

  useEffect(() => {
    apiRef.current = { focusAxis, orbitByDelta }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, focusAxis, orbitByDelta])

  useFrame((_, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return

    _qCam.copy(camera.quaternion).invert()
    orientationRef.current = {
      tips: AXIS_META.map(meta => {
        _dir.copy(AXIS_DIRS[meta.id]).applyQuaternion(_qCam)
        return {
          id: meta.id,
          sx: _dir.x,
          sy: -_dir.y,
          depth: _dir.z,
        }
      }),
    }

    const anim = animRef.current
    const orbit = controlsRef.current
    if (!anim || !orbit) return

    const step = Math.min(1, delta * TURN_RATE)
    anim.qFrom.rotateTowards(anim.qTo, step)
    camera.quaternion.copy(anim.qFrom)
    camera.position
      .set(0, 0, 1)
      .applyQuaternion(anim.qFrom)
      .multiplyScalar(anim.radius)
      .add(anim.focus)
    camera.up.set(0, 1, 0).applyQuaternion(anim.qFrom).normalize()
    orbit.target.copy(anim.focus)
    orbit.update()
    invalidate()

    if (anim.qFrom.angleTo(anim.qTo) < 0.01) {
      camera.up.copy(defaultUpRef.current)
      orbit.update()
      animRef.current = null
    }
  })

  return null
}

type NavGizmoCardProps = {
  apiRef: MutableRefObject<NavGizmoApi | null>
  orientationRef: MutableRefObject<OrientationSnapshot>
}

type DragSession = {
  pointerId: number
  lastX: number
  lastY: number
  startX: number
  startY: number
  moved: boolean
  axis: NavAxisId | null
}

function axisFromTarget(target: EventTarget | null): NavAxisId | null {
  if (!(target instanceof Element)) return null
  const host = target.closest('[data-axis]')
  const id = host?.getAttribute('data-axis')
  if (!id) return null
  if (id in AXIS_DIRS) return id as NavAxisId
  return null
}

/** Theme-aligned DOM orientation gizmo (rounded card under the shading toolbar). */
export function NavGizmoCard({ apiRef, orientationRef }: NavGizmoCardProps) {
  const t = useT()
  const cardRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragSession | null>(null)

  useEffect(() => {
    let raf = 0
    const tipLayer = () => svgRef.current?.querySelector<SVGGElement>('.nav-gizmo-tips')
    const lineLayer = () => svgRef.current?.querySelector<SVGGElement>('.nav-gizmo-lines')

    const tick = () => {
      const svg = svgRef.current
      const tipsHost = tipLayer()
      const { tips } = orientationRef.current
      if (svg && tipsHost && tips.length) {
        const cx = 50
        const cy = 50
        const reach = 34
        for (const tip of tips) {
          const el = tipsHost.querySelector<SVGGElement>(`[data-axis="${tip.id}"]`)
          if (!el) continue
          el.setAttribute('transform', `translate(${cx + tip.sx * reach} ${cy + tip.sy * reach})`)
          el.style.opacity = String(MathUtils.clamp(0.35 + (1 - tip.depth) * 0.4, 0.35, 1))
        }
        const sorted = [...tips].sort((a, b) => b.depth - a.depth)
        for (const tip of sorted) {
          const el = tipsHost.querySelector(`[data-axis="${tip.id}"]`)
          if (el) tipsHost.appendChild(el)
        }
        const lines = lineLayer()
        if (lines) {
          for (const tip of tips) {
            if (tip.id !== 'x' && tip.id !== 'y' && tip.id !== 'z') continue
            const line = lines.querySelector<SVGLineElement>(`[data-axis-line="${tip.id}"]`)
            if (!line) continue
            line.setAttribute('x2', String(cx + tip.sx * (reach - 10)))
            line.setAttribute('y2', String(cy + tip.sy * (reach - 10)))
            line.style.opacity = String(MathUtils.clamp(0.45 + (1 - tip.depth) * 0.35, 0.4, 1))
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [orientationRef])

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    try {
      cardRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    if (!session.moved && session.axis) {
      apiRef.current?.focusAxis(session.axis)
    }
    dragRef.current = null
    cardRef.current?.classList.remove('is-dragging')
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      axis: axisFromTarget(event.target),
    }
    cardRef.current?.setPointerCapture(event.pointerId)
    cardRef.current?.classList.add('is-dragging')
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return

    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom

    // Drag only applies while pointer stays inside the card.
    if (!inside) {
      endDrag(event)
      return
    }

    const dx = event.clientX - session.lastX
    const dy = event.clientY - session.lastY
    session.lastX = event.clientX
    session.lastY = event.clientY

    const totalDx = event.clientX - session.startX
    const totalDy = event.clientY - session.startY
    if (!session.moved && totalDx * totalDx + totalDy * totalDy > CLICK_MOVE_PX * CLICK_MOVE_PX) {
      session.moved = true
      session.axis = null
    }

    if (session.moved && (dx !== 0 || dy !== 0)) {
      apiRef.current?.orbitByDelta(dx, dy)
    }
  }

  return (
    <div
      ref={cardRef}
      className="nav-gizmo-card"
      role="group"
      aria-label={t('navGizmo.aria')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <svg ref={svgRef} className="nav-gizmo-svg" viewBox="0 0 100 100" width="100%" height="100%">
        <g className="nav-gizmo-lines">
          {(['x', 'y', 'z'] as const).map(id => {
            const meta = AXIS_META.find(a => a.id === id)!
            return (
              <line
                key={`line-${id}`}
                data-axis-line={id}
                x1="50"
                y1="50"
                x2="50"
                y2="50"
                stroke={meta.color}
                strokeWidth="2.25"
                strokeLinecap="round"
              />
            )
          })}
        </g>
        <g className="nav-gizmo-tips">
          {AXIS_META.map(meta => {
            const positive = Boolean(meta.label)
            const labelKey =
              meta.id === 'x'
                ? 'navGizmo.axisX'
                : meta.id === 'y'
                  ? 'navGizmo.axisY'
                  : meta.id === 'z'
                    ? 'navGizmo.axisZ'
                    : meta.id === '-x'
                      ? 'navGizmo.axisNegX'
                      : meta.id === '-y'
                        ? 'navGizmo.axisNegY'
                        : 'navGizmo.axisNegZ'
            return (
              <g
                key={meta.id}
                data-axis={meta.id}
                className={`nav-gizmo-tip${positive ? ' is-positive' : ' is-negative'}`}
                role="button"
                tabIndex={0}
                aria-label={t(labelKey)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    apiRef.current?.focusAxis(meta.id)
                  }
                }}
              >
                <circle className="nav-gizmo-tip-hit" r={positive ? 12 : 8} fill="transparent" />
                <circle className="nav-gizmo-tip-dot" r={positive ? 8.5 : 3.6} fill={meta.color} />
                {meta.label ? (
                  <text
                    className="nav-gizmo-tip-label"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                  >
                    {meta.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

export function createNavGizmoOrientationRef(): MutableRefObject<OrientationSnapshot> {
  return {
    current: {
      tips: AXIS_META.map(m => ({ id: m.id, sx: 0, sy: 0, depth: 0 })),
    },
  }
}
