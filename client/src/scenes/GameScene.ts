import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import {
  DEFAULT_ZONE_ID,
  TILED_COLLISION_LAYER,
  TILED_MAP_KEY,
  TILED_MAP_URL,
  TILED_OBJECT_LAYER,
  TILED_PLAYER_SPAWN,
  TILED_RENDER_LAYERS,
  TILED_TILESET_NAME,
  TILESET_IMAGE_KEY,
  TILESET_IMAGE_URL,
  TILE_SIZE,
} from "../config/map";
import type { Facing, Position, RemotePlayerData } from "../types";
import { supabase } from "../lib/supabase";

interface Profile {
  id: string;
  username: string;
}

interface RemotePlayerState {
  container: Phaser.GameObjects.Container;
  tileX: number;
  tileY: number;
}

const PLAYER_SPRITE_KEY = "player-male-tone1";
const PLAYER_SPRITE_URL = "assets/characters/male_tone1.png";

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private profile!: Profile;
  private initPlayers: RemotePlayerData[] = [];
  private zoneId: string = DEFAULT_ZONE_ID;
  private startPos: Position | null = null;

  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;

  private tileX = 0;
  private tileY = 0;
  private facing: Facing = "down";
  private moving = false;

  private playerContainer!: Phaser.GameObjects.Container;
  private remotePlayers = new Map<string, RemotePlayerState>();

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
    this.startPos = data.startPos ?? null;
    this.remotePlayers = new Map();
    this.moving = false;
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

    this.load.tilemapTiledJSON(TILED_MAP_KEY, TILED_MAP_URL);
    this.load.image(TILESET_IMAGE_KEY, TILESET_IMAGE_URL);
    this.load.image(PLAYER_SPRITE_KEY, PLAYER_SPRITE_URL);
  }

  create() {
    this.buildTilemap();

    const spawn = this.findSpawnTile();
    this.tileX = this.startPos?.tileX ?? spawn.tileX;
    this.tileY = this.startPos?.tileY ?? spawn.tileY;
    this.facing = this.startPos?.facing ?? "down";

    this.buildPlayer();
    this.setupCamera();
    this.setupInput();
    this.setupServerEvents();

    for (const p of this.initPlayers) this.addRemotePlayer(p);
  }

  private buildTilemap() {
    this.map = this.make.tilemap({ key: TILED_MAP_KEY });
    const tileset = this.map.addTilesetImage(TILED_TILESET_NAME, TILESET_IMAGE_KEY, TILE_SIZE, TILE_SIZE, 0, 1);
    if (!tileset) {
      throw new Error(`Missing Tiled tileset "${TILED_TILESET_NAME}"`);
    }

    TILED_RENDER_LAYERS.forEach((layerName, index) => {
      this.map.createLayer(layerName, tileset, 0, 0)?.setDepth(index);
    });

    this.collisionLayer = this.map.createLayer(TILED_COLLISION_LAYER, tileset, 0, 0);
    this.collisionLayer?.setVisible(false);
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

    const label = this.add
      .text(0, -TILE_SIZE / 2 - 2, this.profile.username, {
        fontSize: "8px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1);

    this.playerContainer = this.add.container(0, 0, [sprite, label]);
    this.playerContainer.setDepth(20);
    this.syncContainerToTile();
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

    const label = this.add
      .text(0, -TILE_SIZE / 2 - 2, data.username, {
        fontSize: "8px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1);

    const container = this.add
      .container(
        data.position.tileX * TILE_SIZE + TILE_SIZE / 2,
        data.position.tileY * TILE_SIZE + TILE_SIZE / 2,
        [sprite, label],
      )
      .setDepth(19);

    this.remotePlayers.set(data.socketId, { container, tileX: data.position.tileX, tileY: data.position.tileY });
  }

  private moveRemotePlayer(socketId: string, tileX: number, tileY: number, facing: Facing) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.tileX = tileX;
    rp.tileY = tileY;
    this.tweens.add({
      targets: rp.container,
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2,
      duration: 120,
      ease: "Linear",
    });
  }

  private removeRemotePlayer(socketId: string) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.container.destroy(true);
    this.remotePlayers.delete(socketId);
  }

  private setupServerEvents() {
    this.socket.on("move:ack", (pos: Position) => {
      if (pos.tileX !== this.tileX || pos.tileY !== this.tileY) {
        this.tweens.killTweensOf(this.playerContainer);
        this.tileX = pos.tileX;
        this.tileY = pos.tileY;
        this.syncContainerToTile();
      }
      this.facing = pos.facing;
      this.moving = false;
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
    if (this.moving) return;

    const justDown = Phaser.Input.Keyboard.JustDown;
    let dx = 0;
    let dy = 0;
    let newFacing: Facing | null = null;

    if (justDown(this.cursors.up) || justDown(this.wasd.up)) {
      dy = -1;
      newFacing = "up";
    } else if (justDown(this.cursors.down) || justDown(this.wasd.down)) {
      dy = 1;
      newFacing = "down";
    } else if (justDown(this.cursors.left) || justDown(this.wasd.left)) {
      dx = -1;
      newFacing = "left";
    } else if (justDown(this.cursors.right) || justDown(this.wasd.right)) {
      dx = 1;
      newFacing = "right";
    }

    if (!newFacing) return;

    this.facing = newFacing;

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

    this.tweens.add({
      targets: this.playerContainer,
      x: nextX * TILE_SIZE + TILE_SIZE / 2,
      y: nextY * TILE_SIZE + TILE_SIZE / 2,
      duration: 120,
      ease: "Linear",
      onComplete: () => {
        this.moving = false;
      },
    });

    this.socket.emit("move", { tileX: nextX, tileY: nextY, facing: newFacing });
  }
}
