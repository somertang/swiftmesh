import type { Object3D } from 'three'

type RigNode = Object3D & {
  isLight?: boolean
  isCamera?: boolean
  userData: Record<string, unknown>
}

const OWN_LIGHT_VISIBLE_KEY = '__ownLightVisible'

export function hideModelOwnCameras(root: Object3D) {
  root.traverse(child => {
    const node = child as RigNode
    if (node.isCamera === true) {
      node.visible = false
    }
  })
}

export function hasModelOwnLights(root: Object3D | null): boolean {
  if (!root) return false
  let found = false
  root.traverse(child => {
    if (found) return
    if ((child as RigNode).isLight === true) {
      found = true
    }
  })
  return found
}

/**
 * Called once after cloning. Records each light's authored visibility and
 * hides all of them so no mode accidentally inherits embedded lights.
 * Must be called before setModelOwnLightsEnabled.
 */
export function initModelOwnLights(root: Object3D) {
  root.traverse(child => {
    const node = child as RigNode
    if (node.isLight !== true) return
    node.userData[OWN_LIGHT_VISIBLE_KEY] = node.visible
    node.visible = false
  })
}

export function setModelOwnLightsEnabled(root: Object3D | null, enabled: boolean) {
  if (!root) return
  root.traverse(child => {
    const node = child as RigNode
    if (node.isLight !== true) return
    if (typeof node.userData[OWN_LIGHT_VISIBLE_KEY] !== 'boolean') {
      node.userData[OWN_LIGHT_VISIBLE_KEY] = node.visible
    }
    const ownVisible = node.userData[OWN_LIGHT_VISIBLE_KEY] === true
    node.visible = enabled ? ownVisible : false
  })
}
