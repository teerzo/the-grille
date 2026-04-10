import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Quaternion, Vector3 } from 'three'
import { CapsuleCollider, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep } from '@react-three/rapier'
import PlayerObject from './PlayerObject.jsx'

const FP_EULER = new Euler(0, 0, 0, 'YXZ')
const MARKER_EULER = new Euler(0, 0, 0, 'YXZ')
const PLAYER_YAW_EULER = new Euler(0, 0, 0, 'YXZ')
const PLAYER_QUAT = new Quaternion()
const FP_FORWARD = new Vector3()
const FP_RIGHT = new Vector3()
const PLAYER_GROUND_Y = 0.65
const JUMP_VELOCITY = 5
const MOVE_SPEED = 4
/** Horizontal velocity smoothing; dt matches default Rapier Physics timeStep (1/60). */
const MOVE_SMOOTHING = 16
const PHYSICS_DT = 1 / 60

function CameraMarker({ markerRef, position }) {
  return (
    <group ref={markerRef} position={position}>
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, 0]}>
          {/* <boxGeometry args={[0.28, 0.18, 0.18]} /> */}
          <meshStandardMaterial color="#d83a3a" />
        </mesh>
        <mesh position={[0.18, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <mesh position={[-0.08, 0.12, 0]}>
          {/* <boxGeometry args={[0.1, 0.05, 0.06]} /> */}
          <meshStandardMaterial color="#d83a3a" />
        </mesh>
      </group>
    </group>
  )
}

