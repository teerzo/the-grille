import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MeshBasicMaterial, Object3D } from 'three'
import { useLevelTileTextures } from '../LevelTileTexturesContext.jsx'
import { TILE_PLANE_GEOMETRY } from '../levelGeometries.js'

const _obj = new Object3D()

/**
 * Single draw call for all floor tile main planes.
 *
 * We do **not** use per-instance vertex/instance colors for hover: with `vertexColors`
 * + `setColorAt`, uninitialized or mis-synced instance colors multiply the map by black
 * so the texture appears missing. Hover is a separate mesh with raycasting disabled.
 */
const InstancedFloors = forwardRef(function InstancedFloors(
  { positions, hoveredFloorIndex },
  ref,
) {
  const { texture } = useLevelTileTextures()
  const count = positions.length
  const hoverMeshRef = useRef(null)

  const material = useMemo(() => {
    /** Unlit so the 32×32 tile reads clearly; walls still use standard lighting. */
    const m = new MeshBasicMaterial({ map: texture })
    return m
  }, [texture])

  const hoverMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffd54a',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    [],
  )

  useEffect(
    () => () => {
      material.dispose()
      hoverMaterial.dispose()
    },
    [material, hoverMaterial],
  )

  useLayoutEffect(() => {
    const mesh = ref?.current
    if (!mesh || count === 0) return
    for (let i = 0; i < count; i++) {
      const p = positions[i]
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(-Math.PI / 2, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count, positions, ref])

  /** Hover quad must not steal raycasts from the instanced floor. */
  useLayoutEffect(() => {
    const m = hoverMeshRef.current
    if (m) m.raycast = () => {}
  }, [hoveredFloorIndex])

  if (count === 0) return null

  const hoverPos =
    hoveredFloorIndex >= 0 && hoveredFloorIndex < positions.length
      ? positions[hoveredFloorIndex]
      : null

  return (
    <>
      <instancedMesh ref={ref} args={[TILE_PLANE_GEOMETRY, material, count]} frustumCulled />
      {hoverPos ? (
        <mesh
          ref={hoverMeshRef}
          position={[hoverPos[0], hoverPos[1] + 0.003, hoverPos[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          frustumCulled={false}
        >
          <primitive object={TILE_PLANE_GEOMETRY} attach="geometry" />
          <primitive object={hoverMaterial} attach="material" />
        </mesh>
      ) : null}
    </>
  )
})

export default InstancedFloors
