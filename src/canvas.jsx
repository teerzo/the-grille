import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './scene.jsx'
import { FpsCollector, FpsHud } from './StatsPanel.jsx'

function CanvasView() {
  const containerRef = useRef(null)
  const [fpsHud, setFpsHud] = useState({ fps: 0, ms: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const syncCanvasRect = () => {
      const rect = container.getBoundingClientRect()
      const rootStyle = document.documentElement.style
      rootStyle.setProperty('--canvas-left', `${rect.left}px`)
      rootStyle.setProperty('--canvas-top', `${rect.top}px`)
      rootStyle.setProperty('--canvas-width', `${rect.width}px`)
      rootStyle.setProperty('--canvas-height', `${rect.height}px`)
    }

    syncCanvasRect()
    const resizeObserver = new ResizeObserver(syncCanvasRect)
    resizeObserver.observe(container)
    window.addEventListener('resize', syncCanvasRect)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncCanvasRect)
    }
  }, [])

  return (
    <div ref={containerRef} className="canvas-view">
      {/* Continuous rAF loop at display refresh (vsync); no app-level FPS cap */}
      <Canvas frameloop="always">
        <FpsCollector onTick={setFpsHud} />
        <Scene />
      </Canvas>
      <FpsHud fps={fpsHud.fps} ms={fpsHud.ms} />
    </div>
  )
}

export default CanvasView
