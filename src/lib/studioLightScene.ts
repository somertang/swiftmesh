import { BoxGeometry, Mesh, MeshBasicMaterial, Scene } from 'three'

/**
 * Studio light probe scene — mirrors ohzinteractive/glb-viewer-core StudioLightScene.
 * Used with PMREMGenerator to produce scene.environment IBL.
 */
export function createStudioLightScene(): Scene {
  const scene = new Scene()

  const m0 = new Mesh(new BoxGeometry(3, 3, 3), new MeshBasicMaterial({ color: 0xffffff }))
  const m1 = new Mesh(new BoxGeometry(3, 3, 3), new MeshBasicMaterial({ color: 0xffffff }))
  const m2 = new Mesh(new BoxGeometry(3, 3, 3), new MeshBasicMaterial({ color: 0xffffff }))
  const m3 = new Mesh(new BoxGeometry(5, 3, 5), new MeshBasicMaterial({ color: 0xffffff }))
  const m4Floor = new Mesh(new BoxGeometry(10, 0.1, 10), new MeshBasicMaterial({ color: 0xffffff }))

  m0.material.color.multiplyScalar(5)
  m1.material.color.multiplyScalar(5)
  m2.material.color.multiplyScalar(5)
  m3.material.color.multiplyScalar(5)
  m4Floor.material.color.multiplyScalar(0.25)

  scene.add(m0, m1, m2, m3, m4Floor)

  const height = 5
  m0.position.set(5, height, 5)
  m1.position.set(-5, height, 5)
  m2.position.set(5, height, -5)
  m3.position.set(-5, height, -5)
  m4Floor.position.set(0, -1, 0)

  return scene
}
