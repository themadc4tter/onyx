import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { KENNEY_TILES, MAP_COLS, MAP_ROWS, SPAWN, TILE, TILE_SIZE, ZONE_MAPS } from "../config/map";
import type { Facing, Position, RemotePlayerData } from "../types";
import { supabase } from "../lib/supabase";

interface Profile { id: string; username: string; }

interface RemotePlayerState {
  container: Phaser.GameObjects.Container;
  graphic: Phaser.GameObjects.Graphics;
  tileX: number;
  tileY: number;
}

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private profile!: Profile;
  private initPlayers: RemotePlayerData[] = [];
  private zoneId: string = "town";
  private startPos: Position | null = null;

  private tileX: number = SPAWN.x;
  private tileY: number = SPAWN.y;
  private facing: Facing = "down";
  private moving = false;

  private playerGraphic!: Phaser.GameObjects.Graphics;
  private playerContainer!: Phaser.GameObjects.Container;
  private remotePlayers = new Map<string, RemotePlayerState>();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<Facing, Phaser.Input.Keyboard.Key>;

  constructor() { super({ key: "GameScene" }); }

  init(data: { socket: Socket; profile: Profile; initPlayers: RemotePlayerData[]; zoneId?: string; startPos?: Position }) {
    this.socket = data.socket;
    this.profile = data.profile;
    this.initPlayers = data.initPlayers ?? [];
    this.zoneId = data.zoneId ?? "town";
    this.startPos = data.startPos ?? null;
    this.remotePlayers = new Map();
    this.moving = false;
  }

  preload() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const barBg = this.add.rectangle(cx, cy, 200, 10, 0x333333).setDepth(10);
    const bar   = this.add.rectangle(cx - 100, cy, 0, 10, 0x00ff88).setOrigin(0, 0.5).setDepth(10);
    const label = this.add.text(cx, cy - 20, "Loading...", { fontSize: "12px", color: "#aaaaaa" }).setOrigin(0.5).setDepth(10);

    this.load.on("progress", (v: number) => { bar.width = 200 * v; });
    this.load.on("complete", () => { barBg.destroy(); bar.destroy(); label.destroy(); });

    this.load.image("tileset", "assets/roguelikeSheet_transparent.png");
  }

  create() {
    const map = ZONE_MAPS[this.zoneId] ?? ZONE_MAPS["town"];
    this.tileX = this.startPos?.tileX ?? SPAWN.x;
    this.tileY = this.startPos?.tileY ?? SPAWN.y;
    this.facing = this.startPos?.facing ?? "down";

    this.buildTilemap(map);
    this.buildPlayer();
    this.setupCamera();
    this.setupInput();
    this.setupServerEvents();

    for (const p of this.initPlayers) this.addRemotePlayer(p);
  }

  // ─── Tilemap ────────────────────────────────────────────────────────────────

  private buildTilemap(mapData: number[][]) {
    // Layer 0 — ground: grass everywhere; paths/exits drawn as path tile.
    // Wall cells still get a grass base because the tree tile is transparent.
    const groundData = mapData.map(row => row.map(v =>
      (v === TILE.PATH || v === TILE.EXIT) ? KENNEY_TILES[TILE.PATH] : KENNEY_TILES[TILE.GRASS]
    ));

    // Layer 1 — objects: tree tile on wall cells, -1 (empty) everywhere else.
    const TREE = KENNEY_TILES[TILE.WALL];
    const objectData = mapData.map(row => row.map(v => v === TILE.WALL ? TREE : -1));

    const addLayer = (data: number[][], depth: number) => {
      const map = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
      map.addTilesetImage("tileset", "tileset", 16, 16, 0, 1);
      map.createLayer(0, "tileset", 0, 0)!.setDepth(depth);
    };

    addLayer(groundData, 0);
    addLayer(objectData, 1); // trees above ground
  }

  // ─── Local player ───────────────────────────────────────────────────────────

  private buildPlayer() {
    this.playerGraphic = this.add.graphics();
    this.drawPlayer();

    const label = this.add
      .text(0, -TILE_SIZE / 2 - 2, this.profile.username, {
        fontSize: "8px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1);

    this.playerContainer = this.add.container(0, 0, [this.playerGraphic, label]);
    this.playerContainer.setDepth(3);
    this.syncContainerToTile();
  }

  private drawPlayerGraphic(graphic: Phaser.GameObjects.Graphics, facing: Facing, bodyColor: number) {
    graphic.clear();
    const hs = TILE_SIZE / 2;

    graphic.fillStyle(bodyColor);
    graphic.fillRect(-hs + 2, -hs + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    graphic.fillStyle(0xffffff);
    const pad = 4;
    switch (facing) {
      case "up":    graphic.fillRect(-2, -hs + pad, 4, 2); break;
      case "down":  graphic.fillRect(-2,  hs - pad - 2, 4, 2); break;
      case "left":  graphic.fillRect(-hs + pad, -2, 2, 4); break;
      case "right": graphic.fillRect( hs - pad - 2, -2, 2, 4); break;
    }
  }

  private drawPlayer() {
    this.drawPlayerGraphic(this.playerGraphic, this.facing, 0x4466cc);
  }

  private syncContainerToTile() {
    this.playerContainer.setPosition(
      this.tileX * TILE_SIZE + TILE_SIZE / 2,
      this.tileY * TILE_SIZE + TILE_SIZE / 2
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
      onComplete: () => { this.moving = false; },
    });
  }

  // ─── Camera ─────────────────────────────────────────────────────────────────

  private setupCamera() {
    const mapWidthPx  = MAP_COLS * TILE_SIZE;
    const mapHeightPx = MAP_ROWS * TILE_SIZE;
    this.cameras.main.setZoom(2);
    this.cameras.main.setBounds(0, 0, mapWidthPx, mapHeightPx);
    this.cameras.main.startFollow(this.playerContainer, true);
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  // ─── Remote players ─────────────────────────────────────────────────────────

  private addRemotePlayer(data: RemotePlayerData) {
    if (this.remotePlayers.has(data.socketId)) return;

    const graphic = this.add.graphics();
    this.drawPlayerGraphic(graphic, data.position.facing, 0xcc7744);

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
        [graphic, label],
      )
      .setDepth(2);

    this.remotePlayers.set(data.socketId, { container, graphic, tileX: data.position.tileX, tileY: data.position.tileY });
  }

  private moveRemotePlayer(socketId: string, tileX: number, tileY: number, facing: Facing) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.tileX = tileX;
    rp.tileY = tileY;
    this.drawPlayerGraphic(rp.graphic, facing, 0xcc7744);
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

  // ─── Server events ──────────────────────────────────────────────────────────

  private setupServerEvents() {
    this.socket.on("move:ack", (pos: Position) => {
      if (pos.tileX !== this.tileX || pos.tileY !== this.tileY) {
        this.tweens.killTweensOf(this.playerContainer);
        this.tileX = pos.tileX;
        this.tileY = pos.tileY;
        this.syncContainerToTile();
      }
      this.facing = pos.facing;
      this.drawPlayer();
      this.moving = false;
    });

    this.socket.on("player:joined", (data: RemotePlayerData) => { this.addRemotePlayer(data); });

    this.socket.on("player:moved", (data: { socketId: string; tileX: number; tileY: number; facing: Facing }) => {
      this.moveRemotePlayer(data.socketId, data.tileX, data.tileY, data.facing);
    });

    this.socket.on("player:left", (data: { socketId: string }) => { this.removeRemotePlayer(data.socketId); });

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
      this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75)
        .setScrollFactor(0).setDepth(20);
      this.add.text(width / 2, height / 2, "Connection lost\nReturning to menu...", {
        fontSize: "14px", color: "#ff4444", align: "center", lineSpacing: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(21);

      await supabase.auth.signOut();
      setTimeout(() => window.location.reload(), 3000);
    });
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  update() {
    if (this.moving) return;

    const JD = Phaser.Input.Keyboard.JustDown;
    let dx = 0, dy = 0, newFacing: Facing | null = null;

    if      (JD(this.cursors.up)    || JD(this.wasd.up))    { dy = -1; newFacing = "up"; }
    else if (JD(this.cursors.down)  || JD(this.wasd.down))  { dy =  1; newFacing = "down"; }
    else if (JD(this.cursors.left)  || JD(this.wasd.left))  { dx = -1; newFacing = "left"; }
    else if (JD(this.cursors.right) || JD(this.wasd.right)) { dx =  1; newFacing = "right"; }

    if (!newFacing) return;

    this.facing = newFacing;

    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    const currentMap = ZONE_MAPS[this.zoneId] ?? ZONE_MAPS["town"];
    if (
      nextX < 0 || nextX >= MAP_COLS ||
      nextY < 0 || nextY >= MAP_ROWS ||
      currentMap[nextY][nextX] === TILE.WALL
    ) {
      this.drawPlayer();
      this.bumpPlayer(dx, dy);
      return;
    }

    this.moving = true;
    this.tileX = nextX;
    this.tileY = nextY;
    this.drawPlayer();

    this.tweens.add({
      targets: this.playerContainer,
      x: nextX * TILE_SIZE + TILE_SIZE / 2,
      y: nextY * TILE_SIZE + TILE_SIZE / 2,
      duration: 120,
      ease: "Linear",
      onComplete: () => { this.moving = false; },
    });

    this.socket.emit("move", { tileX: nextX, tileY: nextY, facing: newFacing });
  }
}
