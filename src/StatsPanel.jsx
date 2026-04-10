import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/** Runs inside Canvas: samples frame timing (useFrame must live under R3F). */
export function FpsCollector({ onTick }) {
  const acc = useRef({ frames: 0, msSum: 0, last: performance.now() })

  useFrame((_, delta) => {
    const a = acc.current
    a.frames += 1
    a.msSum += delta * 1000
    const now = performance.now()
    if (now - a.last < 1000) return
    const fps = Math.round((a.frames * 1000) / (now - a.last))
    const ms = a.msSum / a.frames
    onTick({ fps, ms })
    a.frames = 0
    a.msSum = 0
    a.last = now
  })

  return null
}

/** DOM overlay; render outside Canvas (R3F only accepts THREE objects as scene children). */
export function FpsHud({ fps, ms }) {
  return (
    <div className="fps-hud" aria-hidden>
      {fps} FPS · {ms.toFixed(1)} ms
    </div>
  )
}
