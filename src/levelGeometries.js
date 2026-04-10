import { PlaneGeometry } from 'three'

/** Must match TILE_SIZE / WALL_HEIGHT in scene.jsx */
const TILE_SIZE = 2
const WALL_HEIGHT = 2

/** Shared geometry instances — one GPU buffer each, many meshes (read transforms in mesh.matrix). */
export const TILE_PLANE_GEOMETRY = new PlaneGeometry(TILE_SIZE, TILE_SIZE, 1, 1)
export const WALL_PLANE_GEOMETRY = new PlaneGeometry(TILE_SIZE, WALL_HEIGHT, 1, 1)
