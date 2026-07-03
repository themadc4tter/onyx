export interface TilePosition {
  tileX: number;
  tileY: number;
}

export type MobPathResult =
  | {
      kind: "attack_position";
      path: TilePosition[];
    }
  | {
      kind: "closest_reachable";
      path: TilePosition[];
    }
  | {
      kind: "stuck";
      path: [];
    };

export interface MobPathfindingOptions {
  start: TilePosition;
  target: TilePosition;
  attackRange: number;
  bounds: {
    cols: number;
    rows: number;
  };
  isBlocked: (tileX: number, tileY: number) => boolean;
  maxVisitedTiles?: number;
}

const DEFAULT_MAX_VISITED_TILES = 600;
const CARDINAL_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function findMobPath(options: MobPathfindingOptions): MobPathResult {
  const maxVisitedTiles = options.maxVisitedTiles ?? DEFAULT_MAX_VISITED_TILES;
  const startKey = getTileKey(options.start.tileX, options.start.tileY);
  const queue: TilePosition[] = [options.start];
  const visited = new Set<string>([startKey]);
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  let bestReachable = options.start;
  let bestDistance = getTileDistance(options.start, options.target);

  for (let index = 0; index < queue.length && visited.size <= maxVisitedTiles; index += 1) {
    const current = queue[index];

    if (isAttackPosition(current, options.target, options.attackRange)) {
      return {
        kind: "attack_position",
        path: buildPath(current, cameFrom),
      };
    }

    const distance = getTileDistance(current, options.target);
    if (distance < bestDistance) {
      bestReachable = current;
      bestDistance = distance;
    }

    for (const direction of CARDINAL_DIRECTIONS) {
      const next = {
        tileX: current.tileX + direction.x,
        tileY: current.tileY + direction.y,
      };
      const nextKey = getTileKey(next.tileX, next.tileY);
      if (
        visited.has(nextKey) ||
        !isInsideBounds(next, options.bounds) ||
        options.isBlocked(next.tileX, next.tileY)
      ) {
        continue;
      }

      visited.add(nextKey);
      cameFrom.set(nextKey, getTileKey(current.tileX, current.tileY));
      queue.push(next);
    }
  }

  const fallbackPath = buildPath(bestReachable, cameFrom);
  if (fallbackPath.length === 0) return { kind: "stuck", path: [] };

  return {
    kind: "closest_reachable",
    path: fallbackPath,
  };
}

function isAttackPosition(position: TilePosition, target: TilePosition, attackRange: number) {
  if (position.tileX === target.tileX && position.tileY === target.tileY) return false;

  return (
    Math.max(
      Math.abs(position.tileX - target.tileX),
      Math.abs(position.tileY - target.tileY),
    ) <= attackRange
  );
}

function isInsideBounds(position: TilePosition, bounds: MobPathfindingOptions["bounds"]) {
  return (
    position.tileX >= 0 &&
    position.tileX < bounds.cols &&
    position.tileY >= 0 &&
    position.tileY < bounds.rows
  );
}

function buildPath(destination: TilePosition, cameFrom: Map<string, string | null>) {
  const path: TilePosition[] = [];
  let currentKey: string | null = getTileKey(destination.tileX, destination.tileY);

  while (currentKey) {
    const previousKey = cameFrom.get(currentKey);
    if (previousKey === undefined) return [];
    if (previousKey === null) break;

    path.push(fromTileKey(currentKey));
    currentKey = previousKey;
  }

  path.reverse();
  return path;
}

function getTileDistance(from: TilePosition, to: TilePosition) {
  return Math.hypot(from.tileX - to.tileX, from.tileY - to.tileY);
}

function getTileKey(tileX: number, tileY: number) {
  return `${tileX},${tileY}`;
}

function fromTileKey(key: string): TilePosition {
  const [tileX, tileY] = key.split(",").map(Number);
  return { tileX, tileY };
}
