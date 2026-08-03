import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import os from 'node:os'

const require = createRequire(import.meta.url)
const repoRoot = process.cwd()
const arches = ['arm64', 'x64']

/** Fallback mirrors help when github.com release assets are unreachable. */
const MIRROR_PREFIXES = [
  '', // official first
  'https://ghfast.top/',
]

function resolveReleaseTag() {
  try {
    const pkg = require('ffmpeg-static/package.json')
    const tag = pkg?.['ffmpeg-static']?.['binary-release-tag']
    if (typeof tag === 'string' && tag) return tag
  } catch {
    // fall through
  }
  return 'b6.1.1'
}

function curlProxyArgs() {
  const proxy =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY
  return proxy ? ['-x', proxy] : []
}

function candidateUrls(release, arch) {
  const asset = `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}/ffmpeg-darwin-${arch}.gz`
  const fromEnv = (process.env.FFMPEG_BINARIES_URL || '').replace(/\/$/, '')
  const urls = []
  if (fromEnv) urls.push(`${fromEnv}/${release}/ffmpeg-darwin-${arch}.gz`)
  for (const prefix of MIRROR_PREFIXES) {
    urls.push(prefix ? `${prefix}${asset}` : asset)
  }
  return [...new Set(urls)]
}

async function downloadGunzip(url, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  const tmpGz = `${destPath}.gz.tmp`
  const tmpBin = `${destPath}.tmp`

  await fs.rm(tmpGz, { force: true })
  await fs.rm(tmpBin, { force: true })

  const curl = spawnSync(
    'curl',
    ['-fL', '--retry', '3', '--retry-delay', '2', '--connect-timeout', '20', '--max-time', '300', ...curlProxyArgs(), '-o', tmpGz, url],
    { encoding: 'utf8', env: process.env },
  )
  if (curl.status !== 0) {
    await fs.rm(tmpGz, { force: true })
    throw new Error(`curl failed for ${url}: ${curl.stderr || curl.stdout || `exit ${curl.status}`}`)
  }

  const gunzip = spawnSync('gunzip', ['-c', tmpGz], {
    encoding: 'buffer',
    maxBuffer: 128 * 1024 * 1024,
  })
  await fs.rm(tmpGz, { force: true })
  if (gunzip.status !== 0) {
    throw new Error(`gunzip failed: ${gunzip.stderr?.toString() || `exit ${gunzip.status}`}`)
  }

  await fs.writeFile(tmpBin, gunzip.stdout, { mode: 0o755 })
  await fs.chmod(tmpBin, 0o755)
  await fs.rename(tmpBin, destPath)
}

async function tryCopyHostBinary(outPath, arch) {
  if (process.platform !== 'darwin' || os.arch() !== arch) return false
  try {
    const fromPackage = require.resolve('ffmpeg-static/package.json')
    const hostBin = path.join(path.dirname(fromPackage), 'ffmpeg')
    const st = await fs.stat(hostBin)
    if (!st.isFile() || st.size <= 0) return false
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.copyFile(hostBin, outPath)
    await fs.chmod(outPath, 0o755)
    console.info(`[prepare-ffmpeg-mac] copied host ffmpeg-static → darwin-${arch}`)
    return true
  } catch {
    return false
  }
}

async function ensureArch(release, arch) {
  const outDir = path.join(repoRoot, 'build', 'ffmpeg', `darwin-${arch}`)
  const outPath = path.join(outDir, 'ffmpeg')

  try {
    const st = await fs.stat(outPath)
    if (st.isFile() && st.size > 0) {
      console.info(`[prepare-ffmpeg-mac] cached darwin-${arch}`)
      return
    }
  } catch {
    // need to obtain
  }

  if (await tryCopyHostBinary(outPath, arch)) return

  const errors = []
  for (const url of candidateUrls(release, arch)) {
    try {
      console.info(`[prepare-ffmpeg-mac] downloading darwin-${arch} from ${url}`)
      await downloadGunzip(url, outPath)
      console.info(`[prepare-ffmpeg-mac] wrote ${path.relative(repoRoot, outPath)}`)
      return
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  throw new Error(`Failed to obtain darwin-${arch} ffmpeg:\n${errors.join('\n')}`)
}

async function main() {
  if (process.platform !== 'darwin') {
    console.info('[prepare-ffmpeg-mac] skip (not macOS)')
    return
  }

  const release = process.env.FFMPEG_BINARY_RELEASE || resolveReleaseTag()
  await Promise.all(arches.map((arch) => ensureArch(release, arch)))
}

await main()
