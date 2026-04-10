import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GridHelper, Raycaster } from "three";
import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import level1Text from "./levels/level1.txt?raw";
import level2Text from "./levels/level2.txt?raw";
import FloorTile from "./objects/FloorTile.jsx";
import WallObject from "./objects/WallObject.jsx";
import LaserObject from "./objects/LaserObject.jsx";
import PlayerController from "./objects/PlayerController.jsx";
import ButtonPillar from "./objects/ButtonPillar.jsx";
import RoofObject from "./objects/RoofObject.jsx";
const FLOOR_CHAR = "F";
const WALL_CHAR = "W";
const LASER_CHAR = "L";
const LASER_END_CHAR = "E";
const BUTTON_CHAR = "B";
const PLAYER_CHAR = "P";
const ROOF_CHAR = "R";
const TILE_SIZE = 2;
const WALL_HEIGHT = 2;
const UPPER_WALL_BASE_Y = WALL_HEIGHT;
const GRID_CELLS = 40;
const SCENE_OFFSET_X = 0.5;
const SCENE_OFFSET_Z = 0.5;
/** Set true to re-enable wall CuboidCollider rigid bodies (many bodies = Rapier cost). */
const WALL_COLLISIONS_ENABLED = false;
/** World Y for floor visuals and single ground collider (top of slab). */
const LEVEL_FLOOR_Y = -1;
/** Thin ground slab center Y (half-height 0.05 → top surface at LEVEL_FLOOR_Y). */
const FLOOR_PHYSICS_CENTER_Y = LEVEL_FLOOR_Y - 0.05;
const GROUND_PLANE_HALF_EXTENT = (GRID_CELLS * TILE_SIZE) / 2;
/**
 * When true, Rapier does not step the world (no forces, collisions, or body motion).
 * All RigidBody/Collider nodes stay mounted — use for render-only perf testing.
 */
const PHYSICS_PAUSED_FOR_PERF_TEST = true;

