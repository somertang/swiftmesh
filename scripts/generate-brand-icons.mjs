import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const repoRoot = process.cwd()
const inputLogo = path.join(repoRoot, 'src', 'assets', 'logo.png')
const publicDir = path.join(repoRoot, 'public')
const buildDir = path.join(repoRoot, 'build')

/** Apple iconutil sizes (1x + 2x where applicable). */
const ICNS_SIZES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
]

async function ensureDirs() {
  await fs.mkdir(publicDir, { recursive: true })
  await fs.mkdir(buildDir, { recursive: true })
}

async function writePng(size, outFileName) {
  const outPath = path.join(publicDir, outFileName)
  await sharp(inputLogo).resize(size, size, { fit: 'contain' }).png().toFile(outPath)
}

async function writeIco(outPath) {
  // png-to-ico takes a square PNG and produces a multi-size .ico (incl. 256).
  // Some logo files can contain trailing bytes or metadata that `pngjs` rejects;
  // re-encode via sharp first to normalize the PNG stream.
  const cleanPngPath = path.join(publicDir, '_logo-clean.png')
  await sharp(inputLogo).png().toFile(cleanPngPath)

  const icoBuffer = await pngToIco(cleanPngPath)
  await fs.writeFile(outPath, icoBuffer)

  await fs.rm(cleanPngPath).catch(() => {})
}

async function writeIcns() {
  if (process.platform !== 'darwin') {
    console.info('[brand-icons] skip .icns (not macOS)')
    return
  }

  const iconsetDir = path.join(buildDir, 'icon.iconset')
  await fs.rm(iconsetDir, { recursive: true, force: true })
  await fs.mkdir(iconsetDir, { recursive: true })

  for (const { name, size } of ICNS_SIZES) {
    await sharp(inputLogo)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(path.join(iconsetDir, name))
  }

  const icnsPath = path.join(buildDir, 'icon.icns')
  const result = spawnSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`iconutil failed: ${result.stderr || result.stdout || `exit ${result.status}`}`)
  }

  await fs.rm(iconsetDir, { recursive: true, force: true })
  console.info(`[brand-icons] wrote ${path.relative(repoRoot, icnsPath)}`)
}

async function main() {
  await ensureDirs()

  await writePng(192, 'logo-192.png')
  await writePng(512, 'logo-512.png')
  await writePng(180, 'apple-touch-icon.png')
  await writeIco(path.join(publicDir, 'favicon.ico'))
  // electron-builder Windows app / installer icon
  await writeIco(path.join(buildDir, 'icon.ico'))
  // electron-builder macOS app icon
  await writeIcns()
}

await main()
