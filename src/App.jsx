import { useEffect, useRef, useState } from 'react'
import CanvasView from './canvas.jsx'

function App() {
  const [deathFade, setDeathFade] = useState(0)
  const fadeRafRef = useRef(null)

  useEffect(() => {
    const onFade = (e) => {
      if (fadeRafRef.current) {
        cancelAnimationFrame(fadeRafRef.current)
        fadeRafRef.current = null
      }
      const durationSec = e.detail?.durationSec ?? 2.4
      const start = performance.now()
      const tick = () => {
        const t = (performance.now() - start) / (durationSec * 1000)
        const next = Math.min(1, t)
        setDeathFade(next)
        if (next < 1) {
          fadeRafRef.current = requestAnimationFrame(tick)
        } else {
          fadeRafRef.current = null
        }
      }
      fadeRafRef.current = requestAnimationFrame(tick)
    }

    const onReset = () => {
      if (fadeRafRef.current) {
        cancelAnimationFrame(fadeRafRef.current)
        fadeRafRef.current = null
      }
      setDeathFade(0)
    }

    window.addEventListener('player-death-fade', onFade)
    window.addEventListener('player-death-fade-reset', onReset)
    return () => {
      window.removeEventListener('player-death-fade', onFade)
      window.removeEventListener('player-death-fade-reset', onReset)
      if (fadeRafRef.current) {
        cancelAnimationFrame(fadeRafRef.current)
      }
    }
  }, [])

  return (
    <>
      <CanvasView />
      <div className="screen-cursor" aria-hidden="true" />
      <div className="death-fade-overlay" style={{ opacity: deathFade }} aria-hidden="true" />
    </>
  )
}

export default App
