import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import {
  DEFAULT_ZONE_ID,
  getZoneMapConfig,
  TILED_COLLISION_LAYER,
  TILED_FOREGROUND_LAYERS,
  TILED_OBJECT_LAYER,
  TILED_PLAYER_SPAWN,
  TILED_RENDER_LAYERS,
  TILESETS,
  TILE_SIZE,
  type TilesetConfig,
} from "../config/map";
import type { Facing, Position, RemotePlayerData } from "../types";
import { supabase } from "../lib/supabase";
import { NpcRenderer } from "../world/NpcRenderer";
import { getNpcsForZone, type NpcDefinition, type PlacedNpcDefinition } from "../world/npcs";
import { WorldLabelOverlay, type WorldLabelHandle } from "../ui/WorldLabelOverlay";

interface Profile {
  id: string;
  username: string;
}

interface RemotePlayerState {
  container: Phaser.GameObjects.Container;
  nameLabel: WorldLabelHandle;
  tileX: number;
  tileY: number;
  moveQueue: Position[];
  moving: boolean;
}

interface PredictedMove extends Position {
  seq: number;
}

interface MoveAck {
  seq: number;
  position: Position;
}

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

const PLAYER_SPRITE_KEY = "player-male-tone1";
const PLAYER_SPRITE_URL = "assets/characters/male_tone1.png";
const NAME_LABEL_FONT_SIZE = 13;
const FOREGROUND_DEPTH = 21;
const LOCAL_MOVE_DURATION_MS = 120;
const REMOTE_MOVE_DURATION_MS = 120;
const MAX_QUEUED_DIRECTIONS = 3;

