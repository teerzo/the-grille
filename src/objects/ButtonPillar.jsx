import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, RigidBody } from '@react-three/rapier'
import { MathUtils } from 'three'

function ButtonPillar({ position }) {
  const buttonTopRef = useRef(null)
  const pressState = useRef({ active: false, timer: 0 })

  useEffect(() => {
    const onInteract = (event) => {
      const playerPosition = event?.detail?.position
      if (!playerPosition) return

      const dx = playerPosition[0] - position[0]
      const dz = playerPosition[2] - position[2]
      const distance = Math.hypot(dx, dz)
      if (distance <= 1.1) {
        pressState.current.active = true
        pressState.current.timer = 0
        window.dispatchEvent(
          new CustomEvent('button-pressed', {
            detail: { position: [position[0], position[1], position[2]] },
          }),
        )
      }
    }

    window.addEventListener('player-interact', onInteract)
    return () => window.removeEventListener('player-interact', onInteract)
  }, [position])

  useFrame((_, delta) => {
    const buttonMesh = buttonTopRef.current
    if (!buttonMesh) return

    const state = pressState.current
    let targetY = 0.76

    if (state.active) {
      state.timer += delta
      if (state.timer < 0.12) {
        targetY = 0.68
      } else if (state.timer < 0.24) {
        targetY = 0.76
      } else {
        state.active = false
        state.timer = 0
      }
    }

    buttonMesh.position.y = MathUtils.lerp(buttonMesh.position.y, targetY, 0.25)
  })

  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <BallCollider args={[0.2]} position={[0, 0.76, 0]} />
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.7, 16]} />
        <meshStandardMaterial color="#6b6b6b" />
      </mesh>
      <mesh ref={buttonTopRef} position={[0, 0.76, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.08, 24]} />
        <meshStandardMaterial color="#d92d2d" />
      </mesh>
    </RigidBody>
  )
}

export default ButtonPillar
