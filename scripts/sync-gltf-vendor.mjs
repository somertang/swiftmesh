/**
 * Copies Three.js Draco / Basis JS decoders into public/vendor for offline GLTF loading.
 * Downloads missing WASM binaries when absent (run once after install or three upgrades).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const threeLibs = path.join(root, 'node_modules/three/examples/jsm/libs')
const vendorRoot = path.join(root, 'public/vendor')

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    await fs.copyFile(path.join(src, entry.name), path.join(dest, entry.name))
  }
}

async function downloadIfMissing(url, dest) {
  try {
    await fs.access(dest)
    return
  } catch {
    // missing
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, buf)
  console.log(`Downloaded ${path.basename(dest)}`)
}

async function main() {
  await copyDir(path.join(threeLibs, 'draco/gltf'), path.join(vendorRoot, 'draco/gltf'))
  await copyDir(path.join(threeLibs, 'basis'), path.join(vendorRoot, 'basis'))

  if (process.env.SYNC_VENDOR_FETCH === '1') {
    await downloadIfMissing(
      'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/jsm/libs/basis/basis_transcoder.wasm',
      path.join(vendorRoot, 'basis/basis_transcoder.wasm')
    )
    await downloadIfMissing(
      'https://www.gstatic.com/draco/versioned/decoders/1.5.7/draco_decoder.wasm',
      path.join(vendorRoot, 'draco/gltf/draco_decoder.wasm')
    )
  } else {
    const basisWasm = path.join(vendorRoot, 'basis/basis_transcoder.wasm')
    try {
      await fs.access(basisWasm)
    } catch {
      console.warn(
        'Missing public/vendor/basis/basis_transcoder.wasm — KTX2 textures need it. Run: SYNC_VENDOR_FETCH=1 pnpm sync:vendor'
      )
    }
  }

  console.log('GLTF vendor assets synced to public/vendor')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
