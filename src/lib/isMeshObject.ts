import { Mesh, type Object3D } from 'three'

/** Duck-type Mesh so FBXLoader/example jsm objects still match if `three` is duplicated. */
export function isMeshObject(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true
}
