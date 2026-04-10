import { useCallback, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { DoubleSide, Quaternion, Vector3 } from 'three'

/** @see RigidBodyType.Dynamic in @dimforge/rapier3d-compat */
const RAPIER_DYNAMIC = 0

const CONNECTOR_RADIUS = 0.08
const CONNECTOR_LENGTH = 0.14
const BEAM_RADIUS = 0.032
/** Half-extents: local X/Z thickness, local Y = half beam length (cylinder axis). */
const COLLIDER_HALF_THICK = 0.09

const _s = new Vector3()
const _e = new Vector3()
const _tmp = new Vector3()
const _dir = new Vector3()
const _mid = new Vector3()
const _quat = new Quaternion()
const _pulse = new Vector3()

/**
 * Beam connects two L markers (startL–endL). Whole beam lerps toward E–E wall positions.
 */
function LaserObject({ startL, endL, startE, endE }) {
  const laserRbRef = useRef(null)
  const beamRef = useRef(null)
  const c1Ref = useRef(null)
  const c2Ref = useRef(null)
  const pulseRef = useRef(null)

  const unitY = useMemo(() => new Vector3(0, 1, 0), [])

  const colliderHalfLen = useMemo(() => {
    const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    return Math.max(dist(startL, endL), dist(startE, endE)) / 2 + 0.03
  }, [startL, endL, startE, endE])

  const onLaserHit = useCallback((e) => {
    const rb = e.rigidBody
    if (rb && rb.bodyType() === RAPIER_DYNAMIC) {
      window.dispatchEvent(new CustomEvent('player-laser-hit'))
    }
  }, [])

  useFrame((state) => {
    const t = Math.sin(state.clock.elapsedTime * 0.95) * 0.5 + 0.5
    _s.set(startL[0], startL[1], startL[2]).lerp(_tmp.set(startE[0], startE[1], startE[2]), t)
    _e.set(endL[0], endL[1], endL[2]).lerp(_tmp.set(endE[0], endE[1], endE[2]), t)

    _dir.copy(_e).sub(_s)
    const len = Math.max(_dir.length(), 0.001)
    _dir.divideScalar(len)
    _mid.copy(_s).add(_e).multiplyScalar(0.5)
    _quat.setFromUnitVectors(unitY, _dir)

    const beamLen = Math.max(len - CONNECTOR_LENGTH, 0.02)

    if (beamRef.current) {
      beamRef.current.position.copy(_mid)
      beamRef.current.quaternion.copy(_quat)
      beamRef.current.scale.set(1, beamLen, 1)
    }

    const halfConn = CONNECTOR_LENGTH / 2
    if (c1Ref.current) {
      c1Ref.current.position.copy(_s).addScaledVector(_dir, halfConn)
      c1Ref.current.quaternion.copy(_quat)
    }
    if (c2Ref.current) {
      c2Ref.current.position.copy(_e).addScaledVector(_dir, -halfConn)
      c2Ref.current.quaternion.copy(_quat)
    }

    if (pulseRef.current) {
      const pulseT = Math.sin(state.clock.elapsedTime * 1.35) * 0.5 + 0.5
      _pulse.copy(_s).lerp(_e, pulseT)
      pulseRef.current.position.copy(_pulse)
    }

    const rb = laserRbRef.current
    if (rb) {
      rb.setNextKinematicTranslation({ x: _mid.x, y: _mid.y, z: _mid.z })
      rb.setNextKinematicRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w })
    }
  })

  return (
    <group>
      <RigidBody ref={laserRbRef} type="kinematicPosition" colliders={false}>
        <CuboidCollider
          args={[COLLIDER_HALF_THICK, colliderHalfLen, COLLIDER_HALF_THICK]}
          sensor
          onIntersectionEnter={onLaserHit}
        />
      </RigidBody>
      <mesh ref={c1Ref}>
        <cylinderGeometry args={[CONNECTOR_RADIUS, CONNECTOR_RADIUS, CONNECTOR_LENGTH, 12]} />
        <meshStandardMaterial color="#cc1111" emissive="#ff0000" emissiveIntensity={0.55} />
      </mesh>
      <mesh ref={c2Ref}>
        <cylinderGeometry args={[CONNECTOR_RADIUS, CONNECTOR_RADIUS, CONNECTOR_LENGTH, 12]} />
        <meshStandardMaterial color="#cc1111" emissive="#ff0000" emissiveIntensity={0.55} />
      </mesh>
      <mesh ref={beamRef}>
        <cylinderGeometry args={[BEAM_RADIUS, BEAM_RADIUS, 1, 8]} />
        <meshStandardMaterial
          color="#ff3333"
          emissive="#ff0000"
          emissiveIntensity={1.15}
          transparent
          opacity={0.9}
          side={DoubleSide}
        />
      </mesh>
      <mesh ref={pulseRef} position={startL}>
        <sphereGeometry args={[0.09, 14, 14]} />
        <meshStandardMaterial color="#ffffff" emissive="#ff6666" emissiveIntensity={2.2} />
      </mesh>
    </group>
  )
}

export default LaserObject
