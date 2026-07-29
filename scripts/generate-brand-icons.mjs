import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const repoRoot = process.cwd()
const inputLogo = path.join(repoRoot, 'src', 'assets', 'logo.png')
const publicDir = path.join(repoRoot, 'public')
const buildDir = path.join(repoRoot, 'build')

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

async function main() {
  await ensureDirs()

  await writePng(192, 'logo-192.png')
  await writePng(512, 'logo-512.png')
  await writePng(180, 'apple-touch-icon.png')
  await writeIco(path.join(publicDir, 'favicon.ico'))
  // electron-builder Windows app / installer icon
  await writeIco(path.join(buildDir, 'icon.ico'))
}

await main()

