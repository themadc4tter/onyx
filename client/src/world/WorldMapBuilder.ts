import Phaser from "phaser";
import {
  TILED_COLLISION_LAYER,
  TILED_FOREGROUND_LAYERS,
  TILED_OBJECT_LAYER,
  TILED_OBSTACLE_LAYER,
  TILED_PLAYER_SPAWN,
  TILED_RENDER_LAYERS,
  TILESETS,
  TILE_SIZE,
  type TilesetConfig,
} from "../config/map";
import { getNpcsForZone, type NpcDefinition, type PlacedNpcDefinition } from "./npcs";

interface TiledTilesetReference {
  firstgid: number;
  source?: string;
  name?: string;
  tilewidth?: number;
  tileheight?: number;
  spacing?: number;
  margin?: number;
  tilecount?: number;
  columns?: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
}

interface CachedTiledMap {
  data?: {
    tilesets?: TiledTilesetReference[];
  };
}

export interface BuiltWorldMap {
  map: Phaser.Tilemaps.Tilemap;
  collisionLayer: Phaser.Tilemaps.TilemapLayer | null;
  obstacleLayer: Phaser.Tilemaps.TilemapLayer | null;
}

const FOREGROUND_DEPTH = 21;

export class WorldMapBuilder {
  constructor(private scene: Phaser.Scene) {}

  build(mapKey: string): BuiltWorldMap {
    this.embedExternalTilesets(mapKey);

    const map = this.scene.make.tilemap({ key: mapKey });
    const tilesets = this.getMapTilesetConfigs(mapKey).map(tileset => map.addTilesetImage(
      tileset.name,
      tileset.imageKey,
      TILE_SIZE,
      TILE_SIZE,
      0,
      1,
    ));

    if (tilesets.some(tileset => !tileset)) {
      throw new Error("Missing one or more Tiled tilesets");
    }

    const layerTilesets = tilesets as Phaser.Tilemaps.Tileset[];

    TILED_RENDER_LAYERS.forEach((layerName, index) => {
      map.createLayer(layerName, layerTilesets, 0, 0)?.setDepth(index);
    });

    const collisionLayer = map.createLayer(TILED_COLLISION_LAYER, layerTilesets, 0, 0);
    collisionLayer?.setVisible(false);

    const obstacleLayer = map.createLayer(TILED_OBSTACLE_LAYER, layerTilesets, 0, 0);
    obstacleLayer?.setVisible(false);

    TILED_FOREGROUND_LAYERS.forEach(layerName => {
      map.createLayer(layerName, layerTilesets, 0, 0)?.setDepth(FOREGROUND_DEPTH);
    });

    return { map, collisionLayer, obstacleLayer };
  }

  findSpawnTile(map: Phaser.Tilemaps.Tilemap) {
    const objectLayer = map.getObjectLayer(TILED_OBJECT_LAYER);
    const spawn = objectLayer?.objects.find(object => object.name === TILED_PLAYER_SPAWN);

    return {
      tileX: Math.floor((spawn?.x ?? 0) / TILE_SIZE),
      tileY: Math.floor((spawn?.y ?? 0) / TILE_SIZE),
    };
  }

  getPlacedNpcsForZone(zoneId: string, map: Phaser.Tilemaps.Tilemap): PlacedNpcDefinition[] {
    return getNpcsForZone(zoneId)
      .map(npc => this.resolveNpcPosition(npc, zoneId, map))
      .filter((npc): npc is PlacedNpcDefinition => Boolean(npc));
  }

  private getMapTilesetConfigs(mapKey: string) {
    const cachedMap = this.scene.cache.tilemap.get(mapKey) as CachedTiledMap | undefined;
    const mapTilesets = cachedMap?.data?.tilesets ?? [];
    const tilesetConfigs = mapTilesets
      .map(tileset => TILESETS.find(config => (
        config.name === tileset.name ||
        (tileset.source && config.key === tileset.source.replace(/\\/g, "/").split("/").pop())
      )))
      .filter((tileset): tileset is TilesetConfig => Boolean(tileset));

    return tilesetConfigs.length > 0 ? tilesetConfigs : TILESETS;
  }

  private embedExternalTilesets(mapKey: string) {
    const cachedMap = this.scene.cache.tilemap.get(mapKey) as CachedTiledMap | undefined;
    const tilesets = cachedMap?.data?.tilesets;
    if (!tilesets) return;

    cachedMap.data!.tilesets = tilesets.map(tileset => {
      if (!tileset.source) return tileset;
      const tilesetConfig = this.findTilesetConfig(tileset.source);
      const embeddedTileset = tilesetConfig ? this.readTilesetSource(tilesetConfig) : null;
      if (!embeddedTileset) return tileset;

      return {
        ...tileset,
        ...embeddedTileset,
        firstgid: tileset.firstgid,
        source: undefined,
      };
    });
  }

  private findTilesetConfig(source: string) {
    const sourceFile = source.replace(/\\/g, "/").split("/").pop();
    return TILESETS.find(tileset => tileset.key === sourceFile);
  }

  private readTilesetSource(tileset: TilesetConfig) {
    const tilesetDocument = this.scene.cache.xml.get(tileset.sourceKey);
    const tilesetElement = tilesetDocument?.querySelector("tileset");
    const imageElement = tilesetElement?.querySelector("image");
    if (!tilesetElement || !imageElement) return null;

    return {
      name: tilesetElement.getAttribute("name") ?? tileset.name,
      tilewidth: Number(tilesetElement.getAttribute("tilewidth") ?? TILE_SIZE),
      tileheight: Number(tilesetElement.getAttribute("tileheight") ?? TILE_SIZE),
      spacing: Number(tilesetElement.getAttribute("spacing") ?? 0),
      margin: Number(tilesetElement.getAttribute("margin") ?? 0),
      tilecount: Number(tilesetElement.getAttribute("tilecount") ?? 0),
      columns: Number(tilesetElement.getAttribute("columns") ?? 0),
      image: imageElement.getAttribute("source") ?? tileset.imageUrl,
      imagewidth: Number(imageElement.getAttribute("width") ?? 0),
      imageheight: Number(imageElement.getAttribute("height") ?? 0),
    };
  }

  private resolveNpcPosition(
    npc: NpcDefinition,
    zoneId: string,
    map: Phaser.Tilemaps.Tilemap,
  ): PlacedNpcDefinition | null {
    if (npc.tileX !== undefined && npc.tileY !== undefined) {
      return { ...npc, tileX: npc.tileX, tileY: npc.tileY };
    }

    if (!npc.markerName) return null;

    const objectLayer = map.getObjectLayer(TILED_OBJECT_LAYER);
    const marker = objectLayer?.objects.find(object => object.name === npc.markerName);
    if (!marker) {
      console.warn(`NPC "${npc.id}" could not find marker "${npc.markerName}" in zone "${zoneId}"`);
      return null;
    }

    return {
      ...npc,
      tileX: Math.floor((marker.x ?? 0) / TILE_SIZE),
      tileY: Math.floor((marker.y ?? 0) / TILE_SIZE),
    };
  }
}

