import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

function parseArgs(argv) {
  const options = {
    size: 1024,
    tile: 64,
    seed: 1337,
    out: 'public/textures/grille-tile.png',
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === '--size' && next) {
      options.size = Number(next)
      i += 1
      continue
    }
    if (arg === '--tile' && next) {
      options.tile = Number(next)
      i += 1
      continue
    }
    if (arg === '--seed' && next) {
      options.seed = Number(next)
      i += 1
      continue
    }
    if (arg === '--out' && next) {
      options.out = next
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  if (!Number.isFinite(options.size) || options.size < 2) {
    throw new Error('--size must be a number >= 2')
  }
  if (!Number.isFinite(options.tile) || options.tile < 2) {
    throw new Error('--tile must be a number >= 2')
  }
  if (!Number.isFinite(options.seed)) {
    throw new Error('--seed must be a number')
  }

  return options
}

function printHelp() {
  console.log(`Generate a seamless tiled texture PNG.

Usage:
  node scripts/generate-texture.mjs [options]

Options:
  --size <n>   Texture width/height in px (default: 1024)
  --tile <n>   Visual tile scale in px (default: 64)
  --seed <n>   Random seed for deterministic output (default: 1337)
  --out <path> Output PNG path (default: public/textures/grille-tile.png)
`)
}

function rngFromSeed(seed) {
  let x = (seed | 0) || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) % 1000000) / 1000000
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

function createPeriodicGrid(random, gridSize) {
  const values = new Array(gridSize)
  for (let y = 0; y < gridSize; y += 1) {
    values[y] = new Array(gridSize)
    for (let x = 0; x < gridSize; x += 1) {
      values[y][x] = random()
    }
  }
  return values
}

function samplePeriodicNoise(grid, u, v) {
  const size = grid.length
  const x = u * size
  const y = v * size
  const x0 = Math.floor(x) % size
  const y0 = Math.floor(y) % size
  const x1 = (x0 + 1) % size
  const y1 = (y0 + 1) % size
  const tx = smoothstep(x - Math.floor(x))
  const ty = smoothstep(y - Math.floor(y))

  const top = lerp(grid[y0][x0], grid[y0][x1], tx)
  const bottom = lerp(grid[y1][x0], grid[y1][x1], tx)
  return lerp(top, bottom, ty)
}

function writeTexture({ size, tile, seed, out }) {
  const png = new PNG({ width: size, height: size })
  const random = rngFromSeed(seed)
  const noiseGrid = createPeriodicGrid(random, 24)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size
      const v = y / size

      // Periodic grid pattern using wrapped UVs so image edges match perfectly.
      const waveU = 0.5 + 0.5 * Math.sin((u * size * 2 * Math.PI) / tile)
      const waveV = 0.5 + 0.5 * Math.sin((v * size * 2 * Math.PI) / tile)
      const lineMask = Math.max(waveU, waveV)

      const n1 = samplePeriodicNoise(noiseGrid, u * 3, v * 3)
      const n2 = samplePeriodicNoise(noiseGrid, u * 7, v * 7)
      const mixedNoise = 0.7 * n1 + 0.3 * n2

      const base = 42 + mixedNoise * 32
      const highlights = lineMask > 0.92 ? 35 : 0
      const occlusion = lineMask < 0.55 ? -20 : 0
      const value = Math.max(0, Math.min(255, base + highlights + occlusion))

      const idx = (y * size + x) * 4
      png.data[idx + 0] = Math.min(255, value + 8)
      png.data[idx + 1] = Math.min(255, value + 12)
      png.data[idx + 2] = Math.min(255, value + 18)
      png.data[idx + 3] = 255
    }
  }

  const outputPath = path.resolve(out)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, PNG.sync.write(png))
  return outputPath
}

function main() {
  const options = parseArgs(process.argv)
  const outputPath = writeTexture(options)
  console.log(`Texture written to ${outputPath}`)
}

main()
