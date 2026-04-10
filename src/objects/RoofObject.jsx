import { useEffect, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { MathUtils, SRGBColorSpace, TextureLoader } from 'three'

/** @param {number} ceilingY - Absolute world Y for the roof plane and collider. */
function RoofObject({ position, tileSize, ceilingY }) {
  const texture = useLoader(TextureLoader, '/textures/floor-tile-32.png')
  const pressedTexture = useLoader(TextureLoader, '/textures/floor-tile-32-red.png')
  const blackTexture = useLoader(TextureLoader, '/textures/floor-tile-32-black.png')
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
    const onButtonPressed = (event) => {
      const buttonPosition = event?.detail?.position
      if (!buttonPosition) return

      const dx = position[0] - buttonPosition[0]
      const dy = ceilingY - buttonPosition[1]
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
  }, [ceilingY, position])

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
      <mesh position={[position[0], ceilingY, position[2]]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[tileSize, tileSize]} />
        <meshStandardMaterial map={texture} color="#d8d8d8" />
      </mesh>
      <mesh position={[position[0], ceilingY - 0.001, position[2]]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[tileSize, tileSize]} />
        <meshStandardMaterial
          ref={redMaterialRef}
          map={pressedTexture}
          transparent
          opacity={0}
        />
      </mesh>
      <mesh position={[position[0], ceilingY - 0.002, position[2]]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[tileSize, tileSize]} />
        <meshStandardMaterial
          ref={blackMaterialRef}
          map={blackTexture}
          transparent
          opacity={0}
        />
      </mesh>
      <RigidBody type="fixed" colliders={false} position={[position[0], ceilingY, position[2]]}>
        <CuboidCollider args={[tileSize / 2, 0.05, tileSize / 2]} />
      </RigidBody>
    </>
  )
}

export default RoofObject
