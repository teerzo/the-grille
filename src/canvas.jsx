import { Canvas } from '@react-three/fiber'
import Scene from './scene.jsx'

function CanvasView() {
  return (
    <Canvas>
      <Scene />
    </Canvas>
  )
}

export default CanvasView
