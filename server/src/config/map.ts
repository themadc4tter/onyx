import fs from "node:fs";
import path from "node:path";

export const DEFAULT_ZONE_ID = "settlement";

const TILE_SIZE = 16;
const MAP_PATH = findSettlementMapPath();
let settlementMapMtimeMs = 0;

interface TiledTileLayer {
  name: string;
  type: "tilelayer";
  width: number;
  height: number;
  data: number[];
}

interface TiledObject {
  name: string;
  type: string;
  x: number;
  y: number;
}

interface TiledObjectLayer {
  name: string;
  type: "objectgroup";
  objects: TiledObject[];
}

type TiledLayer = TiledTileLayer | TiledObjectLayer;

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
}

export interface ZoneExit {
  tileX: number;
  tileY: number;
  toZoneId: string;
  toTileX: number;
  toTileY: number;
}

export interface ZoneConfig {
  collisionData: number[];
  cols: number;
  rows: number;
  spawn: { x: number; y: number };
  exits: ZoneExit[];
}

function findSettlementMapPath() {
  const candidates = [
    path.resolve(process.cwd(), "../client/public/assets/maps/settlement.tmj"),
    path.resolve(process.cwd(), "client/public/assets/maps/settlement.tmj"),
  ];

  const mapPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!mapPath) {
    throw new Error(`Could not find settlement.tmj. Tried: ${candidates.join(", ")}`);
  }

  return mapPath;
}

function getTileLayer(map: TiledMap, name: string) {
  const layer = map.layers.find((candidate): candidate is TiledTileLayer => (
    candidate.type === "tilelayer" && candidate.name === name
  ));

  if (!layer) {
    throw new Error(`Tiled map is missing tile layer "${name}"`);
  }

  return layer;
}

function getObjectLayer(map: TiledMap, name: string) {
  const layer = map.layers.find((candidate): candidate is TiledObjectLayer => (
    candidate.type === "objectgroup" && candidate.name === name
  ));

  if (!layer) {
    throw new Error(`Tiled map is missing object layer "${name}"`);
  }

  return layer;
}

function loadSettlementZone(): ZoneConfig {
  const tiledMap = JSON.parse(fs.readFileSync(MAP_PATH, "utf8")) as TiledMap;

  const collisionLayer = getTileLayer(tiledMap, "Collision");
  const objectLayer = getObjectLayer(tiledMap, "Objects");
  const spawn = objectLayer.objects.find(object => object.name === "player_spawn" || object.type === "spawn");

  if (!spawn) {
    throw new Error('Tiled map is missing a "player_spawn" object');
  }

  if (tiledMap.tilewidth !== TILE_SIZE || tiledMap.tileheight !== TILE_SIZE) {
    throw new Error(`Expected ${TILE_SIZE}x${TILE_SIZE} tiles, got ${tiledMap.tilewidth}x${tiledMap.tileheight}`);
  }

  return {
    collisionData: collisionLayer.data,
    cols: tiledMap.width,
    rows: tiledMap.height,
    spawn: {
      x: Math.floor(spawn.x / tiledMap.tilewidth),
      y: Math.floor(spawn.y / tiledMap.tileheight),
    },
    exits: [],
  };
}

function getSettlementMapMtime() {
  return fs.statSync(MAP_PATH).mtimeMs;
}

function loadTrackedSettlementZone() {
  const zone = loadSettlementZone();
  settlementMapMtimeMs = getSettlementMapMtime();
  return zone;
}

export const ZONES: Record<string, ZoneConfig> = {
  [DEFAULT_ZONE_ID]: loadTrackedSettlementZone(),
};

function refreshSettlementZoneIfChanged() {
  const currentMtimeMs = getSettlementMapMtime();
  if (currentMtimeMs === settlementMapMtimeMs) return;

  ZONES[DEFAULT_ZONE_ID] = loadSettlementZone();
  settlementMapMtimeMs = currentMtimeMs;
  console.log(`[map]        reloaded ${path.basename(MAP_PATH)}`);
}

export function normalizeZoneId(zoneId: string | null | undefined): string {
  refreshSettlementZoneIfChanged();
  if (zoneId && ZONES[zoneId]) return zoneId;
  return DEFAULT_ZONE_ID;
}

export function isTileWalkable(zoneId: string, tileX: number, tileY: number): boolean {
  refreshSettlementZoneIfChanged();

  const zone = ZONES[zoneId];
  if (!zone) return false;
  if (tileX < 0 || tileX >= zone.cols || tileY < 0 || tileY >= zone.rows) return false;

  const index = tileY * zone.cols + tileX;
  return zone.collisionData[index] === 0;
}
