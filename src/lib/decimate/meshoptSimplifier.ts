import { MeshoptSimplifier } from 'meshoptimizer/simplifier'

let readyPromise: Promise<void> | null = null

export async function ensureMeshoptSimplifier(): Promise<typeof MeshoptSimplifier> {
  if (!MeshoptSimplifier.supported) {
    throw new Error('Mesh optimizer WASM is not supported in this environment.')
  }
  readyPromise ??= MeshoptSimplifier.ready
  await readyPromise
  return MeshoptSimplifier
}
