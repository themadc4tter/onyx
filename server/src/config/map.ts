import fs from "node:fs";
import path from "node:path";

export const DEFAULT_ZONE_ID = "settlement";

const TILE_SIZE = 16;
const DEFAULT_MOB_ID = "orc_scout";
const MAP_DEFINITIONS = {
  settlement: "settlement.tmj",
  east_meadow: "east_meadow.tmj",
  inn: "inn.tmj",
} as const;

const MAP_PATHS = findMapPaths();
const mapMtimeMs: Partial<Record<ZoneId, number>> = {};

type ZoneId = keyof typeof MAP_DEFINITIONS;

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
  width?: number;
  height?: number;
  properties?: Array<{
    name: string;
    type?: string;
    value: unknown;
  }>;
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

export interface HerbSpawn {
  id: string;
  tileX: number;
  tileY: number;
  itemId: string;
}

export interface MobSpawn {
  id: string;
  tileX: number;
  tileY: number;
  mobId: string;
}

export interface ZoneConfig {
  collisionData: number[];
  cols: number;
  rows: number;
  spawn: { x: number; y: number };
  exits: ZoneExit[];
  herbSpawns: HerbSpawn[];
  mobSpawns: MobSpawn[];
}

interface LoadedZone extends Omit<ZoneConfig, "exits"> {
  zoneId: ZoneId;
  entries: Map<string, { x: number; y: number }>;
  exitObjects: TiledObject[];
  herbSpawnObjects: TiledObject[];
  mobSpawnObjects: TiledObject[];
}

function findMapPath(filename: string) {
  const candidates = [
    path.resolve(process.cwd(), `../client/public/assets/maps/${filename}`),
    path.resolve(process.cwd(), `client/public/assets/maps/${filename}`),
  ];

  const mapPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!mapPath) {
    throw new Error(`Could not find ${filename}. Tried: ${candidates.join(", ")}`);
  }

  return mapPath;
}

function findMapPaths() {
  return Object.fromEntries(
    Object.entries(MAP_DEFINITIONS).map(([zoneId, filename]) => [zoneId, findMapPath(filename)]),
  ) as Record<ZoneId, string>;
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

function toTilePosition(object: TiledObject, tiledMap: TiledMap) {
  return {
    x: Math.floor(object.x / tiledMap.tilewidth),
    y: Math.floor(object.y / tiledMap.tileheight),
  };
}

function getExitTiles(object: TiledObject) {
  const width = object.width ?? TILE_SIZE;
  const height = object.height ?? TILE_SIZE;
  const startX = Math.floor(object.x / TILE_SIZE);
  const startY = Math.floor(object.y / TILE_SIZE);
  const endX = Math.ceil((object.x + width) / TILE_SIZE) - 1;
  const endY = Math.ceil((object.y + height) / TILE_SIZE) - 1;
  const tiles: Array<{ x: number; y: number }> = [];

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      tiles.push({ x, y });
    }
  }

  return tiles;
}

function getTargetZoneId(exitObject: TiledObject): ZoneId {
  const target = exitObject.name.replace(/^exit_/, "") as ZoneId;
  if (!MAP_DEFINITIONS[target]) {
    throw new Error(`Exit "${exitObject.name}" points to unknown zone "${target}"`);
  }

  return target;
}

function getStringProperty(object: TiledObject, propertyNames: string[]) {
  const property = object.properties?.find(candidate => propertyNames.includes(candidate.name));
  return typeof property?.value === "string" && property.value.length > 0 ? property.value : null;
}

function loadZone(zoneId: ZoneId): LoadedZone {
  const mapPath = MAP_PATHS[zoneId];
  const tiledMap = JSON.parse(fs.readFileSync(mapPath, "utf8")) as TiledMap;

  const collisionLayer = getTileLayer(tiledMap, "Collision");
  const objectLayer = getObjectLayer(tiledMap, "Objects");
  const spawn = objectLayer.objects.find(object => object.name === "player_spawn" || object.type === "spawn")
    ?? objectLayer.objects.find(object => object.type === "entry" || object.name.startsWith("entry_"));

  if (!spawn) {
    throw new Error(`Tiled map ${path.basename(mapPath)} is missing a "player_spawn" or entry object`);
  }

  if (tiledMap.tilewidth !== TILE_SIZE || tiledMap.tileheight !== TILE_SIZE) {
    throw new Error(`Expected ${TILE_SIZE}x${TILE_SIZE} tiles, got ${tiledMap.tilewidth}x${tiledMap.tileheight}`);
  }

  const entries = new Map<string, { x: number; y: number }>();
  for (const object of objectLayer.objects) {
    if (object.type === "entry" || object.name.startsWith("entry_")) {
      entries.set(object.name, toTilePosition(object, tiledMap));
    }
  }

  return {
    zoneId,
    collisionData: collisionLayer.data,
    cols: tiledMap.width,
    rows: tiledMap.height,
    spawn: toTilePosition(spawn, tiledMap),
    herbSpawns: [],
    mobSpawns: [],
    entries,
    exitObjects: objectLayer.objects.filter(object => object.type === "exit" || object.name.startsWith("exit_")),
    herbSpawnObjects: objectLayer.objects.filter(object => object.type === "herb_spawn"),
    mobSpawnObjects: objectLayer.objects.filter(object => object.type === "mob_spawner"),
  };
}

