export const TILE_SIZE = 16;

export const DEFAULT_ZONE_ID = "settlement";

export const TILED_MAP_KEY = "settlement-map";
export const TILED_MAP_URL = "assets/maps/settlement.tmj";

export const TILESET_IMAGE_KEY = "kenney-roguelike";
export const TILESET_IMAGE_URL = "assets/roguelikeSheet_transparent.png";
export const TILED_TILESET_NAME = "roguelikeSheet_transparent";

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
