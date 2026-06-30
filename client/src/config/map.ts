export const TILE_SIZE = 16;

export const DEFAULT_ZONE_ID = "settlement";

export interface TilesetConfig {
  key: string;
  imageKey: string;
  imageUrl: string;
  name: string;
  sourceKey: string;
  sourceUrl: string;
}

export interface ZoneMapConfig {
  mapKey: string;
  mapUrl: string;
  musicKey: string;
  musicUrl: string;
}

export const ZONE_MAPS: Record<string, ZoneMapConfig> = {
  settlement: {
    mapKey: "settlement-map",
    mapUrl: "assets/maps/settlement.tmj",
    musicKey: "settlement-music",
    musicUrl: "assets/audio/settlement.ogg",
  },
  east_meadow: {
    mapKey: "east-meadow-map",
    mapUrl: "assets/maps/east_meadow.tmj",
    musicKey: "settlement-music",
    musicUrl: "assets/audio/settlement.ogg",
  },
  inn: {
    mapKey: "inn-map",
    mapUrl: "assets/maps/inn.tmj",
    musicKey: "inn-music",
    musicUrl: "assets/audio/inn.ogg",
  },
};

export const TILESETS: TilesetConfig[] = [
  {
    key: "kenney_roguelike.tsx",
    imageKey: "kenney-roguelike",
    imageUrl: "assets/roguelikeSheet_transparent.png",
    name: "roguelikeSheet_transparent",
    sourceKey: "kenney-roguelike-tsx",
    sourceUrl: "assets/tilesets/kenney_roguelike.tsx",
  },
  {
    key: "kenney_roguelikeIndoor.tsx",
    imageKey: "kenney-roguelike-indoor",
    imageUrl: "assets/roguelikeIndoor_transparent.png",
    name: "roguelikeIndoor_transparent",
    sourceKey: "kenney-roguelike-indoor-tsx",
    sourceUrl: "assets/tilesets/kenney_roguelikeIndoor.tsx",
  },
];

export function getZoneMapConfig(zoneId: string) {
  return ZONE_MAPS[zoneId] ?? ZONE_MAPS[DEFAULT_ZONE_ID];
}

export const TILED_RENDER_LAYERS = [
  "Ground",
  "Paths",
  "Water",
  "Buildings",
  "Props",
  "Props2",
] as const;

export const TILED_FOREGROUND_LAYERS = [
  "Foreground",
] as const;

export const TILED_COLLISION_LAYER = "Collision";
export const TILED_OBJECT_LAYER = "Objects";
export const TILED_PLAYER_SPAWN = "player_spawn";
