import { Group, PerspectiveCamera, Quaternion, Vector2, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { TransformHistory } from './transformHistory'
import {
  applyTransform,
  applyWorldRotationDelta,
  captureTransform,
  pickRotateHandle,
  signedAngleAroundAxis,
  snapValue,
  trackballRotationDelta,
  transformsEqual,
} from './transformMath'

describe('transformMath', () => {
  it('snaps angles to 15° steps', () => {
    expect(snapValue((Math.PI / 180) * 14, (Math.PI / 180) * 15)).toBeCloseTo((Math.PI / 180) * 15, 6)
    expect(snapValue((Math.PI / 180) * 7, (Math.PI / 180) * 15)).toBeCloseTo(0, 6)
  })

  it('computes signed rotation around an axis', () => {
    const axis = new Vector3(1, 0, 0)
    const start = new Vector3(0, 1, 0)
    const end = new Vector3(0, 0, 1)
    expect(signedAngleAroundAxis(start, end, axis)).toBeCloseTo(Math.PI / 2, 5)
    expect(signedAngleAroundAxis(end, start, axis)).toBeCloseTo(-Math.PI / 2, 5)
  })

  it('applies world-space rotation without mutating the input quaternion', () => {
    const object = new Group()
    const delta = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
    const before = delta.clone()
    applyWorldRotationDelta(object, delta)
    expect(delta.equals(before)).toBe(true)
    const dir = new Vector3(0, 1, 0).applyQuaternion(object.quaternion)
    expect(dir.z).toBeCloseTo(1, 5)
  })

  it('picks a stable rotate handle near ring crossings', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    const origin = new Vector3(0, 0, 0)
    const quat = new Quaternion()
    const pointer = new Vector2(0.08, 0.08)
    const a = pickRotateHandle(pointer, camera, origin, 1, 'global', quat, 800, 800, null)
    const b = pickRotateHandle(pointer, camera, origin, 1, 'global', quat, 800, 800, a)
    expect(a === 'x' || a === 'y' || a === 'z' || a === 'trackball').toBe(true)
    expect(b === a || b === 'trackball').toBe(true)
  })

  it('returns trackball inside the gizmo disc', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    const picked = pickRotateHandle(
      new Vector2(0, 0),
      camera,
      new Vector3(0, 0, 0),
      1,
      'global',
      new Quaternion(),
      800,
      800,
      null
    )
    expect(picked).toBe('trackball')
  })

  it('builds a non-identity trackball delta when the pointer moves', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    const out = new Quaternion()
    trackballRotationDelta(
      new Vector2(0, 0),
      new Vector2(0.2, 0.1),
      new Vector2(0, 0),
      0.3,
      0.3,
      camera,
      out
    )
    expect(out.equals(new Quaternion())).toBe(false)
  })
})

describe('TransformHistory', () => {
  it('undoes and redoes a committed transform', () => {
    const object = new Group()
    object.userData.__hierId = 'n1'
    const history = new TransformHistory()
    const before = captureTransform(object)
    object.position.set(1, 2, 3)
    history.commit('n1', before, object)
    expect(object.position.x).toBe(1)
    history.undo(id => (id === 'n1' ? object : null))
    expect(object.position.x).toBe(0)
    history.redo(id => (id === 'n1' ? object : null))
    expect(object.position.x).toBe(1)
  })

  it('ignores no-op commits', () => {
    const object = new Group()
    const history = new TransformHistory()
    const snap = captureTransform(object)
    history.commit('n1', snap, object)
    expect(history.canUndo()).toBe(false)
    expect(transformsEqual(snap, captureTransform(object))).toBe(true)
    applyTransform(object, snap)
  })
})