function SceneLighting({ onFadeComplete }) {
  const ambientRef = useRef(null);
  const spotRef = useRef(null);
  const pointRef = useRef(null);
  const fadeState = useRef({ active: false, t: 0, done: false });

  useEffect(() => {
    const onButtonPressed = () => {
      fadeState.current.active = true;
      fadeState.current.t = 0;
      fadeState.current.done = false;
    };

    window.addEventListener("button-pressed", onButtonPressed);
    return () => window.removeEventListener("button-pressed", onButtonPressed);
  }, []);

  useFrame((_, delta) => {
    const state = fadeState.current;
    if (!state.active) return;

    state.t = Math.min(1, state.t + delta / 2);
    const lightFactor = 1 - state.t;

    if (ambientRef.current)
      ambientRef.current.intensity = (Math.PI / 2) * lightFactor;
    if (spotRef.current) spotRef.current.intensity = Math.PI * lightFactor;
    if (pointRef.current) pointRef.current.intensity = Math.PI * lightFactor;

    if (state.t >= 1 && !state.done) {
      state.done = true;
      onFadeComplete();
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={Math.PI / 2} />
      <spotLight
        ref={spotRef}
        position={[10, 10, 10]}
        angle={0.15}
        penumbra={1}
        decay={0}
        intensity={Math.PI}
      />
      <pointLight
        ref={pointRef}
        position={[-10, -10, -10]}
        decay={0}
        intensity={Math.PI}
      />
    </>
  );
}

function TileSpacingGrid() {
  const grid = useMemo(() => {
    const helper = new GridHelper(
      TILE_SIZE * GRID_CELLS,
      GRID_CELLS,
      "#ff6b6b",
      "#6b7280",
    );
    helper.position.y = LEVEL_FLOOR_Y - 0.001;
    return helper;
  }, []);

  return <primitive object={grid} />;
}

function parseLevelLayers(levelText) {
  const normalized = levelText
    .trim()
    .split("\n")
    .map((row) => row.trim());

  const sections = [];
  let current = [];
  for (const row of normalized) {
    if (row === "---") {
      sections.push(current.filter((line) => line.length > 0));
      current = [];
    } else {
      current.push(row);
    }
  }
  sections.push(current.filter((line) => line.length > 0));

  const baseRows = sections[0] ?? [];
  if (sections.length <= 1) {
    return {
      baseRows,
      upperWallLayers: [],
      roofRows: [],
    };
  }

  return {
    baseRows,
    upperWallLayers: sections.slice(1, -1),
    roofRows: sections[sections.length - 1] ?? [],
  };
}

function toWorld(colIndex, rowIndex, cols, rows) {
  const xOffset = (cols - 1) / 2;
  const zOffset = (rows - 1) / 2;
  return [
    (colIndex - xOffset) * TILE_SIZE + SCENE_OFFSET_X,
    LEVEL_FLOOR_Y,
    (rowIndex - zOffset) * TILE_SIZE + SCENE_OFFSET_Z,
  ];
}

function findClosestFloor(wallPos, floorPositions) {
  if (floorPositions.length === 0) return null;
  let closest = floorPositions[0];
  let minDistSq = Number.POSITIVE_INFINITY;

  for (const floorPos of floorPositions) {
    const dx = floorPos[0] - wallPos[0];
    const dz = floorPos[2] - wallPos[2];
    const distSq = dx * dx + dz * dz;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closest = floorPos;
    }
  }

  return closest;
}

function getWallTransform(wallPos, floorPositions) {
  const closest = findClosestFloor(wallPos, floorPositions);
  if (!closest) return { position: wallPos, yaw: 0 };

  const dx = closest[0] - wallPos[0];
  const dz = closest[2] - wallPos[2];

  let dirX = 0;
  let dirZ = 0;
  let yaw = 0;

  if (Math.abs(dx) >= Math.abs(dz)) {
    dirX = Math.sign(dx);
    yaw = dirX >= 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    dirZ = Math.sign(dz);
    yaw = dirZ >= 0 ? 0 : Math.PI;
  }

  return {
    position: [
      wallPos[0] + dirX * (TILE_SIZE / 2),
      wallPos[1],
      wallPos[2] + dirZ * (TILE_SIZE / 2),
    ],
    yaw,
  };
}

const LASER_BEAM_Y_OFFSET = 1.0;

function findAdjacentWallCell(layerRows, cols, rowCount, colIndex, rowIndex) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dc, dr] of dirs) {
    const nc = colIndex + dc;
    const nr = rowIndex + dr;
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rowCount) continue;
    if (layerRows[nr][nc] === WALL_CHAR) return { colIndex: nc, rowIndex: nr };
  }
  return null;
}

/**
 * Laser markers (L/E) sit beside a wall; beam endpoints sit on the wall plane facing the room (same as WallObject).
 */
function getLaserWallInnerWorldPoint(
  layerRows,
  cols,
  rowCount,
  markerCol,
  markerRow,
  floorPositions,
  layerBaseY,
) {
  const beamY = layerBaseY + LASER_BEAM_Y_OFFSET;
  const adj = findAdjacentWallCell(
    layerRows,
    cols,
    rowCount,
    markerCol,
    markerRow,
  );
  if (!adj) {
    const [x, , z] = toWorld(markerCol, markerRow, cols, rowCount);
    return [x, beamY, z];
  }
  const wallPos = toWorld(adj.colIndex, adj.rowIndex, cols, rowCount);
  const transform = getWallTransform(wallPos, floorPositions);
  return [transform.position[0], beamY, transform.position[2]];
}

function collectMarkerPairs(layerRows, cols, rowCount, markerChar) {
  const pairs = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const colsWith = [];
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      if (layerRows[rowIndex][colIndex] === markerChar) colsWith.push(colIndex);
    }
    if (colsWith.length < 2) continue;
    colsWith.sort((a, b) => a - b);
    pairs.push({
      kind: "horizontal",
      rowIndex,
      colStart: colsWith[0],
      colEnd: colsWith[colsWith.length - 1],
    });
  }
  for (let colIndex = 0; colIndex < cols; colIndex += 1) {
    const rowsWith = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      if (layerRows[rowIndex][colIndex] === markerChar) rowsWith.push(rowIndex);
    }
    if (rowsWith.length < 2) continue;
    rowsWith.sort((a, b) => a - b);
    pairs.push({
      kind: "vertical",
      colIndex,
      rowStart: rowsWith[0],
      rowEnd: rowsWith[rowsWith.length - 1],
    });
  }
  return pairs;
}