function PlayerController({ spawnPosition = [0, 0.65, 0] }) {
  const { camera, gl } = useThree()
  const playerBodyRef = useRef(null)
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
  })
  const activeCameraIndex = useRef(0)
  const cameraStates = useRef([
    { position: new Vector3(spawnPosition[0], spawnPosition[1] + 0.55, spawnPosition[2]), yaw: 0, pitch: 0, eyeHeight: 0.55 },
    { position: new Vector3(0, 1.6, -5), yaw: Math.PI, pitch: 0, eyeHeight: 1.6 },
  ])
  const markerRefs = useRef([null, null])
  const isLocked = useRef(false)
  const isDeadRef = useRef(false)
  const deathRespawnTimerRef = useRef(null)

  useEffect(() => {
    const applyActiveCameraState = () => {
      const state = cameraStates.current[activeCameraIndex.current]
      camera.position.copy(state.position)
      FP_EULER.set(state.pitch, state.yaw, 0)
      camera.quaternion.setFromEuler(FP_EULER)
      window.dispatchEvent(
        new CustomEvent('active-camera-changed', {
          detail: { index: activeCameraIndex.current },
        }),
      )
    }

    applyActiveCameraState()

    const domElement = gl.domElement
    const lockPointer = () => domElement.requestPointerLock()
    const onPointerLockChange = () => {
      isLocked.current = document.pointerLockElement === domElement
    }

    const onKeyDown = (event) => {
      if (isDeadRef.current) return
      if (event.code === 'KeyW') moveState.current.forward = true
      if (event.code === 'KeyS') moveState.current.backward = true
      if (event.code === 'KeyA') moveState.current.left = true
      if (event.code === 'KeyD') moveState.current.right = true
      if (event.code === 'KeyE' && !event.repeat) {
        const playerBody = playerBodyRef.current
        if (activeCameraIndex.current === 0 && playerBody) {
          const playerPos = playerBody.translation()
          window.dispatchEvent(
            new CustomEvent('player-interact', {
              detail: { position: [playerPos.x, playerPos.y, playerPos.z] },
            }),
          )
        }
      }
      if (event.code === 'Space') {
        const playerBody = playerBodyRef.current
        if (activeCameraIndex.current === 0 && playerBody) {
          const playerPos = playerBody.translation()
          const playerVel = playerBody.linvel()
          const isGrounded = Math.abs(playerPos.y - PLAYER_GROUND_Y) < 0.05 && Math.abs(playerVel.y) < 0.1
          if (isGrounded) {
            playerBody.setLinvel({ x: playerVel.x, y: JUMP_VELOCITY, z: playerVel.z }, true)
          }
        } else if (activeCameraIndex.current === 1) {
          moveState.current.up = true
        }
      }
      if (event.code === 'Digit1') {
        activeCameraIndex.current = 0
        applyActiveCameraState()
      }
      if (event.code === 'Digit2') {
        activeCameraIndex.current = 1
        applyActiveCameraState()
      }
    }

    const onKeyUp = (event) => {
      if (isDeadRef.current) return
      if (event.code === 'KeyW') moveState.current.forward = false
      if (event.code === 'KeyS') moveState.current.backward = false
      if (event.code === 'KeyA') moveState.current.left = false
      if (event.code === 'KeyD') moveState.current.right = false
      if (event.code === 'Space') moveState.current.up = false
    }

    const onMouseMove = (event) => {
      if (isDeadRef.current || !isLocked.current) return
      const sensitivity = 0.002
      const activeState = cameraStates.current[activeCameraIndex.current]
      activeState.yaw -= event.movementX * sensitivity
      activeState.pitch -= event.movementY * sensitivity
      activeState.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, activeState.pitch))
    }

    domElement.addEventListener('click', lockPointer)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      domElement.removeEventListener('click', lockPointer)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [camera, gl])

  useEffect(() => {
    const DEATH_FADE_SEC = 2.4

    const onLaserHit = () => {
      if (isDeadRef.current) return
      const rb = playerBodyRef.current
      if (!rb) return

      isDeadRef.current = true
      moveState.current.forward = false
      moveState.current.backward = false
      moveState.current.left = false
      moveState.current.right = false
      moveState.current.up = false
      if (document.pointerLockElement) {
        document.exitPointerLock()
      }

      const v = rb.linvel()
      rb.setLinvel({ x: 0, y: v.y, z: 0 }, true)

      window.dispatchEvent(
        new CustomEvent('player-death-fade', {
          detail: { durationSec: DEATH_FADE_SEC },
        }),
      )

      if (deathRespawnTimerRef.current) {
        clearTimeout(deathRespawnTimerRef.current)
      }
      deathRespawnTimerRef.current = setTimeout(() => {
        deathRespawnTimerRef.current = null
        window.dispatchEvent(new CustomEvent('player-death-level-reset'))
        window.dispatchEvent(new CustomEvent('player-death-fade-reset'))
      }, DEATH_FADE_SEC * 1000)
    }

    window.addEventListener('player-laser-hit', onLaserHit)
    return () => {
      window.removeEventListener('player-laser-hit', onLaserHit)
      if (deathRespawnTimerRef.current) {
        clearTimeout(deathRespawnTimerRef.current)
      }
    }
  }, [spawnPosition])

  useBeforePhysicsStep(() => {
    const playerBody = playerBodyRef.current
    if (!playerBody || isDeadRef.current || activeCameraIndex.current !== 0) return

    const activeState = cameraStates.current[0]
    PLAYER_YAW_EULER.set(0, activeState.yaw, 0)
    PLAYER_QUAT.setFromEuler(PLAYER_YAW_EULER)
    FP_FORWARD.set(0, 0, -1).applyQuaternion(PLAYER_QUAT).setY(0).normalize()
    FP_RIGHT.set(1, 0, 0).applyQuaternion(PLAYER_QUAT).setY(0).normalize()

    const moveX = (moveState.current.right ? 1 : 0) - (moveState.current.left ? 1 : 0)
    const moveZ = (moveState.current.forward ? 1 : 0) - (moveState.current.backward ? 1 : 0)
    let moveWorldX = 0
    let moveWorldZ = 0

    if (moveX !== 0 || moveZ !== 0) {
      const length = Math.hypot(moveX, moveZ)
      const nx = moveX / length
      const nz = moveZ / length
      moveWorldX = FP_RIGHT.x * nx + FP_FORWARD.x * nz
      moveWorldZ = FP_RIGHT.z * nx + FP_FORWARD.z * nz
    }

    const targetVx = moveWorldX * MOVE_SPEED
    const targetVz = moveWorldZ * MOVE_SPEED
    const playerVel = playerBody.linvel()
    const t = 1 - Math.exp(-MOVE_SMOOTHING * PHYSICS_DT)
    const vx = playerVel.x + (targetVx - playerVel.x) * t
    const vz = playerVel.z + (targetVz - playerVel.z) * t

    playerBody.setLinvel({ x: vx, y: playerVel.y, z: vz }, true)

    playerBody.setRotation({ x: PLAYER_QUAT.x, y: PLAYER_QUAT.y, z: PLAYER_QUAT.z, w: PLAYER_QUAT.w }, true)
  })

  useAfterPhysicsStep(() => {
    const playerBody = playerBodyRef.current
    if (!playerBody || activeCameraIndex.current !== 0) return

    const playerPos = playerBody.translation()
    const camOne = cameraStates.current[0]
    camOne.position.set(playerPos.x, playerPos.y + camOne.eyeHeight, playerPos.z)

    const activeState = cameraStates.current[0]
    activeState.position.set(playerPos.x, playerPos.y + activeState.eyeHeight, playerPos.z)
  })

  useFrame((_, delta) => {
    const activeState = cameraStates.current[activeCameraIndex.current]
    const playerBody = playerBodyRef.current

    FP_EULER.set(activeState.pitch, activeState.yaw, 0)
    camera.quaternion.setFromEuler(FP_EULER)
    camera.position.copy(activeState.position)

    FP_FORWARD.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize()
    FP_RIGHT.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()

    const step = MOVE_SPEED * delta

    if (activeCameraIndex.current !== 0) {
      if (moveState.current.forward) activeState.position.addScaledVector(FP_FORWARD, step)
      if (moveState.current.backward) activeState.position.addScaledVector(FP_FORWARD, -step)
      if (moveState.current.left) activeState.position.addScaledVector(FP_RIGHT, -step)
      if (moveState.current.right) activeState.position.addScaledVector(FP_RIGHT, step)
      if (moveState.current.up) {
        activeState.position.y += MOVE_SPEED * delta
      }
    } else if (playerBody) {
      const playerPos = playerBody.translation()
      activeState.position.set(playerPos.x, playerPos.y + activeState.eyeHeight, playerPos.z)
    }
    camera.position.copy(activeState.position)

    const markerMesh = markerRefs.current[1]
    if (markerMesh) {
      const markerState = cameraStates.current[1]
      const markerBackOffset = 0.35
      markerMesh.position.set(
        markerState.position.x + Math.sin(markerState.yaw) * markerBackOffset,
        markerState.position.y - 0.06,
        markerState.position.z + Math.cos(markerState.yaw) * markerBackOffset,
      )
      MARKER_EULER.set(markerState.pitch, markerState.yaw, 0)
      markerMesh.quaternion.setFromEuler(MARKER_EULER)
    }
  })

  return (
    <>
      <RigidBody
        ref={playerBodyRef}
        type="dynamic"
        colliders={false}
        enabledRotations={[false, false, false]}
        canSleep={false}
        ccd
        position={spawnPosition}
      >
        <CapsuleCollider args={[0.35, 0.3]} />
        <PlayerObject />
      </RigidBody>
      <CameraMarker markerRef={(el) => (markerRefs.current[1] = el)} position={[0, 1.6, -5]} />
    </>
  )
}

export default PlayerController
