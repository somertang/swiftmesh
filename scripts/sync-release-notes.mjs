import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = 'somertang/swiftmesh'
const CHANGELOG_PATH = path.resolve(__dirname, '../CHANGELOG.md')

function compareSemver(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

function parseChangelog(markdown) {
  const sections = new Map()
  const parts = markdown.split(/\r?\n(?=## \[)/)
  for (const part of parts) {
    const match = part.match(/^## \[([\d.]+)\][^\n]*\r?\n([\s\S]*)$/)
    if (!match) continue
    sections.set(match[1], match[2].trim())
  }
  return sections
}

function versionFromTag(tag) {
  const normalized = tag.trim()
  return normalized.startsWith('v') ? normalized.slice(1) : normalized
}

function tagForVersion(version) {
  return `v${version}`
}

function usage() {
  console.error('Usage: node scripts/sync-release-notes.mjs <tag>')
  console.error('Example: pnpm run sync:release-notes -- v0.2.13')
  process.exit(1)
}

const tagArg = process.argv[2] || process.env.GITHUB_REF_NAME
if (!tagArg) usage()

const version = versionFromTag(tagArg)
const tag = tagArg.startsWith('v') ? tagArg : tagForVersion(version)

if (!fs.existsSync(CHANGELOG_PATH)) {
  console.error(`CHANGELOG not found: ${CHANGELOG_PATH}`)
  process.exit(1)
}

const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8')
const sections = parseChangelog(changelog)
const body = sections.get(version)

if (!body) {
  console.error(`No CHANGELOG section found for version ${version} (tag ${tag}).`)
  process.exit(1)
}

const versions = [...sections.keys()].sort(compareSemver)
const idx = versions.indexOf(version)
if (idx < 0) {
  console.error(`Version ${version} missing from parsed CHANGELOG sections.`)
  process.exit(1)
}

const prev = idx > 0 ? versions[idx - 1] : null
let notes = `${body}\n`
if (prev) {
  notes += `\n**Full Changelog**: https://github.com/${REPO}/compare/${tagForVersion(prev)}...${tag}\n`
}

const notesFile = path.join(os.tmpdir(), `swiftmesh-release-${version}.md`)
fs.writeFileSync(notesFile, notes, 'utf8')

try {
  execSync(`gh release view ${tag}`, {
    encoding: 'utf8',
    stdio: 'pipe',
  })
} catch {
  console.error(`GitHub release ${tag} does not exist yet.`)
  fs.unlinkSync(notesFile)
  process.exit(1)
}

try {
  execSync(`gh release edit ${tag} --notes-file "${notesFile}"`, {
    encoding: 'utf8',
    stdio: 'inherit',
  })
  console.log(`Updated release notes for ${tag} from CHANGELOG.md`)
} finally {
  fs.unlinkSync(notesFile)
}