const DIRECTION_VECTORS: Record<Facing, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private profile!: Profile;
  private initPlayers: RemotePlayerData[] = [];
  private zoneId: string = DEFAULT_ZONE_ID;
  private startPos: Position | null = null;
  private mapKey = getZoneMapConfig(DEFAULT_ZONE_ID).mapKey;

  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;

  private tileX = 0;
  private tileY = 0;
  private facing: Facing = "down";
  private moving = false;
  private queuedDirections: Facing[] = [];
  private nextMoveSeq = 1;
  private pendingMoves: PredictedMove[] = [];

  private playerContainer!: Phaser.GameObjects.Container;
  private labelOverlay!: WorldLabelOverlay;
  private remotePlayers = new Map<string, RemotePlayerState>();
  private npcRenderer!: NpcRenderer;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<Facing, Phaser.Input.Keyboard.Key>;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { socket: Socket; profile: Profile; initPlayers: RemotePlayerData[]; zoneId?: string; startPos?: Position }) {
    this.socket = data.socket;
    this.profile = data.profile;
    this.initPlayers = data.initPlayers ?? [];
    this.zoneId = data.zoneId ?? DEFAULT_ZONE_ID;
    this.mapKey = getZoneMapConfig(this.zoneId).mapKey;
    this.startPos = data.startPos ?? null;
    this.remotePlayers = new Map();
    this.moving = false;
    this.queuedDirections = [];
    this.nextMoveSeq = 1;
    this.pendingMoves = [];
  }

  preload() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const barBg = this.add.rectangle(cx, cy, 200, 10, 0x333333).setDepth(10);
    const bar = this.add.rectangle(cx - 100, cy, 0, 10, 0x00ff88).setOrigin(0, 0.5).setDepth(10);
    const label = this.add.text(cx, cy - 20, "Loading...", { fontSize: "12px", color: "#aaaaaa" }).setOrigin(0.5).setDepth(10);

    this.load.on("progress", (v: number) => {
      bar.width = 200 * v;
    });
    this.load.on("complete", () => {
      barBg.destroy();
      bar.destroy();
      label.destroy();
    });

    const zoneMap = getZoneMapConfig(this.zoneId);
    this.mapKey = zoneMap.mapKey;

    this.load.tilemapTiledJSON(zoneMap.mapKey, zoneMap.mapUrl);
    for (const tileset of TILESETS) {
      this.load.xml(tileset.sourceKey, tileset.sourceUrl);
      this.load.image(tileset.imageKey, tileset.imageUrl);
    }
    this.load.image(PLAYER_SPRITE_KEY, PLAYER_SPRITE_URL);
    for (const npc of getNpcsForZone(this.zoneId)) {
      if (!this.textures.exists(npc.spriteKey)) {
        this.load.image(npc.spriteKey, npc.spriteUrl);
      }
    }
  }

  create() {
    this.buildTilemap();

    const spawn = this.findSpawnTile();
    this.tileX = this.startPos?.tileX ?? spawn.tileX;
    this.tileY = this.startPos?.tileY ?? spawn.tileY;
    this.facing = this.startPos?.facing ?? "down";

    this.labelOverlay = new WorldLabelOverlay(this);
    this.buildPlayer();
    this.buildNpcs();
    this.setupCamera();
    this.setupInput();
    this.setupServerEvents();

    for (const p of this.initPlayers) this.addRemotePlayer(p);
  }

  private buildTilemap() {
    this.embedExternalTilesets();

    this.map = this.make.tilemap({ key: this.mapKey });
    const tilesets = this.getMapTilesetConfigs().map(tileset => this.map.addTilesetImage(
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
      this.map.createLayer(layerName, layerTilesets, 0, 0)?.setDepth(index);
    });

    this.collisionLayer = this.map.createLayer(TILED_COLLISION_LAYER, layerTilesets, 0, 0);
    this.collisionLayer?.setVisible(false);

    TILED_FOREGROUND_LAYERS.forEach(layerName => {
      this.map.createLayer(layerName, layerTilesets, 0, 0)?.setDepth(FOREGROUND_DEPTH);
    });
  }

  private getMapTilesetConfigs() {
    const cachedMap = this.cache.tilemap.get(this.mapKey) as CachedTiledMap | undefined;
    const mapTilesets = cachedMap?.data?.tilesets ?? [];
    const tilesetConfigs = mapTilesets
      .map(tileset => TILESETS.find(config => (
        config.name === tileset.name ||
        (tileset.source && config.key === tileset.source.replace(/\\/g, "/").split("/").pop())
      )))
      .filter((tileset): tileset is TilesetConfig => Boolean(tileset));

    return tilesetConfigs.length > 0 ? tilesetConfigs : TILESETS;
  }

  private embedExternalTilesets() {
    const cachedMap = this.cache.tilemap.get(this.mapKey) as CachedTiledMap | undefined;
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
    const tilesetDocument = this.cache.xml.get(tileset.sourceKey);
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

  private findSpawnTile() {
    const objectLayer = this.map.getObjectLayer(TILED_OBJECT_LAYER);
    const spawn = objectLayer?.objects.find(object => object.name === TILED_PLAYER_SPAWN);

    return {
      tileX: Math.floor((spawn?.x ?? 0) / TILE_SIZE),
      tileY: Math.floor((spawn?.y ?? 0) / TILE_SIZE),
    };
  }

  private buildPlayer() {
    const sprite = this.add.image(0, 0, PLAYER_SPRITE_KEY);

    this.playerContainer = this.add.container(0, 0, [sprite]);
    this.playerContainer.setDepth(20);
    this.syncContainerToTile();
    this.createNameLabel(this.playerContainer, this.profile.username);
  }

  private buildNpcs() {
    this.npcRenderer = new NpcRenderer(this, this.labelOverlay);
    this.npcRenderer.render(this.getPlacedNpcsForZone());
  }

  private getPlacedNpcsForZone(): PlacedNpcDefinition[] {
    return getNpcsForZone(this.zoneId)
      .map(npc => this.resolveNpcPosition(npc))
      .filter((npc): npc is PlacedNpcDefinition => Boolean(npc));
  }

  private resolveNpcPosition(npc: NpcDefinition): PlacedNpcDefinition | null {
    if (npc.tileX !== undefined && npc.tileY !== undefined) {
      return { ...npc, tileX: npc.tileX, tileY: npc.tileY };
    }

    if (!npc.markerName) return null;

    const objectLayer = this.map.getObjectLayer(TILED_OBJECT_LAYER);
    const marker = objectLayer?.objects.find(object => object.name === npc.markerName);
    if (!marker) {
      console.warn(`NPC "${npc.id}" could not find marker "${npc.markerName}" in zone "${this.zoneId}"`);
      return null;
    }

    return {
      ...npc,
      tileX: Math.floor((marker.x ?? 0) / TILE_SIZE),
      tileY: Math.floor((marker.y ?? 0) / TILE_SIZE),
    };
  }

  private createNameLabel(target: Phaser.GameObjects.Container, username: string) {
    return this.labelOverlay.addLabel({
      target,
      text: username,
      offsetY: -TILE_SIZE / 2 - 2,
      color: "#ffffff",
      fontSize: NAME_LABEL_FONT_SIZE,
      className: "world-label-name",
    });
  }

  private syncContainerToTile() {
    this.playerContainer.setPosition(
      this.tileX * TILE_SIZE + TILE_SIZE / 2,
      this.tileY * TILE_SIZE + TILE_SIZE / 2,
    );
  }

  private bumpPlayer(dx: number, dy: number) {
    const originX = this.tileX * TILE_SIZE + TILE_SIZE / 2;
    const originY = this.tileY * TILE_SIZE + TILE_SIZE / 2;
    this.moving = true;
    this.tweens.add({
      targets: this.playerContainer,
      x: originX + dx * 3,
      y: originY + dy * 3,
      duration: 60,
      ease: "Power1",
      yoyo: true,
      onComplete: () => {
        this.moving = false;
        this.tryQueuedMove();
      },
    });
  }

  private setupCamera() {
    this.cameras.main.setZoom(2);
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.startFollow(this.playerContainer, true);
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  private addRemotePlayer(data: RemotePlayerData) {
    if (this.remotePlayers.has(data.socketId)) return;

    const sprite = this.add.image(0, 0, PLAYER_SPRITE_KEY);

    const container = this.add
      .container(
        data.position.tileX * TILE_SIZE + TILE_SIZE / 2,
        data.position.tileY * TILE_SIZE + TILE_SIZE / 2,
        [sprite],
      )
      .setDepth(19);
    const nameLabel = this.createNameLabel(container, data.username);

    this.remotePlayers.set(data.socketId, {
      container,
      nameLabel,
      tileX: data.position.tileX,
      tileY: data.position.tileY,
      moveQueue: [],
      moving: false,
    });
  }

  private moveRemotePlayer(socketId: string, tileX: number, tileY: number, facing: Facing) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.moveQueue.push({ tileX, tileY, facing });
    this.playNextRemoteMove(rp);
  }

  private playNextRemoteMove(rp: RemotePlayerState) {
    if (rp.moving) return;

    const next = rp.moveQueue.shift();
    if (!next) return;

    rp.moving = true;
    rp.tileX = next.tileX;
    rp.tileY = next.tileY;
    this.tweens.add({
      targets: rp.container,
      x: next.tileX * TILE_SIZE + TILE_SIZE / 2,
      y: next.tileY * TILE_SIZE + TILE_SIZE / 2,
      duration: REMOTE_MOVE_DURATION_MS,
      ease: "Linear",
      onComplete: () => {
        rp.moving = false;
        this.playNextRemoteMove(rp);
      },
    });
  }

  private removeRemotePlayer(socketId: string) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.nameLabel.destroy();
    rp.container.destroy(true);
    this.remotePlayers.delete(socketId);
  }

  private setupServerEvents() {
    this.socket.on("move:ack", (ack: MoveAck | Position) => {
      const normalizedAck = this.normalizeMoveAck(ack);
      if (!normalizedAck) return;

      this.reconcileMoveAck(normalizedAck);
    });

    this.socket.on("player:joined", (data: RemotePlayerData) => {
      this.addRemotePlayer(data);
    });

    this.socket.on("player:moved", (data: { socketId: string; tileX: number; tileY: number; facing: Facing }) => {
      this.moveRemotePlayer(data.socketId, data.tileX, data.tileY, data.facing);
    });

    this.socket.on("player:left", (data: { socketId: string }) => {
      this.removeRemotePlayer(data.socketId);
    });

    this.socket.on("zone:changed", (payload: { zoneId: string; position: Position; initPlayers: RemotePlayerData[] }) => {
      this.socket.removeAllListeners();
      this.scene.restart({
        socket: this.socket,
        profile: this.profile,
        initPlayers: payload.initPlayers,
        zoneId: payload.zoneId,
        startPos: payload.position,
      });
    });

    this.socket.on("disconnect", async () => {
      const { width, height } = this.scale;
      this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setScrollFactor(0).setDepth(30);
      this.add
        .text(width / 2, height / 2, "Connection lost\nReturning to menu...", {
          fontSize: "14px",
          color: "#ff4444",
          align: "center",
          lineSpacing: 6,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(31);

      await supabase.auth.signOut();
      setTimeout(() => window.location.reload(), 3000);
    });
  }

  update() {
    const pressedDirection = this.readPressedDirection();
    const direction = pressedDirection ?? this.readHeldDirection();

    if (this.moving) {
      if (pressedDirection) this.queueDirection(pressedDirection);
      return;
    }

    if (!direction) return;

    this.startLocalMove(direction);
  }

  private readPressedDirection(): Facing | null {
    const justDown = Phaser.Input.Keyboard.JustDown;

    if (justDown(this.cursors.up) || justDown(this.wasd.up)) return "up";
    if (justDown(this.cursors.down) || justDown(this.wasd.down)) return "down";
    if (justDown(this.cursors.left) || justDown(this.wasd.left)) return "left";
    if (justDown(this.cursors.right) || justDown(this.wasd.right)) return "right";

    return null;
  }

  private readHeldDirection(): Facing | null {
    if (this.cursors.up.isDown || this.wasd.up.isDown) return "up";
    if (this.cursors.down.isDown || this.wasd.down.isDown) return "down";
    if (this.cursors.left.isDown || this.wasd.left.isDown) return "left";
    if (this.cursors.right.isDown || this.wasd.right.isDown) return "right";

    return null;
  }

  private queueDirection(direction: Facing) {
    if (this.queuedDirections.length >= MAX_QUEUED_DIRECTIONS) {
      this.queuedDirections.shift();
    }
    this.queuedDirections.push(direction);
  }

  private startLocalMove(newFacing: Facing) {
    this.facing = newFacing;

    const { dx, dy } = DIRECTION_VECTORS[newFacing];
    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    if (
      nextX < 0 ||
      nextX >= this.map.width ||
      nextY < 0 ||
      nextY >= this.map.height ||
      this.collisionLayer?.hasTileAt(nextX, nextY)
    ) {
      this.bumpPlayer(dx, dy);
      return;
    }

    this.moving = true;
    this.tileX = nextX;
    this.tileY = nextY;

    const predictedMove: PredictedMove = {
      seq: this.nextMoveSeq++,
      tileX: nextX,
      tileY: nextY,
      facing: newFacing,
    };
    this.pendingMoves.push(predictedMove);

    this.tweens.add({
      targets: this.playerContainer,
      x: nextX * TILE_SIZE + TILE_SIZE / 2,
      y: nextY * TILE_SIZE + TILE_SIZE / 2,
      duration: LOCAL_MOVE_DURATION_MS,
      ease: "Linear",
      onComplete: () => {
        this.moving = false;
        this.tryQueuedMove();
      },
    });

    this.socket.emit("move", predictedMove);
  }

  private tryQueuedMove() {
    if (this.moving) return;

    const direction = this.queuedDirections.shift() ?? this.readHeldDirection();
    if (!direction) return;

    this.startLocalMove(direction);
  }

  private normalizeMoveAck(ack: MoveAck | Position): MoveAck | null {
    if ("position" in ack) return ack;

    const matchingMove = this.pendingMoves.find(move => move.tileX === ack.tileX && move.tileY === ack.tileY);
    if (!matchingMove) return null;

    return {
      seq: matchingMove.seq,
      position: ack,
    };
  }

  private reconcileMoveAck(ack: MoveAck) {
    const acknowledgedMove = this.pendingMoves.find(move => move.seq === ack.seq);
    this.pendingMoves = this.pendingMoves.filter(move => move.seq > ack.seq);

    if (
      acknowledgedMove &&
      (ack.position.tileX !== acknowledgedMove.tileX ||
        ack.position.tileY !== acknowledgedMove.tileY ||
        ack.position.facing !== acknowledgedMove.facing)
    ) {
      this.correctLocalPosition(ack.position);
      return;
    }

    this.facing = ack.position.facing;
  }

  private correctLocalPosition(position: Position) {
    this.tweens.killTweensOf(this.playerContainer);
    this.tileX = position.tileX;
    this.tileY = position.tileY;
    this.facing = position.facing;
    this.moving = false;
    this.queuedDirections = [];
    this.pendingMoves = [];
    this.syncContainerToTile();
  }
}
