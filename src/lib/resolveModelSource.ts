import type { OpenedModel } from '../desktopTypes'
import {
  type ModelFormat,
  type ModelSource,
  basenameOf,
  collectGltfSidecarUris,
  collectMtlTextureUris,
  collectObjMtllibs,
  detectModelFormat,
  isEncryptedModelFileName,
  isFbxTextureFileName,
  isModelFileName,
  mimeForFormat,
  MODEL_FORMAT_LIST,
  normalizeAssetPath,
  stemFromName,
} from './modelSource'

export class ModelResolveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelResolveError'
  }
}

function arrayBufferToText(data: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(data)
}

function pickPrimaryFile(files: File[]): File {
  const models = files.filter(f => isModelFileName(f.name))
  if (models.length === 0) {
    throw new ModelResolveError(`Please choose a ${MODEL_FORMAT_LIST} file.`)
  }
  if (models.length > 1) {
    throw new ModelResolveError(`Please select only one model file (${MODEL_FORMAT_LIST}).`)
  }
  return models[0]!
}

function buildFileIndex(files: File[]): Map<string, File> {
  const index = new Map<string, File>()
  for (const file of files) {
    const base = basenameOf(file.name)
    index.set(base.toLowerCase(), file)
    index.set(normalizeAssetPath(file.name).toLowerCase(), file)
    // webkitRelativePath when available
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    if (relative) {
      index.set(normalizeAssetPath(relative).toLowerCase(), file)
      index.set(basenameOf(relative).toLowerCase(), file)
    }
  }
  return index
}

function findInIndex(index: Map<string, File>, uri: string): File | undefined {
  const normalized = normalizeAssetPath(uri)
  return (
    index.get(normalized.toLowerCase()) ??
    index.get(basenameOf(normalized).toLowerCase())
  )
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}

async function collectBrowserCompanions(
  primary: File,
  format: ModelFormat,
  allFiles: File[]
): Promise<{ relativePath: string; data: ArrayBuffer }[]> {
  if (format === 'glb') return []

  const index = buildFileIndex(allFiles)
  const companions: { relativePath: string; data: ArrayBuffer }[] = []
  const seen = new Set<string>()

  const addCompanion = async (uri: string) => {
    const key = normalizeAssetPath(uri)
    if (seen.has(key.toLowerCase())) return
    const file = findInIndex(index, uri)
    if (!file || file === primary) {
      throw new ModelResolveError(
        `Missing dependency "${basenameOf(uri)}". Select the model together with its related files.`
      )
    }
    seen.add(key.toLowerCase())
    companions.push({ relativePath: key, data: await readFileAsArrayBuffer(file) })
  }

  if (format === 'gltf') {
    const text = arrayBufferToText(await readFileAsArrayBuffer(primary))
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new ModelResolveError('Invalid .gltf file (JSON parse failed).')
    }
    for (const uri of collectGltfSidecarUris(json)) {
      await addCompanion(uri)
    }
    return companions
  }

  if (format === 'fbx') {
    for (const file of allFiles) {
      if (file === primary) continue
      if (!isFbxTextureFileName(file.name)) continue
      const relative =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      try {
        await addCompanion(relative)
      } catch {
        /* optional textures — skip unreadables */
      }
    }
    return companions
  }

  if (format !== 'obj') return companions

  const objText = arrayBufferToText(await readFileAsArrayBuffer(primary))
  const mtllibs = collectObjMtllibs(objText)
  for (const mtl of mtllibs) {
    await addCompanion(mtl)
    const mtlFile = findInIndex(index, mtl)
    if (!mtlFile) continue
    const mtlText = arrayBufferToText(await readFileAsArrayBuffer(mtlFile))
    for (const tex of collectMtlTextureUris(mtlText)) {
      await addCompanion(tex)
    }
  }
  return companions
}

function openedToModelSource(opened: OpenedModel): ModelSource {
  const format = opened.format
  const mainUrl = URL.createObjectURL(new Blob([opened.data], { type: mimeForFormat(format) }))
  const resourceUrls: Record<string, string> = {}
  for (const companion of opened.companions ?? []) {
    const key = normalizeAssetPath(companion.relativePath)
    const ext = basenameOf(key).split('.').pop()?.toLowerCase()
    let type = 'application/octet-stream'
    if (ext === 'mtl' || ext === 'obj') type = 'text/plain'
    else if (ext === 'bin' || ext === 'fbx' || ext === 'tga' || ext === 'bmp' || ext === 'tif' || ext === 'tiff') {
      type = 'application/octet-stream'
    }
    else if (ext === 'png') type = 'image/png'
    else if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg'
    else if (ext === 'webp') type = 'image/webp'
    else if (ext === 'gif') type = 'image/gif'
    resourceUrls[key] = URL.createObjectURL(new Blob([companion.data], { type }))
    resourceUrls[basenameOf(key)] = resourceUrls[key]!
  }
  return {
    format,
    mainUrl,
    label: stemFromName(opened.name),
    path: opened.path,
    resourceUrls,
  }
}

/** Build ModelSource from Electron OpenedModel payload. */
export function modelSourceFromOpened(opened: OpenedModel): ModelSource {
  return openedToModelSource(opened)
}

/** Build OpenedModel from a browser FileList / File[] (main + optional sidecars). */
export async function openedModelFromFiles(
  files: File[] | FileList,
  nativePath: string | null = null
): Promise<OpenedModel> {
  const list = Array.from(files)
  if (list.length === 0) {
    throw new ModelResolveError('No files selected.')
  }

  const primary = pickPrimaryFile(list)
  if (isEncryptedModelFileName(primary.name)) {
    throw new ModelResolveError(
      'Encrypted .smsh models must be opened in the desktop app so SwiftMesh can ask for the password.'
    )
  }
  const format = detectModelFormat(primary.name)
  if (!format) {
    throw new ModelResolveError(`Please choose a ${MODEL_FORMAT_LIST} file.`)
  }

  const companions = await collectBrowserCompanions(primary, format, list)
  return {
    name: primary.name,
    path: nativePath ?? primary.name,
    data: await readFileAsArrayBuffer(primary),
    format,
    companions,
  }
}

/** Build ModelSource from a browser FileList / File[] (main + optional sidecars). */
export async function modelSourceFromFiles(
  files: File[] | FileList,
  nativePath: string | null = null
): Promise<ModelSource> {
  return openedToModelSource(await openedModelFromFiles(files, nativePath))
}
