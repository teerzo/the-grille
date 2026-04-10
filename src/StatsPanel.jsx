import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import Stats from 'stats.js'

/**
 * Mr.doob FPS / MS panel (stats.js), updated each frame inside the R3F loop.
 */
function StatsPanel() {
  const statsRef = useRef(null)

  useEffect(() => {
    const stats = new Stats()
    statsRef.current = stats
    const { dom } = stats
    dom.style.position = 'fixed'
    dom.style.top = '0'
    dom.style.left = '0'
    dom.style.zIndex = '200'
    document.body.appendChild(dom)
    return () => {
      statsRef.current = null
      document.body.removeChild(dom)
    }
  }, [])

  useFrame(() => {
    statsRef.current?.update()
  })

  return null
}

export default StatsPanel