function findMatchingEPair(ePairs, lPair) {
  if (lPair.kind === "horizontal") {
    return ePairs.find(
      (p) =>
        p.kind === "horizontal" &&
        p.colStart === lPair.colStart &&
        p.colEnd === lPair.colEnd,
    );
  }
  return ePairs.find(
    (p) =>
      p.kind === "vertical" &&
      p.colIndex === lPair.colIndex &&
      p.rowStart === lPair.rowStart &&
      p.rowEnd === lPair.rowEnd,
  );
}

function endpointsForPair(
  layerRows,
  cols,
  rowCount,
  floorPositions,
  layerBaseY,
  pair,
) {
  if (pair.kind === "horizontal") {
    const { rowIndex, colStart, colEnd } = pair;
    return {
      start: getLaserWallInnerWorldPoint(
        layerRows,
        cols,
        rowCount,
        colStart,
        rowIndex,
        floorPositions,
        layerBaseY,
      ),
      end: getLaserWallInnerWorldPoint(
        layerRows,
        cols,
        rowCount,
        colEnd,
        rowIndex,
        floorPositions,
        layerBaseY,
      ),
    };
  }
  const { colIndex, rowStart, rowEnd } = pair;
  return {
    start: getLaserWallInnerWorldPoint(
      layerRows,
      cols,
      rowCount,
      colIndex,
      rowStart,
      floorPositions,
      layerBaseY,
    ),
    end: getLaserWallInnerWorldPoint(
      layerRows,
      cols,
      rowCount,
      colIndex,
      rowEnd,
      floorPositions,
      layerBaseY,
    ),
  };
}

/**
 * L connects to L (beam between two L markers). If a matching E–E pair exists (same span), the whole beam lerps toward those E wall positions.
 */
function collectLaserSegments(
  layerRows,
  cols,
  rowCount,
  layerBaseY,
  floorPositions,
) {
  if (!layerRows || layerRows.length === 0 || rowCount === 0 || cols === 0)
    return [];
  const lPairs = collectMarkerPairs(layerRows, cols, rowCount, LASER_CHAR);
  const ePairs = collectMarkerPairs(layerRows, cols, rowCount, LASER_END_CHAR);
  const segments = [];

  for (const lPair of lPairs) {
    const { start: startL, end: endL } = endpointsForPair(
      layerRows,
      cols,
      rowCount,
      floorPositions,
      layerBaseY,
      lPair,
    );
    const ePair = findMatchingEPair(ePairs, lPair);
    if (ePair) {
      const { start: startE, end: endE } = endpointsForPair(
        layerRows,
        cols,
        rowCount,
        floorPositions,
        layerBaseY,
        ePair,
      );
      segments.push({ startL, endL, startE, endE });
    } else {
      segments.push({ startL, endL, startE: startL, endE: endL });
    }
  }

  return segments;
}

function collectFloorPositions(baseRows, cols, rows, floorChar, playerChar) {
  const floorPositions = [];
  baseRows.forEach((row, rowIndex) => {
    row.split("").forEach((cell, colIndex) => {
      if (cell === floorChar || cell === BUTTON_CHAR || cell === playerChar) {
        floorPositions.push(toWorld(colIndex, rowIndex, cols, rows));
      }
    });
  });
  return floorPositions;
}

