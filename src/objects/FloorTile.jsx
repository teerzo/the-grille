import { memo, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { MathUtils } from 'three'
import { useLevelTileTextures } from '../LevelTileTexturesContext.jsx'
import { TILE_PLANE_GEOMETRY } from '../levelGeometries.js'

function FloorTile({
  position,
  tileSize,
  tileKey,
  isHovered,
  onRegister,
  /** When false, only meshes; no Rapier floor collider (use global ground plane). */
  collisionsEnabled = true,
  /** When true, skip the main textured plane (drawn by InstancedFloors). */
  hideBasePlane = false,
}) {
  const { texture, pressedTexture, blackTexture } = useLevelTileTextures()
  const meshRef = useRef(null)
  const redMaterialRef = useRef(null)
  const blackMaterialRef = useRef(null)
  const effectState = useRef({
    phase: 'idle',
    timer: 0,
    delay: 0,
    redOpacity: 0,
    blackOpacity: 0,
  })

  useEffect(() => {
    if (hideBasePlane) return undefined
    const mesh = meshRef.current
    if (!mesh) return undefined
    mesh.userData.tileKey = tileKey
    onRegister(tileKey, mesh)
    return () => onRegister(tileKey, null)
  }, [hideBasePlane, onRegister, tileKey])

  useEffect(() => {
    const onButtonPressed = (event) => {
      const buttonPosition = event?.detail?.position
      if (!buttonPosition) return

      const dx = position[0] - buttonPosition[0]
      const dy = position[1] - buttonPosition[1]
      const dz = position[2] - buttonPosition[2]
      const distance = Math.hypot(dx, dy, dz)

      effectState.current.phase = 'queued'
      effectState.current.delay = distance * 0.2
      effectState.current.timer = 0
      effectState.current.redOpacity = 0
      effectState.current.blackOpacity = 0
    }

    window.addEventListener('button-pressed', onButtonPressed)
    return () => window.removeEventListener('button-pressed', onButtonPressed)
  }, [position])

  useFrame((_, delta) => {
    const state = effectState.current

    if (state.phase === 'queued') {
      state.delay -= delta
      if (state.delay <= 0) {
        state.phase = 'flash-red'
        state.timer = 0
        state.redOpacity = 1
      }
    } else if (state.phase === 'flash-red') {
      state.timer += delta
      state.redOpacity = Math.max(0, state.redOpacity - delta * 4)
      if (state.timer >= 0.22 || state.redOpacity <= 0.01) {
        state.phase = 'to-black'
      }
    } else if (state.phase === 'to-black') {
      state.blackOpacity = Math.min(1, state.blackOpacity + delta * 1.5)
      if (state.blackOpacity >= 0.999) {
        state.phase = 'black'
      }
    } else if (state.phase === 'black') {
      state.blackOpacity = 1
      state.redOpacity = 0
    }

    if (redMaterialRef.current) {
      redMaterialRef.current.opacity = MathUtils.lerp(redMaterialRef.current.opacity, state.redOpacity, 0.25)
    }
    if (blackMaterialRef.current) {
      blackMaterialRef.current.opacity = MathUtils.lerp(blackMaterialRef.current.opacity, state.blackOpacity, 0.25)
    }
  })

  return (
    <>
      {!hideBasePlane ? (
        <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <primitive object={TILE_PLANE_GEOMETRY} attach="geometry" />
          <meshStandardMaterial map={texture} color={isHovered ? '#ffd54a' : '#ffffff'} />
        </mesh>
      ) : null}
      <mesh position={[position[0], position[1] + 0.001, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={TILE_PLANE_GEOMETRY} attach="geometry" />
        <meshStandardMaterial
          ref={redMaterialRef}
          map={pressedTexture}
          transparent
          opacity={0}
        />
      </mesh>
      <mesh position={[position[0], position[1] + 0.002, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={TILE_PLANE_GEOMETRY} attach="geometry" />
        <meshStandardMaterial
          ref={blackMaterialRef}
          map={blackTexture}
          transparent
          opacity={0}
        />
      </mesh>
      {collisionsEnabled ? (
        <RigidBody type="fixed" colliders={false} position={[position[0], position[1] - 0.05, position[2]]}>
          <CuboidCollider args={[tileSize / 2, 0.05, tileSize / 2]} />
        </RigidBody>
      ) : null}
    </>
  )
}

function propsEqual(prev, next) {
  return (
    prev.tileKey === next.tileKey &&
    prev.position[0] === next.position[0] &&
    prev.position[1] === next.position[1] &&
    prev.position[2] === next.position[2] &&
    prev.tileSize === next.tileSize &&
    prev.isHovered === next.isHovered &&
    prev.collisionsEnabled === next.collisionsEnabled &&
    prev.hideBasePlane === next.hideBasePlane &&
    prev.onRegister === next.onRegister
  )
}

export default memo(FloorTile, propsEqual)
