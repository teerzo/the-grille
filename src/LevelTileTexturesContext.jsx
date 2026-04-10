import { createContext, useContext, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { NearestFilter, TextureLoader, SRGBColorSpace } from 'three'

const LevelTileTexturesContext = createContext(null)

/** Vite `public/` assets; respect `base` in vite.config (e.g. GitHub Pages). */
function publicTextureUrl(filename) {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base
  return `${prefix}/textures/${filename}`
}

function configureTileTexture(t) {
  t.colorSpace = SRGBColorSpace
  t.generateMipmaps = false
  t.minFilter = NearestFilter
  t.magFilter = NearestFilter
  t.needsUpdate = true
  return t
}

export function LevelTileTexturesProvider({ children }) {
  const texture = useLoader(TextureLoader, publicTextureUrl('floor-tile-32.png'))
  const pressedTexture = useLoader(TextureLoader, publicTextureUrl('floor-tile-32-red.png'))
  const blackTexture = useLoader(TextureLoader, publicTextureUrl('floor-tile-32-black.png'))
  configureTileTexture(texture)
  configureTileTexture(pressedTexture)
  configureTileTexture(blackTexture)
  const value = useMemo(
    () => ({ texture, pressedTexture, blackTexture }),
    [texture, pressedTexture, blackTexture],
  )
  return (
    <LevelTileTexturesContext.Provider value={value}>
      {children}
    </LevelTileTexturesContext.Provider>
  )
}

export function useLevelTileTextures() {
  const ctx = useContext(LevelTileTexturesContext)
  if (!ctx) {
    throw new Error('useLevelTileTextures must be used inside LevelTileTexturesProvider')
  }
  return ctx
}