function LevelGrid({
  baseRows,
  upperWallLayers,
  roofRows,
  floorChar,
  wallChar,
  playerChar,
  roofChar,
  showDebug,
  roofHeight,
  wallCollisionsEnabled = true,
}) {
  const rows = baseRows.length;
  const cols = rows > 0 ? baseRows[0].length : 0;
  const wallEntries = [];
  const upperWallLayerEntries = [];
  const buttonPositions = [];
  const roofPositions = [];

  const floorPositions = useMemo(
    () => collectFloorPositions(baseRows, cols, rows, floorChar, playerChar),
    [baseRows, cols, rows, floorChar, playerChar],
  );

  const baseLaserSegments = useMemo(
    () => collectLaserSegments(baseRows, cols, rows, LEVEL_FLOOR_Y, floorPositions),
    [baseRows, cols, rows, floorPositions],
  );
  const upperLaserSegments = useMemo(() => {
    const out = [];
    upperWallLayers.forEach((layerRows, layerIndex) => {
      const layerBaseY =
        LEVEL_FLOOR_Y + UPPER_WALL_BASE_Y + layerIndex * WALL_HEIGHT;
      out.push(
        ...collectLaserSegments(
          layerRows,
          cols,
          rows,
          layerBaseY,
          floorPositions,
        ),
      );
    });
    return out;
  }, [upperWallLayers, cols, rows, floorPositions]);
  const [hoveredTileKey, setHoveredTileKey] = useState(null);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const tileMeshMap = useRef(new Map());
  const raycaster = useMemo(() => new Raycaster(), []);

  baseRows.forEach((row, rowIndex) => {
    row.split("").forEach((cell, colIndex) => {
      if (cell === wallChar) {
        wallEntries.push({ rowIndex, colIndex });
      }
      if (cell === BUTTON_CHAR) {
        buttonPositions.push(toWorld(colIndex, rowIndex, cols, rows));
      }
    });
  });

  upperWallLayers.forEach((layerRows, layerIndex) => {
    layerRows.forEach((row, rowIndex) => {
      row.split("").forEach((cell, colIndex) => {
        if (cell === wallChar) {
          upperWallLayerEntries.push({ layerIndex, rowIndex, colIndex });
        }
      });
    });
  });

  roofRows.forEach((row, rowIndex) => {
    row.split("").forEach((cell, colIndex) => {
      if (cell === roofChar) {
        roofPositions.push(toWorld(colIndex, rowIndex, cols, rows));
      }
    });
  });

  const registerTileMesh = (tileKey, mesh) => {
    if (mesh) {
      tileMeshMap.current.set(tileKey, mesh);
    } else {
      tileMeshMap.current.delete(tileKey);
    }
  };

  useEffect(() => {
    const onActiveCameraChanged = (event) => {
      const index = event?.detail?.index;
      if (typeof index === "number") {
        setActiveCameraIndex(index);
      }
    };

    window.addEventListener("active-camera-changed", onActiveCameraChanged);
    return () =>
      window.removeEventListener(
        "active-camera-changed",
        onActiveCameraChanged,
      );
  }, []);

  useFrame(({ camera }) => {
    // Hover raycasts only matter for camera 2; skip in FP to avoid per-frame cost while moving.
    if (activeCameraIndex !== 1) return;

    const tileMeshes = [...tileMeshMap.current.values()];
    if (tileMeshes.length === 0) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(tileMeshes, false);
    const nextHovered =
      hits.length > 0 ? hits[0].object.userData.tileKey : null;

    setHoveredTileKey((prev) => (prev === nextHovered ? prev : nextHovered));
  });

  const roofCeilingY = LEVEL_FLOOR_Y + roofHeight;

  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[0, FLOOR_PHYSICS_CENTER_Y, 0]}>
        <CuboidCollider
          args={[GROUND_PLANE_HALF_EXTENT, 0.05, GROUND_PLANE_HALF_EXTENT]}
          friction={0.8}
          restitution={0}
        />
      </RigidBody>
      {floorPositions.map((position, index) => {
        const tileKey = `floor-${index}`;
        return (
          <FloorTile
            key={tileKey}
            tileKey={tileKey}
            position={position}
            tileSize={TILE_SIZE}
            isHovered={activeCameraIndex === 1 && hoveredTileKey === tileKey}
            onRegister={registerTileMesh}
            showDebug={showDebug}
            collisionsEnabled={false}
          />
        );
      })}
      {wallEntries.map(({ rowIndex, colIndex }) => {
        const wallPos = toWorld(colIndex, rowIndex, cols, rows);
        const transform = getWallTransform(wallPos, floorPositions);
        const wallKey = `wall-${rowIndex}-${colIndex}`;
        return (
          <WallObject
            key={wallKey}
            wallKey={wallKey}
            position={transform.position}
            wallHeight={WALL_HEIGHT}
            tileSize={TILE_SIZE}
            yaw={transform.yaw}
            isHovered={activeCameraIndex === 1 && hoveredTileKey === wallKey}
            onRegister={registerTileMesh}
            showDebug={showDebug}
            collisionsEnabled={wallCollisionsEnabled}
          />
        );
      })}
      {upperWallLayerEntries.map(({ layerIndex, rowIndex, colIndex }) => {
        const wallPos = toWorld(colIndex, rowIndex, cols, rows);
        const transform = getWallTransform(wallPos, floorPositions);
        const wallKey = `wall-upper-${layerIndex}-${rowIndex}-${colIndex}`;
        return (
          <WallObject
            key={wallKey}
            wallKey={wallKey}
            position={transform.position}
            wallHeight={WALL_HEIGHT}
            tileSize={TILE_SIZE}
            yaw={transform.yaw}
            baseY={UPPER_WALL_BASE_Y + layerIndex * WALL_HEIGHT}
            isHovered={activeCameraIndex === 1 && hoveredTileKey === wallKey}
            onRegister={registerTileMesh}
            showDebug={showDebug}
            collisionsEnabled={wallCollisionsEnabled}
          />
        );
      })}
      {baseLaserSegments.map(({ startL, endL, startE, endE }, index) => (
        <LaserObject
          key={`laser-base-${index}`}
          startL={startL}
          endL={endL}
          startE={startE}
          endE={endE}
        />
      ))}
      {upperLaserSegments.map(({ startL, endL, startE, endE }, index) => (
        <LaserObject
          key={`laser-upper-${index}`}
          startL={startL}
          endL={endL}
          startE={startE}
          endE={endE}
        />
      ))}
      {buttonPositions.map((position, index) => (
        <ButtonPillar key={`button-${index}`} position={position} />
      ))}
      {roofPositions.map((position, index) => (
        <RoofObject
          key={`roof-${index}`}
          position={position}
          tileSize={TILE_SIZE}
          ceilingY={roofCeilingY}
        />
      ))}
    </>
  );
}

