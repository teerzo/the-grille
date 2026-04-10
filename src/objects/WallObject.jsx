import { useEffect, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { FrontSide, MathUtils, SRGBColorSpace, TextureLoader } from 'three'

function DebugWireBox({ size, offset = [0, 0, 0] }) {
  return (
    <mesh position={offset}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#ff2d2d" wireframe />
    </mesh>
  )
}

function WallObject({
  position,
  wallHeight,
  tileSize,
  wallKey,
  yaw,
  isHovered,
  onRegister,
  showDebug,
  baseY = 0,
  /** When false, visual meshes stay; Rapier wall colliders are omitted (perf testing). */
  collisionsEnabled = true,
}) {
  const texture = useLoader(TextureLoader, '/textures/floor-tile-32.png')
  const pressedTexture = useLoader(TextureLoader, '/textures/floor-tile-32-red.png')
  const blackTexture = useLoader(TextureLoader, '/textures/floor-tile-32-black.png')
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
  texture.colorSpace = SRGBColorSpace
  pressedTexture.colorSpace = SRGBColorSpace
  blackTexture.colorSpace = SRGBColorSpace

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return undefined
    mesh.userData.tileKey = wallKey
    onRegister(wallKey, mesh)
    return () => onRegister(wallKey, null)
  }, [onRegister, wallKey])

  useEffect(() => {
    const onButtonPressed = (event) => {
      const buttonPosition = event?.detail?.position
      if (!buttonPosition) return

      const dx = position[0] - buttonPosition[0]
      const dy = position[1] + baseY + wallHeight / 2 - buttonPosition[1]
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
  }, [position, baseY, wallHeight])

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

  const wallCenterY = position[1] + baseY + wallHeight / 2

  return (
    <>
      <mesh ref={meshRef} position={[position[0], wallCenterY, position[2]]} rotation={[0, yaw, 0]}>
        <planeGeometry args={[tileSize, wallHeight]} />
        <meshStandardMaterial map={texture} side={FrontSide} color={isHovered ? '#ffd54a' : '#ffffff'} />
      </mesh>
      <mesh position={[position[0], wallCenterY, position[2]]} rotation={[0, yaw, 0]}>
        <planeGeometry args={[tileSize, wallHeight]} />
        <meshStandardMaterial
          ref={redMaterialRef}
          map={pressedTexture}
          side={FrontSide}
          transparent
          opacity={0}
        />
      </mesh>
      <mesh position={[position[0], wallCenterY, position[2]]} rotation={[0, yaw, 0]}>
        <planeGeometry args={[tileSize, wallHeight]} />
        <meshStandardMaterial
          ref={blackMaterialRef}
          map={blackTexture}
          side={FrontSide}
          transparent
          opacity={0}
        />
      </mesh>
      {collisionsEnabled ? (
        <RigidBody type="fixed" colliders={false} position={[position[0], wallCenterY, position[2]]} rotation={[0, yaw, 0]}>
          <CuboidCollider args={[tileSize / 2, wallHeight / 2, 0.05]} />
        </RigidBody>
      ) : null}
    </>
  )
}

export default WallObject
