import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'
import { attachResourceUrlModifier } from './modelSource'

let tgaLoader: TGALoader | null = null

function getTgaLoader(): TGALoader {
  if (!tgaLoader) tgaLoader = new TGALoader()
  return tgaLoader
}

export function configureFbxLoader(
  loader: FBXLoader,
  resourceUrls: Record<string, string> = {}
) {
  loader.manager.addHandler(/\.tga$/i, getTgaLoader())
  if (Object.keys(resourceUrls).length > 0) {
    attachResourceUrlModifier(loader.manager, resourceUrls)
  }
}