function findPlayerSpawn(baseRows, playerChar) {
  const rows = baseRows.length;
  const cols = rows > 0 ? baseRows[0].length : 0;
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = baseRows[rowIndex];
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      if (row[colIndex] === playerChar) {
        const [x, , z] = toWorld(colIndex, rowIndex, cols, rows);
        return [x, LEVEL_FLOOR_Y + 0.65, z];
      }
    }
  }
  return [0, LEVEL_FLOOR_Y + 0.65, 0];
}

function Scene() {
  const levelTexts = useMemo(() => [level1Text, level2Text], []);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const { baseRows, upperWallLayers, roofRows } = useMemo(
    () => parseLevelLayers(levelTexts[currentLevelIndex]),
    [levelTexts, currentLevelIndex],
  );
  const roofHeight = useMemo(
    () => WALL_HEIGHT * (1 + upperWallLayers.length),
    [upperWallLayers],
  );
  const playerSpawn = useMemo(
    () => findPlayerSpawn(baseRows, PLAYER_CHAR),
    [baseRows],
  );
  const [showPhysicsDebug, setShowPhysicsDebug] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);

  const advanceToNextLevel = () => {
    setCurrentLevelIndex((prev) => Math.min(prev + 1, levelTexts.length - 1));
    setResetVersion((prev) => prev + 1);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Digit3") {
        setShowPhysicsDebug((prev) => !prev);
      }
      if (event.code === "Digit4") {
        setResetVersion((prev) => prev + 1);
      }
    };

    const onDeathLevelReset = () => {
      setResetVersion((prev) => prev + 1);
    };

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("player-death-level-reset", onDeathLevelReset);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("player-death-level-reset", onDeathLevelReset);
    };
  }, []);

  return (
    <>
      <Physics
        key={resetVersion}
        paused={PHYSICS_PAUSED_FOR_PERF_TEST}
        debug={showPhysicsDebug}
        updateLoop="follow"
        interpolate
        timeStep={1 / 60}
      >
        <PlayerController spawnPosition={playerSpawn} />
        <SceneLighting onFadeComplete={advanceToNextLevel} />
        <TileSpacingGrid />
        {/* <LevelGrid
          baseRows={baseRows}
          upperWallLayers={upperWallLayers}
          roofRows={roofRows}
          floorChar={FLOOR_CHAR}
          wallChar={WALL_CHAR}
          playerChar={PLAYER_CHAR}
          roofChar={ROOF_CHAR}
          showDebug={showPhysicsDebug}
          roofHeight={roofHeight}
          wallCollisionsEnabled={WALL_COLLISIONS_ENABLED}
        /> */}
      </Physics>
    </>
  );
}

export default Scene;