function buildZoneConfigs() {
  const loadedZones = Object.keys(MAP_DEFINITIONS).map(zoneId => loadZone(zoneId as ZoneId));
  const loadedById = new Map(loadedZones.map(zone => [zone.zoneId, zone]));
  const zones: Record<string, ZoneConfig> = {};

  for (const zone of loadedZones) {
    const exits: ZoneExit[] = [];

    for (const exitObject of zone.exitObjects) {
      const toZoneId = getTargetZoneId(exitObject);
      const targetZone = loadedById.get(toZoneId);
      const destination = targetZone?.entries.get(`entry_${zone.zoneId}`);

      if (!targetZone || !destination) {
        throw new Error(`Exit "${exitObject.name}" in "${zone.zoneId}" is missing destination "entry_${zone.zoneId}"`);
      }

      for (const tile of getExitTiles(exitObject)) {
        exits.push({
          tileX: tile.x,
          tileY: tile.y,
          toZoneId,
          toTileX: destination.x,
          toTileY: destination.y,
        });
      }
    }

    zones[zone.zoneId] = {
      collisionData: zone.collisionData,
      cols: zone.cols,
      rows: zone.rows,
      spawn: zone.spawn,
      exits,
      herbSpawns: zone.herbSpawnObjects.map((object, index) => {
        const position = toTilePosition(object, {
          width: zone.cols,
          height: zone.rows,
          tilewidth: TILE_SIZE,
          tileheight: TILE_SIZE,
          layers: [],
        });

        return {
          id: object.name || `${zone.zoneId}_herb_${index + 1}`,
          tileX: position.x,
          tileY: position.y,
          itemId: "moonleaf",
        };
      }),
      mobSpawns: zone.mobSpawnObjects.map((object, index) => {
        const position = toTilePosition(object, {
          width: zone.cols,
          height: zone.rows,
          tilewidth: TILE_SIZE,
          tileheight: TILE_SIZE,
          layers: [],
        });

        return {
          id: object.name || `${zone.zoneId}_mob_${index + 1}`,
          tileX: position.x,
          tileY: position.y,
          mobId: getStringProperty(object, ["mobId", "mob_id", "mob"]) ?? DEFAULT_MOB_ID,
        };
      }),
    };
  }

  return zones;
}

function getMapMtime(zoneId: ZoneId) {
  return fs.statSync(MAP_PATHS[zoneId]).mtimeMs;
}

function refreshMapMtimes() {
  for (const zoneId of Object.keys(MAP_DEFINITIONS) as ZoneId[]) {
    mapMtimeMs[zoneId] = getMapMtime(zoneId);
  }
}

export const ZONES: Record<string, ZoneConfig> = buildZoneConfigs();
refreshMapMtimes();

function refreshZonesIfChanged() {
  const changedZone = (Object.keys(MAP_DEFINITIONS) as ZoneId[]).find(zoneId => (
    getMapMtime(zoneId) !== mapMtimeMs[zoneId]
  ));
  if (!changedZone) return;

  const nextZones = buildZoneConfigs();
  for (const zoneId of Object.keys(ZONES)) delete ZONES[zoneId];
  Object.assign(ZONES, nextZones);
  refreshMapMtimes();
  console.log(`[map]        reloaded maps after ${path.basename(MAP_PATHS[changedZone])} changed`);
}

export function normalizeZoneId(zoneId: string | null | undefined): string {
  refreshZonesIfChanged();
  if (zoneId && ZONES[zoneId]) return zoneId;
  return DEFAULT_ZONE_ID;
}

export function isTileWalkable(zoneId: string, tileX: number, tileY: number): boolean {
  refreshZonesIfChanged();

  const zone = ZONES[zoneId];
  if (!zone) return false;
  if (tileX < 0 || tileX >= zone.cols || tileY < 0 || tileY >= zone.rows) return false;

  const index = tileY * zone.cols + tileX;
  return zone.collisionData[index] === 0;
}
