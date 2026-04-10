function PlayerObject({ position = [0, 0, 0] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 0.7, 8, 16]} />
        <meshStandardMaterial color="#6aa6ff" />
      </mesh>
      <mesh position={[0, 0, -0.5]}>
        {/* <boxGeometry args={[0.15, 0.15, 0.15]} /> */}
        <meshStandardMaterial color="#f97316" />
      </mesh>
    </group>
  )
}

export default PlayerObject
